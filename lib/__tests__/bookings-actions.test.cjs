/**
 * lib/__tests__/bookings-actions.test.cjs
 *
 * lib/actions/bookings.ts: organizer scoping, tenant-role gating, the
 * booking_type='appointment' discriminator (never touches a restaurant's
 * booking_type='table' row even given its id), and the "Accept online
 * bookings" switch reusing lib/actions/reservations.ts's own settings write
 * path (saveReservationSettingsWithClient) unedited.
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
    user: { id: "user-1" },
    access: true,
    accessCalls: [],
  });
}
resetState();

const stubs = {
  "next/cache": { revalidatePath: () => {} },
  "next/headers": { headers: async () => ({ get: () => null }) },
  "@/lib/auth": { getCurrentUser: async () => state.user },
  "@/lib/entity-auth": {
    checkTenantAccess: async (userId, organizerId, roles) => {
      state.accessCalls.push({ userId, organizerId, roles });
      return { hasAccess: state.access };
    },
  },
  "@/lib/business-taxonomy": { getCapabilitiesForBusiness: () => [] },
  "@/lib/storefront-features": {
    getBuiltStorefrontFeatures: () => ({ reservations: false }),
    resolveStorefrontFeatures: () => ({ reservations: false }),
  },
  "@/lib/website-v2-theme": { getV2TemplateForWebsite: () => null },
  "@/lib/website-content": { normalizeContent: (content) => content || {} },
  "@/lib/order-phone": {
    isValidPhoneNumber: () => true,
    normalizePhone: (p) => p,
  },
  "@/lib/server-approval": { getOrgApproval: async () => ({ status: "approved" }) },
  "@/lib/business-approval": { canTakeOrders: () => true },
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
  setBookingsEnabledWithClient,
  updateBookingStatusWithClient,
  confirmBooking,
  declineBooking,
  cancelBooking,
} = require(path.join(ROOT, "lib/actions/bookings.ts"));

function makeAdmin(resolveQuery) {
  const queries = [];
  return {
    queries,
    from(table) {
      const query = { table, op: "select", filters: [], payload: null };
      const finish = () => {
        queries.push(query);
        return resolveQuery(query);
      };
      const builder = {
        select() {
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
        maybeSingle() {
          return Promise.resolve(finish());
        },
        single() {
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

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";

function makeWebsiteSettingsAdmin({ website, bizUpdateOk = true } = {}) {
  return makeAdmin((query) => {
    if (query.table === "tenant_websites" && query.op === "select") {
      const idFilter = query.filters.find((f) => f.column === "id");
      const tenantFilter = query.filters.find((f) => f.column === "tenant_id");
      if (website && idFilter?.value === website.id && tenantFilter?.value === website.tenant_id) {
        return { data: website, error: null };
      }
      return { data: null, error: null };
    }
    if (query.table === "tenant_websites" && query.op === "update") {
      return { data: null, error: null };
    }
    if (query.table === "businesses") {
      return bizUpdateOk ? { data: { id: "biz-1" }, error: null } : { data: null, error: { message: "no business" } };
    }
    return { data: null, error: null };
  });
}

function makeBookingAdmin(rows) {
  return makeAdmin((query) => {
    if (query.table === "reservations" && query.op === "update") {
      const idFilter = query.filters.find((f) => f.column === "id");
      const orgFilter = query.filters.find((f) => f.column === "organizer_id");
      const typeFilter = query.filters.find((f) => f.column === "booking_type");
      const statusFilter = query.filters.find((f) => f.column === "status");
      const row = rows.find(
        (r) =>
          r.id === idFilter?.value &&
          r.organizer_id === orgFilter?.value &&
          r.booking_type === typeFilter?.value &&
          r.status === statusFilter?.value
      );
      if (row) row.status = query.payload.status;
      return { data: row ? { id: row.id } : null, error: null };
    }
    return { data: null, error: null };
  });
}

// ── Accept online bookings switch ───────────────────────────────────────────

test("setBookingsEnabled: writes enabled via the shared reservation settings path, preserving other fields", async () => {
  const website = {
    id: "site-1",
    tenant_id: ORG_A,
    metadata: { storefront: { reservations: { enabled: false, max_party_size: 7, min_lead_minutes: 45, max_days_ahead: 10, slot_minutes: 15 } } },
  };
  const admin = makeWebsiteSettingsAdmin({ website });
  const res = await setBookingsEnabledWithClient(ORG_A, "site-1", true, admin);
  assert.equal(res.success, true);
  const updateQuery = admin.queries.find((q) => q.table === "tenant_websites" && q.op === "update");
  assert.equal(updateQuery.payload.metadata.storefront.reservations.enabled, true);
  assert.equal(updateQuery.payload.metadata.storefront.reservations.max_party_size, 7, "other settings fields pass through unchanged");
});

test("setBookingsEnabled: only writes for the website scoped to the caller's own organizer_id", async () => {
  const website = { id: "site-1", tenant_id: ORG_A, metadata: {} };
  const admin = makeWebsiteSettingsAdmin({ website });
  const res = await setBookingsEnabledWithClient(ORG_B, "site-1", true, admin);
  assert.equal(res.success, false);
  assert.equal(res.error, "no_website", "a website belonging to another organizer never resolves");
});

test("setBookingsEnabled: forbidden without a manage role", async () => {
  state.access = false;
  const { setBookingsEnabled } = require(path.join(ROOT, "lib/actions/bookings.ts"));
  const res = await setBookingsEnabled(ORG_A, "site-1", true);
  assert.equal(res.success, false);
  assert.equal(res.error, "forbidden");
  state.access = true;
});

// ── Confirm / decline / cancel ──────────────────────────────────────────────

test("updateBookingStatusWithClient: confirms a pending appointment scoped to its organizer", async () => {
  const rows = [{ id: "bk-1", organizer_id: ORG_A, booking_type: "appointment", status: "pending" }];
  const admin = makeBookingAdmin(rows);
  const res = await updateBookingStatusWithClient(
    { bookingId: "bk-1", organizerId: ORG_A, expectedCurrentStatus: "pending", nextStatus: "confirmed" },
    admin
  );
  assert.equal(res.success, true);
  assert.equal(rows[0].status, "confirmed");
});

test("updateBookingStatusWithClient: rejects a booking id belonging to another organizer", async () => {
  const rows = [{ id: "bk-1", organizer_id: ORG_A, booking_type: "appointment", status: "pending" }];
  const admin = makeBookingAdmin(rows);
  const res = await updateBookingStatusWithClient(
    { bookingId: "bk-1", organizerId: ORG_B, expectedCurrentStatus: "pending", nextStatus: "confirmed" },
    admin
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "already_updated");
  assert.equal(rows[0].status, "pending", "the row is untouched");
});

test("updateBookingStatusWithClient: never touches a booking_type='table' row even given its id and organizer", () => {
  const rows = [{ id: "bk-1", organizer_id: ORG_A, booking_type: "table", status: "pending" }];
  const admin = makeBookingAdmin(rows);
  return updateBookingStatusWithClient(
    { bookingId: "bk-1", organizerId: ORG_A, expectedCurrentStatus: "pending", nextStatus: "confirmed" },
    admin
  ).then((res) => {
    assert.equal(res.success, false);
    assert.equal(res.error, "already_updated", "the booking_type filter means a table row never matches");
    assert.equal(rows[0].status, "pending", "a restaurant table reservation is never mutated by bookings.ts");
  });
});

test("updateBookingStatusWithClient: rejects an invalid transition before touching the database", async () => {
  const rows = [{ id: "bk-1", organizer_id: ORG_A, booking_type: "appointment", status: "declined" }];
  const admin = makeBookingAdmin(rows);
  const res = await updateBookingStatusWithClient(
    { bookingId: "bk-1", organizerId: ORG_A, expectedCurrentStatus: "declined", nextStatus: "confirmed" },
    admin
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "invalid_transition");
  assert.equal(admin.queries.length, 0, "no query is issued for a transition the graph already forbids");
});

test("confirmBooking / declineBooking / cancelBooking are forbidden without a manage role", async () => {
  state.access = false;
  const res1 = await confirmBooking("bk-1", ORG_A);
  const res2 = await declineBooking("bk-1", ORG_A, "not available");
  const res3 = await cancelBooking("bk-1", ORG_A, "pending", "customer asked");
  assert.equal(res1.success, false);
  assert.equal(res1.error, "forbidden");
  assert.equal(res2.success, false);
  assert.equal(res2.error, "forbidden");
  assert.equal(res3.success, false);
  assert.equal(res3.error, "forbidden");
  state.access = true;
});
