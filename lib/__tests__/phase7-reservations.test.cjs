/**
 * Phase 7 Reservations: time validation, public request safeguards, status
 * transitions, token cancellation, migration permissions, and graceful fallback.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
  const output = ts.transpileModule(raw, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const state = {};
function resetState() {
  Object.assign(state, {
    rateAllowed: true,
    phoneRateAllowed: true,
    featureEnabled: true,
    approval: { status: "approved" },
    canTakeOrders: true,
    user: { id: "user-1" },
    access: true,
    accessCalls: [],
    adminFactoryCalls: 0,
  });
}
resetState();

const stubs = {
  "next/cache": { revalidatePath: () => {} },
  "next/headers": { headers: async () => ({ get: (key) => (key === "x-real-ip" ? "192.0.2.20" : null) }) },
  "@/lib/auth": { getCurrentUser: async () => state.user },
  "@/lib/entity-auth": {
    checkTenantAccess: async (userId, organizerId, roles) => {
      state.accessCalls.push({ userId, organizerId, roles });
      return { hasAccess: state.access };
    },
  },
  "@/lib/supabase-admin": {
    createSupabaseAdmin: () => {
      state.adminFactoryCalls += 1;
      return state.adminFromFactory;
    },
  },
  "@/lib/rate-limit": {
    checkRateLimit: async (name, identifier) => {
      state.rateLimitCalls = [...(state.rateLimitCalls || []), { name, identifier }];
      const allowed = name === "reservationRequestPhone" ? state.phoneRateAllowed : state.rateAllowed;
      return { allowed, remaining: allowed ? 10 : 0, retryAfter: 60 };
    },
  },
  "@/lib/business-taxonomy": { getCapabilitiesForBusiness: () => ["TABLES"] },
  "@/lib/storefront-features": {
    getBuiltStorefrontFeatures: () => ({ reservations: true }),
    resolveStorefrontFeatures: () => ({ reservations: state.featureEnabled }),
  },
  "@/lib/website-v2-theme": { getV2TemplateForWebsite: () => ({ id: "template" }) },
  "@/lib/website-content": { normalizeContent: (content) => content || {} },
  "@/lib/order-phone": {
    isValidPhoneNumber: (phone) => typeof phone === "string" && phone.length > 0,
    normalizePhone: () => "+15555550100",
  },
  "@/lib/server-approval": { getOrgApproval: async () => state.approval },
  "@/lib/business-approval": { canTakeOrders: () => state.canTakeOrders },
  "@/lib/reservation-notifications": {
    dispatchReservationNotifications: async () => {},
    dispatchCustomerReservationStatusEmail: async () => {},
    notifyOwnerReservationCancelled: async () => {},
  },
};

const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
  return originalLoad.call(this, request, parent, isMain);
};

const {
  submitReservationRequestWithClient,
  updateReservationStatus,
  updateReservationStatusWithClient,
  cancelReservationByTokenWithClient,
  saveReservationSettingsWithClient,
} = require(path.join(ROOT, "lib/actions/reservations.ts"));
const { getRawReservationSlotsForDate, validateReservationStartsAt } = require(path.join(ROOT, "lib/reservation-slots.ts"));

function makeAdmin(resolveQuery) {
  const queries = [];
  return {
    queries,
    from(table) {
      const query = { table, op: "select", filters: [], payload: null, columns: null };
      const finish = () => {
        queries.push(query);
        return resolveQuery(query);
      };
      const builder = {
        select(columns) {
          query.columns = columns;
          return builder;
        },
        insert(payload) {
          query.op = "insert";
          query.payload = payload;
          return builder;
        },
        update(payload) {
          query.op = "update";
          query.payload = payload;
          return builder;
        },
        eq(column, value) {
          query.filters.push({ op: "eq", column, value });
          return builder;
        },
        in(column, value) {
          query.filters.push({ op: "in", column, value });
          return builder;
        },
        gte(column, value) {
          query.filters.push({ op: "gte", column, value });
          return builder;
        },
        lte(column, value) {
          query.filters.push({ op: "lte", column, value });
          return builder;
        },
        order() {
          return builder;
        },
        limit(value) {
          query.limit = value;
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(finish());
        },
        then(resolve, reject) {
          return Promise.resolve(finish()).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const website = {
  id: "website-internal-id",
  tenant_id: "org-1",
  slug: "demo",
  status: "published",
  metadata: {
    timezone: "UTC",
    storefront: { reservations: { enabled: true, min_lead_minutes: 60, max_days_ahead: 30, slot_minutes: 30 } },
  },
};
const business = {
  id: "business-internal-id",
  industry: "food",
  category: "restaurant",
  business_type: "restaurant",
  offerings: ["table_reservations"],
};
const allDayHours = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, { open: "00:00", close: "23:59" }])
);

function makeSubmitAdmin({ missingReservationTable = false, pendingRows = [], duplicateResult = null, inserted } = {}) {
  return makeAdmin((query) => {
    if (query.table === "tenant_websites") return { data: website, error: null };
    if (query.table === "businesses") return { data: business, error: null };
    if (query.table === "website_content") return { data: { content: { hours: allDayHours } }, error: null };
    if (query.table === "reservations" && query.op === "insert") {
      return {
        data: inserted || { reservation_number: "RES-261015-1234", lookup_token: "a".repeat(48) },
        error: null,
      };
    }
    if (query.table === "reservations" && query.filters.some((f) => f.op === "in" && f.column === "status")) {
      return missingReservationTable
        ? { data: null, error: { code: "42P01", message: "relation reservations does not exist" } }
        : { data: duplicateResult, error: null };
    }
    if (query.table === "reservations" && query.filters.some((f) => f.op === "eq" && f.column === "status" && f.value === "pending")) {
      return { data: pendingRows, error: null };
    }
    return { data: null, error: null };
  });
}

function submitInput(extra = {}) {
  const twoDaysAhead = new Date(Date.now() + 2 * 86_400_000);
  twoDaysAhead.setUTCHours(12, 0, 0, 0);
  return {
    slug: "demo",
    customerName: "Guest Name",
    customerPhone: "+1 555 555 0100",
    customerEmail: null,
    partySize: 2,
    startsAt: twoDaysAhead.toISOString(),
    ...extra,
  };
}

function reservationRow(overrides = {}) {
  return {
    id: "reservation-internal-id",
    reservation_number: "RES-261015-1234",
    customer_name: "Guest Name",
    customer_email: null,
    customer_phone: "+15555550100",
    party_size: 2,
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    status: "pending",
    status_history: [],
    website_id: null,
    lookup_token: "b".repeat(48),
    organizer_id: "org-1",
    ...overrides,
  };
}

function makeStatusAdmin({ updateResult = { data: { id: "reservation-internal-id", status: "cancelled" }, error: null } } = {}) {
  const row = reservationRow();
  return makeAdmin((query) => {
    if (query.table === "reservations" && query.op === "select" && !query.filters.some((f) => f.column === "starts_at")) {
      return { data: row, error: null };
    }
    if (query.table === "reservations" && query.op === "update") return updateResult;
    return { data: null, error: null };
  });
}

test("honeypot and rate limits stop public requests before database access", async () => {
  resetState();
  const honeypotAdmin = makeSubmitAdmin();
  const honeypot = await submitReservationRequestWithClient(submitInput({ hp: "bot" }), honeypotAdmin);
  assert.equal(honeypot.success, false);
  assert.equal(honeypot.error, "invalid_submission");
  assert.equal(honeypotAdmin.queries.length, 0);

  resetState();
  state.rateAllowed = false;
  const limitedAdmin = makeSubmitAdmin();
  const limited = await submitReservationRequestWithClient(submitInput(), limitedAdmin);
  assert.equal(limited.success, false);
  assert.equal(limited.error, "rate_limited");
  assert.equal(limitedAdmin.queries.length, 0);
  assert.deepEqual(state.rateLimitCalls.map((call) => call.name), ["reservationRequestIp"]);

  resetState();
  state.phoneRateAllowed = false;
  const phoneLimitedAdmin = makeSubmitAdmin();
  const phoneLimited = await submitReservationRequestWithClient(submitInput(), phoneLimitedAdmin);
  assert.equal(phoneLimited.success, false);
  assert.equal(phoneLimited.error, "rate_limited");
  assert.equal(phoneLimitedAdmin.queries.length, 0);
  assert.deepEqual(state.rateLimitCalls.map((call) => call.name), [
    "reservationRequestIp",
    "reservationRequestIp",
    "reservationRequestPhone",
  ]);
});

test("feature and approval gates return the same neutral public message", async () => {
  resetState();
  state.featureEnabled = false;
  const featureResult = await submitReservationRequestWithClient(submitInput(), makeSubmitAdmin());

  resetState();
  state.canTakeOrders = false;
  state.approval = { status: "pending_review" };
  const approvalResult = await submitReservationRequestWithClient(submitInput(), makeSubmitAdmin());

  assert.equal(featureResult.success, false);
  assert.equal(approvalResult.success, false);
  assert.equal(featureResult.message, "Reservations are not available yet.");
  assert.equal(approvalResult.message, featureResult.message);
  assert.doesNotMatch(JSON.stringify(approvalResult), /pending_review|approved|rejected/i);
});

test("an unapplied reservations table degrades to the neutral unavailable result", async () => {
  resetState();
  const result = await submitReservationRequestWithClient(
    submitInput(),
    makeSubmitAdmin({ missingReservationTable: true })
  );
  assert.equal(result.success, false);
  assert.equal(result.error, "reservations_unavailable");
  assert.equal(result.message, "Reservations are not available yet.");
});

test("successful public submission returns only the reservation reference and token", async () => {
  resetState();
  const admin = makeSubmitAdmin();
  const result = await submitReservationRequestWithClient(submitInput(), admin);
  assert.equal(result.success, true);
  assert.deepEqual(Object.keys(result).sort(), ["lookupToken", "reservationNumber", "success"]);
  assert.equal(result.lookupToken, "a".repeat(48));
  const insert = admin.queries.find((query) => query.op === "insert");
  assert.equal(insert.payload.organizer_id, "org-1");
  assert.ok(Number.isFinite(Date.parse(insert.payload.updated_at)));
});

test("duplicate requests are idempotent and the open-request cap is enforced", async () => {
  resetState();
  const duplicateAdmin = makeSubmitAdmin({
    duplicateResult: { reservation_number: "RES-OLD", lookup_token: "d".repeat(48) },
  });
  const duplicate = await submitReservationRequestWithClient(submitInput(), duplicateAdmin);
  assert.equal(duplicate.success, true);
  assert.equal(duplicate.reservationNumber, "RES-OLD");
  assert.equal(duplicateAdmin.queries.some((query) => query.op === "insert"), false);

  resetState();
  const capped = await submitReservationRequestWithClient(
    submitInput(),
    makeSubmitAdmin({ pendingRows: [{ id: "1" }, { id: "2" }, { id: "3" }] })
  );
  assert.equal(capped.success, false);
  assert.equal(capped.error, "too_many_open_requests");
});

test("reservation settings save merges metadata and scopes the website by tenant_id", async () => {
  resetState();
  const admin = makeAdmin((query) => {
    if (query.table === "tenant_websites" && query.op === "select") {
      return {
        data: { id: "website-internal-id", tenant_id: "org-1", metadata: { keep: true, storefront: { menu: { enabled: true } } } },
        error: null,
      };
    }
    return { data: null, error: null };
  });
  const result = await saveReservationSettingsWithClient({
    organizerId: "org-1",
    websiteId: "website-internal-id",
    enabled: true,
    max_party_size: 10,
    min_lead_minutes: 60,
    max_days_ahead: 30,
    slot_minutes: 30,
    note: "Please arrive on time",
  }, admin);
  assert.deepEqual(result, { success: true });
  const read = admin.queries.find((query) => query.op === "select");
  const write = admin.queries.find((query) => query.op === "update");
  assert.ok(read.filters.some((filter) => filter.column === "tenant_id" && filter.value === "org-1"));
  assert.ok(write.filters.some((filter) => filter.column === "tenant_id" && filter.value === "org-1"));
  assert.equal(write.payload.metadata.keep, true);
  assert.deepEqual(write.payload.metadata.storefront.menu, { enabled: true });
  assert.equal(write.payload.metadata.storefront.reservations.max_party_size, 10);
});

test("site-time slot validation handles timezone conversion and overnight hours", () => {
  const settings = {
    enabled: true,
    max_party_size: 12,
    min_lead_minutes: 30,
    max_days_ahead: 14,
    slot_minutes: 30,
    note: null,
  };
  const nyHours = { wed: { open: "18:00", close: "20:00" } };
  const nyResult = validateReservationStartsAt(
    "2026-10-14T23:00:00.000Z",
    nyHours,
    settings,
    "America/New_York",
    new Date("2026-10-14T16:00:00.000Z")
  );
  assert.equal(nyResult.valid, true, "23:00 UTC is 19:00 in New York and inside site hours");

  const overnightHours = { fri: { open: "18:00", close: "03:00" } };
  const overnightSlots = getRawReservationSlotsForDate("2026-10-17", overnightHours, 30, "Africa/Lagos");
  assert.ok(overnightSlots.includes("01:30"), "Saturday slots include Friday's overnight spill");
  const overnightResult = validateReservationStartsAt(
    "2026-10-17T00:30:00.000Z",
    overnightHours,
    settings,
    "Africa/Lagos",
    new Date("2026-10-16T12:00:00.000Z")
  );
  assert.equal(overnightResult.valid, true, "01:30 site time remains inside Friday's overnight session");
});

test("status actions deny editor and finance roles and require a decline reason", async () => {
  resetState();
  state.access = false;
  for (const role of ["editor", "finance"]) {
    const result = await updateReservationStatus({
      reservationId: "reservation-internal-id",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "confirmed",
    });
    assert.equal(result.success, false);
    assert.equal(result.error, "forbidden", `${role} is read-only`);
  }
  assert.equal(state.adminFactoryCalls, 0);
  assert.deepEqual(state.accessCalls[0].roles, ["owner", "admin", "manager"]);

  resetState();
  const declineAdmin = makeStatusAdmin();
  const decline = await updateReservationStatusWithClient({
    reservationId: "reservation-internal-id",
    organizerId: "org-1",
    expectedCurrentStatus: "pending",
    nextStatus: "declined",
  }, declineAdmin, "manager-1");
  assert.equal(decline.success, false);
  assert.equal(decline.error, "missing_decline_reason");
  assert.equal(declineAdmin.queries.some((query) => query.op === "update"), false);

  const invalidTransitionAdmin = makeStatusAdmin();
  const invalidTransition = await updateReservationStatusWithClient({
    reservationId: "reservation-internal-id",
    organizerId: "org-1",
    expectedCurrentStatus: "pending",
    nextStatus: "completed",
  }, invalidTransitionAdmin, "manager-1");
  assert.equal(invalidTransition.success, false);
  assert.equal(invalidTransition.error, "invalid_transition");
  assert.equal(invalidTransitionAdmin.queries.some((query) => query.op === "update"), false);
});

test("status transitions use the expected status condition and write updated_at", async () => {
  resetState();
  const successAdmin = makeStatusAdmin();
  const updated = await updateReservationStatusWithClient({
    reservationId: "reservation-internal-id",
    organizerId: "org-1",
    expectedCurrentStatus: "pending",
    nextStatus: "cancelled",
    declineReason: "other",
  }, successAdmin, "manager-1");
  assert.deepEqual(updated, { success: true, nextStatus: "cancelled" });
  const write = successAdmin.queries.find((query) => query.op === "update");
  assert.ok(Number.isFinite(Date.parse(write.payload.updated_at)));
  assert.ok(write.filters.some((filter) => filter.column === "status" && filter.value === "pending"));

  const conflictAdmin = makeStatusAdmin({ updateResult: { data: null, error: null } });
  const conflict = await updateReservationStatusWithClient({
    reservationId: "reservation-internal-id",
    organizerId: "org-1",
    expectedCurrentStatus: "pending",
    nextStatus: "confirmed",
  }, conflictAdmin, "manager-1");
  assert.equal(conflict.success, false);
  assert.equal(conflict.error, "already_updated");
});

test("customer cancellation is token-only, tenant-scoped, and concurrency-guarded", async () => {
  resetState();
  const token = "c".repeat(48);
  const admin = makeAdmin((query) => {
    if (query.table === "tenant_websites") return { data: { tenant_id: "org-1", slug: "demo" }, error: null };
    if (query.table === "reservations" && query.op === "select") {
      return { data: reservationRow({ status: "confirmed", lookup_token: token }), error: null };
    }
    if (query.table === "reservations" && query.op === "update") return { data: { id: "reservation-internal-id" }, error: null };
    return { data: null, error: null };
  });
  const result = await cancelReservationByTokenWithClient({
    slug: "demo",
    lookupToken: token,
    expectedCurrentStatus: "confirmed",
  }, admin);

  assert.deepEqual(result, { success: true, nextStatus: "cancelled" });
  const lookup = admin.queries.find((query) => query.table === "reservations" && query.op === "select");
  assert.ok(lookup.filters.some((filter) => filter.column === "lookup_token" && filter.value === token));
  assert.ok(lookup.filters.some((filter) => filter.column === "organizer_id" && filter.value === "org-1"));
  const update = admin.queries.find((query) => query.op === "update");
  assert.ok(Number.isFinite(Date.parse(update.payload.updated_at)));
  assert.ok(update.filters.some((filter) => filter.column === "status" && filter.value === "confirmed"));
});

test("tracking exposes masked customer details and returns not-found for unknown tokens", () => {
  const page = fs.readFileSync(path.join(ROOT, "app/site/[slug]/reservations/[lookup_token]/page.tsx"), "utf8");
  const view = fs.readFileSync(path.join(ROOT, "components/site/ReservationTrackingView.tsx"), "utf8");
  assert.match(page, /\.eq\("lookup_token", lookupToken\)/);
  assert.match(page, /\.eq\("organizer_id", \(website as \{ tenant_id: string \}\)\.tenant_id\)/);
  assert.match(page, /if \(error \|\| !row\)\s*\{\s*return notFound\(\)/);
  assert.match(page, /maskCustomerName\(String\(r\.customer_name/);
  assert.match(page, /maskCustomerPhone\(String\(r\.customer_phone/);
  assert.doesNotMatch(page, /select\([\s\S]{0,120}customer_email/);
  assert.match(view, /order\.maskedCustomerName/);
  assert.match(view, /order\.maskedCustomerPhone/);
});

test("tenant website queries never use organizer_id and reservation emails are wired", () => {
  const sourcePaths = [
    "lib/actions/reservations.ts",
    "app/dashboard/org/[id]/reservations/page.tsx",
    "app/dashboard/org/[id]/overview/page.tsx",
    "app/site/[slug]/reservations/[lookup_token]/page.tsx",
  ];
  for (const relativePath of sourcePaths) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    const websiteQueries = [...source.matchAll(/\.from\("tenant_websites"\)([\s\S]*?)(?=\.from\(|;)/g)];
    for (const match of websiteQueries) {
      assert.doesNotMatch(match[1], /\.eq\("organizer_id"/);
    }
  }
  const emailSource = fs.readFileSync(path.join(ROOT, "lib/reservation-notifications.ts"), "utf8");
  assert.match(emailSource, /dispatchReservationNotifications/);
  assert.match(emailSource, /dispatchCustomerReservationStatusEmail/);
  assert.match(emailSource, /RESEND_API_KEY/);
});

test("migration preserves notification values, has no public/anon/insert access, and rollback states prerequisites", () => {
  const forwardPath = path.join(ROOT, "db/migration_176_reservations.sql");
  const forward = fs.readFileSync(forwardPath, "utf8");
  const mirror = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261014050000_migration_176_reservations.sql"), "utf8");
  const prior = fs.readFileSync(path.join(ROOT, "db/migration_172_notification_checks_widen.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(ROOT, "db/migration_176_reservations_rollback.sql"), "utf8");

  function allowedValues(source, constraint) {
    const marker = `ADD CONSTRAINT notifications_${constraint}_check`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `missing ${marker}`);
    const end = source.indexOf("));", start);
    return [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1]);
  }
  for (const constraint of ["type", "related_type"]) {
    const before = allowedValues(prior, constraint);
    const after = allowedValues(forward, constraint);
    for (const value of before) assert.ok(after.includes(value), `${constraint} dropped ${value}`);
  }
  assert.ok(allowedValues(forward, "type").includes("reservation_placed"));
  assert.ok(allowedValues(forward, "related_type").includes("reservation"));
  assert.equal(mirror, forward);
  assert.match(forward, /REVOKE ALL ON TABLE public\.reservations FROM PUBLIC;/i);
  assert.match(forward, /REVOKE ALL ON TABLE public\.reservations FROM anon;/i);
  assert.match(forward, /REVOKE ALL ON TABLE public\.reservations FROM authenticated;/i);
  assert.match(forward, /GRANT SELECT, UPDATE ON TABLE public\.reservations TO authenticated;/i);
  assert.doesNotMatch(forward, /GRANT\s+[^;]*INSERT[^;]*\bTO authenticated/i);
  assert.match(forward, /DROP POLICY IF EXISTS "Tenant team members can view reservations"/);
  assert.match(forward, /DROP POLICY IF EXISTS "Tenant managers can update reservations"/);
  assert.match(rollback, /delete or remap notification rows/i);
  assert.match(rollback, /reservation_placed/);
  assert.match(rollback, /related_type = 'reservation'/);
  assert.match(rollback, /DROP TABLE IF EXISTS public\.reservations/);
  assert.match(rollback, /deletes all reservation data/i);
});

test("dashboard and personal summary paths tolerate an unapplied migration", () => {
  const overview = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/overview/page.tsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/reservations/page.tsx"), "utf8");
  const myThings = fs.readFileSync(path.join(ROOT, "lib/my-things.ts"), "utf8");
  const nav = fs.readFileSync(path.join(ROOT, "lib/org-dashboard-modules.ts"), "utf8");
  assert.match(overview, /Non-fatal reservations fetch failure/);
  assert.match(dashboard, /reservationsAvailable = false/);
  assert.match(myThings, /Non-fatal if reservations query fails/);
  assert.match(myThings, /pending request/);
  assert.match(nav, /key: "reservations"[\s\S]*?routeExists: true/);
});
