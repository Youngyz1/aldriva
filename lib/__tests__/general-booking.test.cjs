/**
 * General Booking: submitGeneralBookingRequest validation, checkboxes,
 * alternative date rules, booking_type and booking_details written,
 * no capacity check.
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
    notificationCalls: [],
    notificationThrows: false,
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
      const allowed = name === "generalBookingRequestPhone" ? state.phoneRateAllowed : state.rateAllowed;
      return { allowed, remaining: allowed ? 10 : 0, retryAfter: 60 };
    },
  },
  "@/lib/storefront-features": {
    resolveStorefrontFeatures: () => ({ reservations: state.featureEnabled }),
  },
  "@/lib/website-content": {
    normalizeContent: (content) => content || {},
    resolveBookingHours: (savedHours) => {
      if (savedHours && typeof savedHours === "object" && Object.keys(savedHours).length > 0) return savedHours;
      return null;
    },
  },
  "@/lib/order-phone": {
    isValidPhoneNumber: (phone) => typeof phone === "string" && phone.length > 0,
    normalizePhone: () => "+15555550100",
  },
  "@/lib/server-approval": { getOrgApproval: async () => state.approval },
  "@/lib/business-approval": { canTakeOrders: () => state.canTakeOrders },
  "@/lib/business-taxonomy": {
    getCapabilitiesForBusiness: () => ["SERVICES", "BOOKINGS", "APPOINTMENTS", "CUSTOMERS", "PAYMENTS", "REVIEWS"],
  },
  "@/lib/general-booking-notifications": {
    dispatchGeneralBookingNotifications: async (payload) => {
      state.notificationCalls = [...(state.notificationCalls || []), payload];
      if (state.notificationThrows) throw new Error("notification dispatch failed");
    },
  },
};

const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
  return originalLoad.call(this, request, parent, isMain);
};

const {
  submitGeneralBookingRequestWithClient,
} = require(path.join(ROOT, "lib/actions/general-booking.ts"));

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
  industry: "beauty",
  category: "Salon & Barbershop",
  business_type: "salon",
  offerings: ["services"],
};

const allDayHours = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, { open: "00:00", close: "23:59" }])
);

function makeSubmitAdmin({ missingReservationTable = false, pendingRows = [], duplicateResult = null, inserted, services = [] } = {}) {
  return makeAdmin((query) => {
    if (query.table === "tenant_websites") return { data: website, error: null };
    if (query.table === "businesses") return { data: business, error: null };
    if (query.table === "website_content") return { data: { content: { hours: allDayHours } }, error: null };
    if (query.table === "services") {
      const idFilter = query.filters.find((f) => f.column === "id");
      const orgFilter = query.filters.find((f) => f.column === "organizer_id");
      const row = services.find((s) => s.id === idFilter?.value && s.organizer_id === orgFilter?.value);
      return { data: row || null, error: null };
    }
    if (query.table === "reservations" && query.op === "insert") {
      return {
        data: inserted || { reservation_number: "GBK-261105-1234", lookup_token: "a".repeat(48) },
        error: null,
      };
    }
    if (query.table === "reservations" && query.op === "select") {
      const pendingMatch = pendingRows.filter((r) => r.status === "pending");
      if (query.filters.some((f) => f.op === "eq" && f.column === "status" && f.value === "pending")) {
        return { data: pendingRows, error: null };
      }
      if (query.filters.some((f) => f.op === "eq" && f.column === "starts_at")) {
        return { data: duplicateResult, error: null };
      }
      return { data: [], error: null };
    }
    return { data: null, error: null };
  });
}

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
        eq(column, value) {
          query.filters.push({ op: "eq", column, value });
          return builder;
        },
        in(column, value) {
          query.filters.push({ op: "in", column, value });
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

test("submitGeneralBookingRequest: valid appointment request inserts with booking_type appointment", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({ inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" } });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      customerEmail: "jane@example.com",
      serviceType: "Haircut",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      altStartsAt: "2026-11-11T14:00:00.000Z",
      specialRequest: "Please call ahead",
      termsAccepted: true,
      marketingOptIn: false,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true);
  assert.equal(res.reservationNumber, "GBK-261105-1234");
  assert.equal(res.lookupToken, "abc123");

  const insertQuery = state.adminFromFactory.queries.find((q) => q.op === "insert");
  assert.equal(insertQuery.table, "reservations");
  assert.equal(insertQuery.payload.booking_type, "appointment");
  assert.equal(insertQuery.payload.party_size, 1);
  assert.equal(insertQuery.payload.duration_minutes, 90);
  assert.equal(insertQuery.payload.customer_note, "Please call ahead");
  assert.equal(insertQuery.payload.status, "pending");
  assert.equal(insertQuery.payload.payment_status, "unpaid");
  assert.equal(insertQuery.payload.booking_details.service_type, "Haircut");
  assert.equal(insertQuery.payload.booking_details.alt_starts_at, "2026-11-11T14:00:00.000Z");
  assert.ok(insertQuery.payload.booking_details.terms_accepted_at);
  assert.equal(insertQuery.payload.booking_details.marketing_opt_in, false);
  assert.ok(insertQuery.payload.ends_at);
});

test("submitGeneralBookingRequest: terms checkbox required, marketing optional", async (t) => {
  state.adminFromFactory = makeSubmitAdmin();
  // marketingOptIn false should still succeed when terms accepted
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Haircut",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: false,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true);

  // terms not accepted should fail
  const res2 = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Haircut",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: false,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res2.success, false);
  assert.equal(res2.error, "invalid_customer_info");
});

test("submitGeneralBookingRequest: alternative date must differ from preferred", async (t) => {
  state.adminFromFactory = makeSubmitAdmin();
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Haircut",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      altStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "invalid_time");
});

test("submitGeneralBookingRequest: no party-size or seat-capacity check", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({ inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" } });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Consultation",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true);
  const insertQuery = state.adminFromFactory.queries.find((q) => q.op === "insert");
  // No seat_capacity query should have been made against reservations
  const capacityQueries = state.adminFromFactory.queries.filter(
    (q) => q.table === "reservations" && q.op === "select" && q.filters.some((f) => f.op === "lt" || f.op === "gt")
  );
  assert.equal(capacityQueries.length, 0);
  // party_size is forced to 1
  assert.equal(insertQuery.payload.party_size, 1);
});

test("submitGeneralBookingRequest: validation rejects missing name", async (t) => {
  state.adminFromFactory = makeSubmitAdmin();
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "",
      customerPhone: "+15555550100",
      serviceType: "Haircut",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "invalid_customer_info");
});

test("submitGeneralBookingRequest: validation rejects missing service type", async (t) => {
  state.adminFromFactory = makeSubmitAdmin();
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "invalid_customer_info");
});

test("submitGeneralBookingRequest: honeypot rejects submission", async (t) => {
  state.adminFromFactory = makeSubmitAdmin();
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Haircut",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
      hp: "http://spam.example.com",
    },
    state.adminFromFactory
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "invalid_submission");
});

test("submitGeneralBookingRequest: appointment rows do not count against table capacity", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({ inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" } });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Consultation",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true);

  // The general booking action makes NO seat-capacity query at all
  // (no party-size or seat-capacity checks by design).
  const capacityQueries = state.adminFromFactory.queries.filter(
    (q) => q.table === "reservations" && q.op === "select" && q.filters.some((f) => f.op === "lt" || f.op === "gt")
  );
  assert.equal(capacityQueries.length, 0);

  // The table seat-capacity filter (booking_type = 'table') lives in
  // lib/actions/reservations.ts, so appointment rows never pollute table covers.
  const tableCapFilter = state.adminFromFactory.queries.find(
    (q) => q.table === "reservations" && q.op === "select" && q.filters.some((f) => f.op === "eq" && f.column === "booking_type" && f.value === "table")
  );
  assert.equal(tableCapFilter, undefined, "general booking action must not run the table capacity query");
});

test("submitGeneralBookingRequest: valid serviceId is stored as service_id/service_title", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({
    inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" },
    services: [{ id: "svc-1", organizer_id: "org-1", title: "Deep Clean", is_active: true }],
  });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Deep Clean",
      serviceId: "svc-1",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true);
  const insertQuery = state.adminFromFactory.queries.find((q) => q.table === "reservations" && q.op === "insert");
  assert.equal(insertQuery.payload.booking_details.service_id, "svc-1");
  assert.equal(insertQuery.payload.booking_details.service_title, "Deep Clean");
});

test("submitGeneralBookingRequest: serviceId owned by another organizer is silently dropped", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({
    inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" },
    services: [{ id: "svc-1", organizer_id: "some-other-org", title: "Deep Clean", is_active: true }],
  });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Deep Clean",
      serviceId: "svc-1",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true, "booking still proceeds without the invalid reference");
  const insertQuery = state.adminFromFactory.queries.find((q) => q.table === "reservations" && q.op === "insert");
  assert.equal(Object.hasOwn(insertQuery.payload.booking_details, "service_id"), false);
  assert.equal(Object.hasOwn(insertQuery.payload.booking_details, "service_title"), false);
});

test("submitGeneralBookingRequest: inactive serviceId is silently dropped", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({
    inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" },
    services: [{ id: "svc-1", organizer_id: "org-1", title: "Deep Clean", is_active: false }],
  });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Deep Clean",
      serviceId: "svc-1",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true, "booking still proceeds without the invalid reference");
  const insertQuery = state.adminFromFactory.queries.find((q) => q.table === "reservations" && q.op === "insert");
  assert.equal(Object.hasOwn(insertQuery.payload.booking_details, "service_id"), false);
  assert.equal(Object.hasOwn(insertQuery.payload.booking_details, "service_title"), false);
});

test("submitGeneralBookingRequest: malformed serviceId is silently dropped", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({
    inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" },
    services: [{ id: "svc-1", organizer_id: "org-1", title: "Deep Clean", is_active: true }],
  });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Deep Clean",
      serviceId: "not-a-real-id",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true, "booking still proceeds without the invalid reference");
  const insertQuery = state.adminFromFactory.queries.find((q) => q.table === "reservations" && q.op === "insert");
  assert.equal(Object.hasOwn(insertQuery.payload.booking_details, "service_id"), false);
  assert.equal(Object.hasOwn(insertQuery.payload.booking_details, "service_title"), false);
});

test("submitGeneralBookingRequest: absent serviceId never touches the services table", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({
    inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" },
    services: [{ id: "svc-1", organizer_id: "org-1", title: "Deep Clean", is_active: true }],
  });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Deep Clean",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true);
  const insertQuery = state.adminFromFactory.queries.find((q) => q.table === "reservations" && q.op === "insert");
  assert.equal(Object.hasOwn(insertQuery.payload.booking_details, "service_id"), false);
  assert.equal(Object.hasOwn(insertQuery.payload.booking_details, "service_title"), false);
  const servicesQueries = state.adminFromFactory.queries.filter((q) => q.table === "services");
  assert.equal(servicesQueries.length, 0, "no serviceId means no services table lookup");
});

test("submitGeneralBookingRequest: dispatches the owner notification with organizer and booking details", async (t) => {
  state.notificationCalls = [];
  state.notificationThrows = false;
  state.adminFromFactory = makeSubmitAdmin({ inserted: { reservation_number: "GBK-NOTIFY-1", lookup_token: "notify123" } });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Haircut",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true);
  const call = state.notificationCalls.find((c) => c.reservation_number === "GBK-NOTIFY-1");
  assert.ok(call, "dispatchGeneralBookingNotifications was called for this booking");
  assert.equal(call.organizer_id, "org-1");
  assert.equal(call.customer_name, "Jane Doe");
  assert.equal(call.service_type, "Haircut");
});

test("submitGeneralBookingRequest: owner notification failure never blocks the booking", async (t) => {
  state.notificationCalls = [];
  state.notificationThrows = true;
  state.adminFromFactory = makeSubmitAdmin({ inserted: { reservation_number: "GBK-NOTIFY-2", lookup_token: "notify456" } });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Haircut",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true, "a throwing notification dispatcher must not fail the booking");
  assert.equal(res.reservationNumber, "GBK-NOTIFY-2");
  state.notificationThrows = false;
});

test("submitGeneralBookingRequest: service duration_minutes >= 15 becomes the booking length", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({
    inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" },
    services: [{ id: "svc-1", organizer_id: "org-1", title: "Deep Clean", is_active: true, duration_minutes: 60, booking_mode: "timed" }],
  });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Deep Clean",
      serviceId: "svc-1",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true);
  const insertQuery = state.adminFromFactory.queries.find((q) => q.table === "reservations" && q.op === "insert");
  assert.equal(insertQuery.payload.duration_minutes, 60, "service duration used when >= 15");
  assert.equal(insertQuery.payload.booking_details.duration_minutes, 60);
  assert.equal(insertQuery.payload.booking_details.booking_mode, "timed");
});

test("submitGeneralBookingRequest: service duration_minutes < 15 falls back to the business default stay", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({
    inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" },
    services: [{ id: "svc-1", organizer_id: "org-1", title: "Consultation", is_active: true, duration_minutes: 10, booking_mode: "timed" }],
  });
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Consultation",
      serviceId: "svc-1",
      preferredStartsAt: "2026-11-10T14:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true);
  const insertQuery = state.adminFromFactory.queries.find((q) => q.table === "reservations" && q.op === "insert");
  assert.equal(insertQuery.payload.duration_minutes, 90, "sub-15 service duration falls back to default stay (90)");
  assert.equal(insertQuery.payload.booking_details.duration_minutes, 90);
});

test("submitGeneralBookingRequest: date_only service accepts an open day inside the horizon and stores booking_mode", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({
    inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" },
    services: [{ id: "svc-1", organizer_id: "org-1", title: "Cleaning", is_active: true, duration_minutes: null, booking_mode: "date_only" }],
  });
  // 2026-11-10 12:00 UTC = a future open day inside the 30-day horizon (allDayHours).
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Cleaning",
      serviceId: "svc-1",
      preferredStartsAt: "2026-11-10T12:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, true);
  const insertQuery = state.adminFromFactory.queries.find((q) => q.table === "reservations" && q.op === "insert");
  assert.equal(insertQuery.payload.booking_details.booking_mode, "date_only");
  assert.equal(insertQuery.payload.booking_details.duration_minutes, 90, "null service duration falls back to default stay");
});

test("submitGeneralBookingRequest: date_only service rejects a past date", async (t) => {
  state.adminFromFactory = makeSubmitAdmin({
    inserted: { reservation_number: "GBK-261105-1234", lookup_token: "abc123" },
    services: [{ id: "svc-1", organizer_id: "org-1", title: "Cleaning", is_active: true, booking_mode: "date_only" }],
  });
  // 2026-11-01 is before "today" (2026-11-07).
  const res = await submitGeneralBookingRequestWithClient(
    {
      slug: "demo",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      serviceType: "Cleaning",
      serviceId: "svc-1",
      preferredStartsAt: "2026-11-01T12:00:00.000Z",
      termsAccepted: true,
      marketingOptIn: true,
    },
    state.adminFromFactory
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "invalid_time");
});
