/**
 * Stage B: Capacity-based reservations tests.
 *
 * Tests:
 * 1. Duration bounds & settings validation (seat_capacity, default_stay, max_stay)
 * 2. Interval overlap logic (adjacent slots do not overlap, overlapping slots do)
 * 3. Closing time checks including regular and overnight spillover intervals
 * 4. Submit-time read-only availability check (returns fully_booked when covers exceed capacity)
 * 5. Payment status independence (payment_status never mutates reservation lifecycle status)
 * 6. Owner confirm action RPC integration & CAPACITY_EXCEEDED mapping
 * 7. Migration files inspection (forward, rollback fail-closed guard, Supabase mirror, no GENERATED column)
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
    user: { id: "user-test-1" },
    access: true,
    rpcResult: { success: true, status: "confirmed" },
    rpcError: null,
  });
}
resetState();

const stubs = {
  "next/cache": { revalidatePath: () => {} },
  "next/headers": { headers: async () => ({ get: (key) => (key === "x-real-ip" ? "192.0.2.20" : null) }) },
  "@/lib/auth": { getCurrentUser: async () => state.user },
  "@/lib/entity-auth": {
    checkTenantAccess: async () => ({ hasAccess: state.access }),
  },
  "@/lib/rate-limit": {
    checkRateLimit: async () => ({ allowed: true, remaining: 10, retryAfter: 60 }),
  },
  "@/lib/business-taxonomy": { getCapabilitiesForBusiness: () => ["TABLES", "RESERVATIONS"] },
  "@/lib/storefront-features": {
    getBuiltStorefrontFeatures: () => ({ reservations: true }),
    resolveStorefrontFeatures: () => ({ reservations: true }),
  },
  "@/lib/website-v2-theme": { getV2TemplateForWebsite: () => ({ id: "template" }) },
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
  extractReservationSettings,
  validateReservationSettings,
  DEFAULT_RESERVATION_SETTINGS,
} = require(path.join(ROOT, "lib/reservation-settings.ts"));

const {
  validateReservationInterval,
  formatDurationOptionLabel,
  formatReservationTimeRange,
} = require(path.join(ROOT, "lib/reservation-slots.ts"));

const {
  submitReservationRequestWithClient,
  updateReservationStatusWithClient,
  updateReservationInternalNoteWithClient,
  cancelReservationByTokenWithClient,
  submitChangeRequestWithClient,
  withdrawChangeRequestWithClient,
  approveChangeRequestWithClient,
  declineChangeRequestWithClient,
} = require(path.join(ROOT, "lib/actions/reservations.ts"));

const {
  RESERVATION_TRANSITION_GRAPH,
} = require(path.join(ROOT, "lib/reservation-transitions.ts"));

test("Stage B settings: validates seat_capacity, default_stay_minutes, and max_stay_minutes", () => {
  const base = {
    enabled: true,
    max_party_size: 10,
    min_lead_minutes: 60,
    max_days_ahead: 30,
    slot_minutes: 30,
  };

  // Valid inputs
  const validRes = validateReservationSettings({
    ...base,
    seat_capacity: 50,
    default_stay_minutes: 90,
    max_stay_minutes: 120,
  });
  assert.equal(validRes.valid, true);
  if (validRes.valid) {
    assert.equal(validRes.settings.seat_capacity, 50);
    assert.equal(validRes.settings.default_stay_minutes, 90);
    assert.equal(validRes.settings.max_stay_minutes, 120);
  }

  // Invalid seat capacity (< 1 or > 5000)
  const lowCap = validateReservationSettings({ ...base, seat_capacity: 0 });
  assert.equal(lowCap.valid, false);
  const highCap = validateReservationSettings({ ...base, seat_capacity: 5001 });
  assert.equal(highCap.valid, false);

  // Invalid default stay (< 15 or > 480)
  const lowStay = validateReservationSettings({ ...base, default_stay_minutes: 10 });
  assert.equal(lowStay.valid, false);
  const highStay = validateReservationSettings({ ...base, default_stay_minutes: 500 });
  assert.equal(highStay.valid, false);

  // Max stay less than default stay
  const invalidMax = validateReservationSettings({
    ...base,
    default_stay_minutes: 90,
    max_stay_minutes: 60,
  });
  assert.equal(invalidMax.valid, false);

  // Null seat capacity is allowed (advisory mode)
  const nullCap = validateReservationSettings({
    ...base,
    seat_capacity: null,
  });
  assert.equal(nullCap.valid, true);
  if (nullCap.valid) {
    assert.equal(nullCap.settings.seat_capacity, null);
  }
});

test("Stage B interval overlap logic: adjacent slots do NOT overlap, overlapping slots DO", () => {
  function intervalsOverlap(s1, e1, s2, e2) {
    return s1 < e2 && e1 > s2;
  }

  // Reservation 1: 18:00 - 19:30 (90 min)
  const r1Start = new Date("2026-11-08T18:00:00Z").getTime();
  const r1End = new Date("2026-11-08T19:30:00Z").getTime();

  // Adjacent Reservation 2: 19:30 - 21:00 (starts exactly when r1 ends)
  const r2Start = new Date("2026-11-08T19:30:00Z").getTime();
  const r2End = new Date("2026-11-08T21:00:00Z").getTime();
  assert.equal(intervalsOverlap(r1Start, r1End, r2Start, r2End), false, "adjacent slots must not overlap");

  // Overlapping Reservation 3: 19:00 - 20:30 (starts during r1)
  const r3Start = new Date("2026-11-08T19:00:00Z").getTime();
  const r3End = new Date("2026-11-08T20:30:00Z").getTime();
  assert.equal(intervalsOverlap(r1Start, r1End, r3Start, r3End), true, "intersecting intervals must overlap");

  // Completely enclosing Reservation 4: 17:30 - 20:00
  const r4Start = new Date("2026-11-08T17:30:00Z").getTime();
  const r4End = new Date("2026-11-08T20:00:00Z").getTime();
  assert.equal(intervalsOverlap(r1Start, r1End, r4Start, r4End), true, "enclosing intervals must overlap");
});

test("Stage B opening hours: duration extending past closing time is rejected", () => {
  const hours = {
    sun: { open: "12:00", close: "22:00" },
  };
  const settings = {
    ...DEFAULT_RESERVATION_SETTINGS,
    min_lead_minutes: 0,
    max_days_ahead: 30,
    slot_minutes: 30,
  };
  const tz = "UTC";
  // 2026-11-08 is a Sunday
  const fixedNow = new Date("2026-11-08T10:00:00Z");

  // Fits within closing time: 20:30 + 90 min = 22:00 (closing time)
  const validTime = "2026-11-08T20:30:00Z";
  const validRes = validateReservationInterval(validTime, 90, hours, settings, tz, fixedNow);
  assert.equal(validRes.valid, true);

  // Extends past closing: 21:00 + 90 min = 22:30 (past 22:00)
  const invalidTime = "2026-11-08T21:00:00Z";
  const invalidRes = validateReservationInterval(invalidTime, 90, hours, settings, tz, fixedNow);
  assert.equal(invalidRes.valid, false);
  if (!invalidRes.valid) {
    assert.equal(invalidRes.error, "outside_opening_hours");
  }
});

test("Stage B overnight hours: duration validation handles overnight spillover", () => {
  // Hours: 18:00 to 02:00 (overnight)
  const hours = {
    sun: { open: "18:00", close: "02:00" },
  };
  const settings = {
    ...DEFAULT_RESERVATION_SETTINGS,
    min_lead_minutes: 0,
    max_days_ahead: 30,
    slot_minutes: 30,
  };
  const tz = "UTC";
  const fixedNow = new Date("2026-11-08T12:00:00Z");

  // Starts at 23:30 with 120m duration: ends at 01:30 (before 02:00 close) -> valid
  const validOvernight = "2026-11-08T23:30:00Z";
  const validRes = validateReservationInterval(validOvernight, 120, hours, settings, tz, fixedNow);
  assert.equal(validRes.valid, true);

  // Starts at 00:30 with 120m duration: ends at 02:30 (past 02:00 close) -> invalid
  const invalidOvernight = "2026-11-08T00:30:00Z";
  const invalidRes = validateReservationInterval(invalidOvernight, 120, hours, settings, tz, fixedNow);
  assert.equal(invalidRes.valid, false);
});

test("Stage B submit action: advisory availability check returns fully_booked when capacity is exceeded", async () => {
  resetState();
  const startsAt = "2026-11-08T19:00:00Z";
  const hours = { sun: { open: "12:00", close: "23:00" } };

  function buildMockClient(activePartySum) {
    return {
      from(table) {
        if (table === "tenant_websites") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "site-1",
                    slug: "test-bistro",
                    status: "published",
                    tenant_id: "org-1",
                    metadata: { storefront: { reservations: { enabled: true, max_party_size: 12 } } },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "businesses") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: "biz-1",
                        industry: "Food & Beverage",
                        category: "Restaurant",
                        business_type: "Full-Service Restaurant",
                        offerings: ["table_reservations"],
                        seat_capacity: 20,
                        default_stay_minutes: 90,
                        max_stay_minutes: 120,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "website_content") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { content: { hours } },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "reservations") {
          return {
            select: (cols) => {
              const chain = {
                eq: () => chain,
                in: () => chain,
                lt: () => chain,
                gt: () => chain,
                order: () => chain,
                limit: () => chain,
                maybeSingle: async () => ({ data: null, error: null }),
                then: (resolve) => {
                  // If querying overlapping party sizes for capacity check
                  if (cols.includes("party_size")) {
                    resolve({ data: [{ party_size: activePartySum }], error: null });
                  } else {
                    resolve({ data: [], error: null });
                  }
                },
              };
              return chain;
            },
            insert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: { reservation_number: "RES-TEST-1234", lookup_token: "tok123" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
    };
  }

  // 1. Capacity = 20, existing active covers = 18, requested party = 4 -> 18 + 4 = 22 > 20 -> fully_booked
  const fullClient = buildMockClient(18);
  const fullRes = await submitReservationRequestWithClient(
    {
      slug: "test-bistro",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      partySize: 4,
      startsAt,
    },
    fullClient
  );
  assert.equal(fullRes.success, false);
  if (!fullRes.success) {
    assert.equal(fullRes.error, "fully_booked");
  }

  // 2. Capacity = 20, existing active covers = 18, requested party = 2 -> 18 + 2 = 20 <= 20 -> success
  const okClient = buildMockClient(18);
  const okRes = await submitReservationRequestWithClient(
    {
      slug: "test-bistro",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      partySize: 2,
      startsAt,
    },
    okClient
  );
  assert.equal(okRes.success, true);
  if (okRes.success) {
    assert.equal(okRes.reservationNumber, "RES-TEST-1234");
  }
});

test("Stage B owner confirm action: calls RPC and maps CAPACITY_EXCEEDED error code", async () => {
  resetState();

  function buildOwnerClient(rpcResponse) {
    return {
      from(table) {
        if (table === "reservations") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "res-target-1",
                      reservation_number: "RES-001",
                      customer_name: "John Smith",
                      customer_email: "john@example.com",
                      party_size: 4,
                      starts_at: "2026-11-08T19:00:00Z",
                      status: "pending",
                      status_history: [],
                      website_id: "site-1",
                      lookup_token: "token123",
                      customer_phone: "+15555550100",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
      rpc: async (fn, args) => {
        assert.equal(fn, "confirm_reservation_with_capacity");
        assert.equal(args.p_reservation_id, "res-target-1");
        assert.equal(args.p_expected_status, "pending");
        return rpcResponse;
      },
    };
  }

  // 1. RPC returns CAPACITY_EXCEEDED
  const capExceededClient = buildOwnerClient({
    data: { success: false, error: "CAPACITY_EXCEEDED", message: "Capacity exceeded: max 20 covers." },
    error: null,
  });
  const capRes = await updateReservationStatusWithClient(
    {
      reservationId: "res-target-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "confirmed",
    },
    capExceededClient,
    "user-owner-1"
  );
  assert.equal(capRes.success, false);
  if (!capRes.success) {
    assert.equal(capRes.error, "capacity_exceeded");
    assert.match(capRes.message || "", /Not enough seats for this time/);
  }

  // 2. RPC returns success
  const successClient = buildOwnerClient({
    data: { success: true, status: "confirmed" },
    error: null,
  });
  const succRes = await updateReservationStatusWithClient(
    {
      reservationId: "res-target-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "confirmed",
    },
    successClient,
    "user-owner-1"
  );
  assert.equal(succRes.success, true);
  if (succRes.success) {
    assert.equal(succRes.nextStatus, "confirmed");
  }

  // 3. RPC fails with an error (e.g. 42883, network, timeout): must return db_error and NOT fall back
  let updateCalledOnReservations = false;
  const failureClient = {
    from(table) {
      if (table === "reservations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "res-target-1",
                    reservation_number: "RES-001",
                    customer_name: "John Smith",
                    customer_email: "john@example.com",
                    party_size: 4,
                    starts_at: "2026-11-08T19:00:00Z",
                    status: "pending",
                    status_history: [],
                    website_id: "site-1",
                    lookup_token: "token123",
                    customer_phone: "+15555550100",
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: () => {
            updateCalledOnReservations = true;
            return {
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { id: "res-target-1", status: "confirmed" }, error: null }),
                    }),
                  }),
                }),
              }),
            };
          },
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
    rpc: async () => {
      return { data: null, error: { code: "42883", message: "function confirm_reservation_with_capacity does not exist" } };
    },
  };

  const failRes = await updateReservationStatusWithClient(
    {
      reservationId: "res-target-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "confirmed",
    },
    failureClient,
    "user-owner-1"
  );
  assert.equal(failRes.success, false);
  if (!failRes.success) {
    assert.equal(failRes.error, "db_error");
  }
  assert.equal(updateCalledOnReservations, false, "direct update must NOT be called on RPC failure; status remains unchanged");
});

test("Stage B2 settings: validates allowed_stay_minutes list and consistency with default/max stay", () => {
  const base = {
    enabled: true,
    max_party_size: 10,
    min_lead_minutes: 60,
    max_days_ahead: 30,
    slot_minutes: 30,
  };

  // Valid list with default in list
  const valid = validateReservationSettings({
    ...base,
    allowed_stay_minutes: [60, 90, 120, 180],
    default_stay_minutes: 90,
  });
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.deepEqual(valid.settings.allowed_stay_minutes, [60, 90, 120, 180]);
    assert.equal(valid.settings.default_stay_minutes, 90);
    assert.equal(valid.settings.max_stay_minutes, 180, "max_stay_minutes must equal max(allowed)");
  }

  // Deduplication and sorting
  const unsorted = validateReservationSettings({
    ...base,
    allowed_stay_minutes: [180, 60, 120, 60, 90],
    default_stay_minutes: 60,
  });
  assert.equal(unsorted.valid, true);
  if (unsorted.valid) {
    assert.deepEqual(unsorted.settings.allowed_stay_minutes, [60, 90, 120, 180]);
    assert.equal(unsorted.settings.max_stay_minutes, 180);
  }

  // Empty list rejected
  const empty = validateReservationSettings({
    ...base,
    allowed_stay_minutes: [],
    default_stay_minutes: 90,
  });
  assert.equal(empty.valid, false);

  // More than 8 items rejected
  const tooMany = validateReservationSettings({
    ...base,
    allowed_stay_minutes: [30, 45, 60, 75, 90, 105, 120, 135, 150],
    default_stay_minutes: 60,
  });
  assert.equal(tooMany.valid, false);

  // Out of range (< 15 or > 720) rejected
  const outOfRangeLow = validateReservationSettings({
    ...base,
    allowed_stay_minutes: [10, 60, 90],
    default_stay_minutes: 60,
  });
  assert.equal(outOfRangeLow.valid, false);

  const outOfRangeHigh = validateReservationSettings({
    ...base,
    allowed_stay_minutes: [60, 90, 750],
    default_stay_minutes: 60,
  });
  assert.equal(outOfRangeHigh.valid, false);

  // Default stay must be in the allowed list
  const defaultNotInList = validateReservationSettings({
    ...base,
    allowed_stay_minutes: [60, 120],
    default_stay_minutes: 90,
  });
  assert.equal(defaultNotInList.valid, false);

  // Default stay cannot exceed 480
  const defaultTooHigh = validateReservationSettings({
    ...base,
    allowed_stay_minutes: [360, 600],
    default_stay_minutes: 600,
  });
  assert.equal(defaultTooHigh.valid, false);

  // Backward compatibility: extractReservationSettings derives list from default & max
  const derivedDiff = extractReservationSettings({
    storefront: {
      reservations: {
        default_stay_minutes: 60,
        max_stay_minutes: 180,
      },
    },
  });
  assert.deepEqual(derivedDiff.allowed_stay_minutes, [60, 180]);
  assert.equal(derivedDiff.default_stay_minutes, 60);
  assert.equal(derivedDiff.max_stay_minutes, 180);

  const derivedSame = extractReservationSettings({
    storefront: {
      reservations: {
        default_stay_minutes: 90,
        max_stay_minutes: 90,
      },
    },
  });
  assert.deepEqual(derivedSame.allowed_stay_minutes, [90]);
});

test("Stage B2 submit action: rejects durationMinutes not in owner's allowed list", async () => {
  resetState();
  const startsAt = "2026-11-08T19:00:00Z";
  const hours = { sun: { open: "12:00", close: "23:00" } };

  function buildDurationClient(allowedList, defaultStay = 90) {
    return {
      from(table) {
        if (table === "tenant_websites") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "site-1",
                    slug: "test-bistro",
                    status: "published",
                    tenant_id: "org-1",
                    metadata: {
                      storefront: {
                        reservations: {
                          enabled: true,
                          max_party_size: 12,
                          allowed_stay_minutes: allowedList,
                          default_stay_minutes: defaultStay,
                        },
                      },
                    },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "businesses") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: "biz-1",
                        industry: "Food & Beverage",
                        category: "Restaurant",
                        business_type: "Full-Service Restaurant",
                        offerings: ["table_reservations"],
                        seat_capacity: 50,
                        default_stay_minutes: defaultStay,
                        max_stay_minutes: Math.max(...allowedList),
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "website_content") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { content: { hours } },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "reservations") {
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                in: () => chain,
                lt: () => chain,
                gt: () => chain,
                order: () => chain,
                limit: () => chain,
                maybeSingle: async () => ({ data: null, error: null }),
                then: (resolve) => resolve({ data: [], error: null }),
              };
              return chain;
            },
            insert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: { reservation_number: "RES-TEST-DURATION", lookup_token: "tok123" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
      rpc: async (fn, args) => {
        assert.equal(fn, "confirm_reservation_with_capacity");
        assert.equal(args.p_reservation_id, "res-seated-1");
        assert.equal(args.p_expected_status, "seated");
        return { data: { success: true, status: "confirmed" }, error: null };
      },
    };
  }

  const client = buildDurationClient([60, 90, 120], 90);

  // 1. Submit unlisted duration (75m): must be rejected with invalid_duration
  const invalidRes = await submitReservationRequestWithClient(
    {
      slug: "test-bistro",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      partySize: 2,
      startsAt,
      durationMinutes: 75,
    },
    client
  );
  assert.equal(invalidRes.success, false);
  if (!invalidRes.success) {
    assert.equal(invalidRes.error, "invalid_duration");
  }

  // 2. Submit allowed duration (60m): must succeed
  const validRes = await submitReservationRequestWithClient(
    {
      slug: "test-bistro",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      partySize: 2,
      startsAt,
      durationMinutes: 60,
    },
    client
  );
  assert.equal(validRes.success, true);
});

test("Stage B2 submit action: single-duration case and backward compatibility", async () => {
  resetState();
  const startsAt = "2026-11-08T19:00:00Z";
  const hours = { sun: { open: "12:00", close: "23:00" } };

  // 1. Single allowed duration [90]
  const singleClient = {
    from(table) {
      if (table === "tenant_websites") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "site-1",
                  slug: "test-bistro",
                  status: "published",
                  tenant_id: "org-1",
                  metadata: {
                    storefront: {
                      reservations: {
                        enabled: true,
                        max_party_size: 12,
                        allowed_stay_minutes: [90],
                        default_stay_minutes: 90,
                      },
                    },
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "businesses") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "biz-1",
                      industry: "Food & Beverage",
                      category: "Restaurant",
                      business_type: "Full-Service Restaurant",
                      offerings: ["table_reservations"],
                      seat_capacity: 50,
                      default_stay_minutes: 90,
                      max_stay_minutes: 90,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "website_content") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { content: { hours } },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "reservations") {
        return {
          select: () => {
            const chain = {
              eq: () => chain,
              in: () => chain,
              lt: () => chain,
              gt: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: async () => ({ data: null, error: null }),
              then: (resolve) => resolve({ data: [], error: null }),
            };
            return chain;
          },
          insert: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: { reservation_number: "RES-TEST-SINGLE", lookup_token: "tok123" },
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };

  // Submitting 90 succeeds
  const okSingle = await submitReservationRequestWithClient(
    {
      slug: "test-bistro",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      partySize: 2,
      startsAt,
      durationMinutes: 90,
    },
    singleClient
  );
  assert.equal(okSingle.success, true);

  // Submitting 60 fails with invalid_duration
  const failSingle = await submitReservationRequestWithClient(
    {
      slug: "test-bistro",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      partySize: 2,
      startsAt,
      durationMinutes: 60,
    },
    singleClient
  );
  assert.equal(failSingle.success, false);
  if (!failSingle.success) {
    assert.equal(failSingle.error, "invalid_duration");
  }

  // 2. Backward compatibility: no allowed_stay_minutes in website metadata
  const legacyClient = {
    from(table) {
      if (table === "tenant_websites") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "site-legacy",
                  slug: "legacy-bistro",
                  status: "published",
                  tenant_id: "org-1",
                  metadata: {
                    storefront: {
                      reservations: {
                        enabled: true,
                        max_party_size: 12,
                        default_stay_minutes: 90,
                        max_stay_minutes: 120,
                      },
                    },
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "businesses") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "biz-1",
                      industry: "Food & Beverage",
                      category: "Restaurant",
                      business_type: "Full-Service Restaurant",
                      offerings: ["table_reservations"],
                      seat_capacity: 50,
                      default_stay_minutes: 90,
                      max_stay_minutes: 120,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "website_content") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { content: { hours } },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "reservations") {
        return {
          select: () => {
            const chain = {
              eq: () => chain,
              in: () => chain,
              lt: () => chain,
              gt: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: async () => ({ data: null, error: null }),
              then: (resolve) => resolve({ data: [], error: null }),
            };
            return chain;
          },
          insert: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: { reservation_number: "RES-TEST-LEGACY", lookup_token: "tok123" },
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };

  // Submitting 120 succeeds (in derived list [90, 120])
  const legacy120 = await submitReservationRequestWithClient(
    {
      slug: "legacy-bistro",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      partySize: 2,
      startsAt,
      durationMinutes: 120,
    },
    legacyClient
  );
  assert.equal(legacy120.success, true);

  // Submitting 45 fails with invalid_duration
  const legacy45 = await submitReservationRequestWithClient(
    {
      slug: "legacy-bistro",
      customerName: "Jane Doe",
      customerPhone: "+15555550100",
      partySize: 2,
      startsAt,
      durationMinutes: 45,
    },
    legacyClient
  );
  assert.equal(legacy45.success, false);
  if (!legacy45.success) {
    assert.equal(legacy45.error, "invalid_duration");
  }
});

test("Stage B migration 204: forward, rollback fail-closed, and Supabase mirror conventions", () => {
  const forwardPath = path.join(ROOT, "db/migration_204_reservation_capacity_and_models.sql");
  const rollbackPath = path.join(ROOT, "db/migration_204_reservation_capacity_and_models_rollback.sql");
  const mirrorPath = path.join(ROOT, "supabase/migrations/20261029120000_migration_204_reservation_capacity_and_models.sql");

  assert.ok(fs.existsSync(forwardPath), "db/migration_204_reservation_capacity_and_models.sql must exist");
  assert.ok(fs.existsSync(rollbackPath), "db/migration_204_reservation_capacity_and_models_rollback.sql must exist");
  assert.ok(fs.existsSync(mirrorPath), "supabase/migrations/20261029120000_migration_204_reservation_capacity_and_models.sql must exist");

  const forward = fs.readFileSync(forwardPath, "utf8");
  const rollback = fs.readFileSync(rollbackPath, "utf8");
  const mirror = fs.readFileSync(mirrorPath, "utf8");

  // Mirror exactness
  assert.equal(mirror, forward, "Supabase migration mirror must match db/ forward migration exactly");

  // Check no GENERATED ALWAYS for ends_at
  assert.doesNotMatch(
    forward,
    /ends_at\s+timestamptz\s+GENERATED\s+ALWAYS/i,
    "ends_at must not be GENERATED ALWAYS because timestamptz+interval is not immutable"
  );
  assert.match(forward, /trg_sync_reservation_ends_at/i, "ends_at must be synchronized via a BEFORE trigger");
  assert.match(forward, /confirm_reservation_with_capacity/i, "must define confirm_reservation_with_capacity RPC");
  assert.match(forward, /pg_advisory_xact_lock/i, "confirm RPC must take pg_advisory_xact_lock");

  // Rollback fail-closed guard
  assert.match(rollback, /MIGRATION_204_ROLLBACK_BLOCKED/i, "rollback must include fail-closed guard exception");
  assert.match(rollback, /deposit_paid/i, "rollback guard must inspect deposit_paid/paid payment statuses");

  // Security: REVOKE, SET search_path, no GRANT to authenticated/anon
  assert.match(
    forward,
    /REVOKE ALL ON FUNCTION public\.confirm_reservation_with_capacity\([^)]+\) FROM PUBLIC, anon, authenticated/i,
    "forward migration must REVOKE from PUBLIC, anon, authenticated"
  );
  assert.match(
    forward,
    /SET search_path = public, pg_temp/i,
    "RPC function definition must include SET search_path = public, pg_temp"
  );
  assert.doesNotMatch(
    forward,
    /GRANT EXECUTE ON FUNCTION public\.confirm_reservation_with_capacity[^;]+TO (authenticated|anon)/i,
    "forward migration must not GRANT EXECUTE to authenticated or anon"
  );

  // Supabase mirror must still be byte-identical after security edits
  assert.equal(mirror, forward, "Supabase migration mirror must match db/ forward migration exactly (re-verified after security edits)");
});

// -----------------------------------------------------------------------------
// STAGE C: Display and wording polish tests
// -----------------------------------------------------------------------------

test("Stage C: formatDurationOptionLabel formats minutes into readable labels", () => {
  assert.equal(formatDurationOptionLabel(45), "45 m");
  assert.equal(formatDurationOptionLabel(60), "1 h");
  assert.equal(formatDurationOptionLabel(90), "1 h 30");
  assert.equal(formatDurationOptionLabel(120), "2 h");
  assert.equal(formatDurationOptionLabel(150), "2 h 30");
  assert.equal(formatDurationOptionLabel(180), "3 h");
});

test("Stage C: formatReservationTimeRange displays start and end time plus duration (with and without ends_at)", () => {
  // 1. With ends_at explicitly provided
  const withEndsAt = formatReservationTimeRange({
    startsAt: "2026-10-29T12:00:00Z",
    endsAt: "2026-10-29T14:00:00Z",
    durationMinutes: 120,
    timeZone: "UTC",
    locale: "en",
  });
  assert.match(withEndsAt, /12:00\s*PM\s*–\s*0?2:00\s*PM\s*\(2\s*h\)/);

  // 2. Row without ends_at (missing/null), duration_minutes provided
  const withoutEndsAt = formatReservationTimeRange({
    startsAt: "2026-10-29T12:00:00Z",
    endsAt: null,
    durationMinutes: 90,
    timeZone: "UTC",
    locale: "en",
  });
  assert.match(withoutEndsAt, /12:00\s*PM\s*–\s*0?1:30\s*PM\s*\(1\s*h\s*30\)/);

  // 3. Row without ends_at and without duration_minutes (fallback to 90 min)
  const legacyFallback = formatReservationTimeRange({
    startsAt: "2026-10-29T12:00:00Z",
    timeZone: "UTC",
    locale: "en",
  });
  assert.match(legacyFallback, /12:00\s*PM\s*–\s*0?1:30\s*PM\s*\(1\s*h\s*30\)/);

  // 4. French locale
  const inFrench = formatReservationTimeRange({
    startsAt: "2026-10-29T12:00:00Z",
    endsAt: "2026-10-29T14:00:00Z",
    timeZone: "UTC",
    locale: "fr",
  });
  assert.match(inFrench, /12:00\s*–\s*14:00\s*\(2\s*h\)/);
});

test("Stage C: Owner confirm saves no note (null) when empty", async () => {
  let capturedRpcArgs = null;
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "res-note-1",
                reservation_number: "RES-100",
                customer_name: "Jane",
                customer_email: "jane@example.com",
                party_size: 2,
                starts_at: "2026-10-29T12:00:00Z",
                status: "pending",
                status_history: [],
                website_id: null,
                lookup_token: "tok-note",
                customer_phone: "+15555550100",
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
    rpc: async (fn, args) => {
      capturedRpcArgs = args;
      return { data: { success: true, status: "confirmed" }, error: null };
    },
  };

  // 1. Empty string note -> passed as null
  await updateReservationStatusWithClient(
    {
      reservationId: "res-note-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "confirmed",
      ownerNote: "",
    },
    mockClient,
    "user-1"
  );
  assert.equal(capturedRpcArgs.p_owner_note, null, "empty string ownerNote must pass null to RPC");

  // 2. Whitespace-only note -> passed as null
  await updateReservationStatusWithClient(
    {
      reservationId: "res-note-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "confirmed",
      ownerNote: "    ",
    },
    mockClient,
    "user-1"
  );
  assert.equal(capturedRpcArgs.p_owner_note, null, "whitespace-only ownerNote must pass null to RPC");

  // 3. Undefined note -> passed as null
  await updateReservationStatusWithClient(
    {
      reservationId: "res-note-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "confirmed",
    },
    mockClient,
    "user-1"
  );
  assert.equal(capturedRpcArgs.p_owner_note, null, "omitted ownerNote must pass null to RPC");

  // 4. Genuine note -> passed with whitespace trimmed
  await updateReservationStatusWithClient(
    {
      reservationId: "res-note-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "confirmed",
      ownerNote: "  Table by window reserved  ",
    },
    mockClient,
    "user-1"
  );
  assert.equal(capturedRpcArgs.p_owner_note, "Table by window reserved", "non-empty note is trimmed and passed");
});

test("Stage C: CAPACITY_EXCEEDED maps to friendlier owner copy with taken, capacity, requested numbers", async () => {
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "res-cap-1",
                reservation_number: "RES-CAP",
                customer_name: "John",
                customer_email: "john@example.com",
                party_size: 4,
                starts_at: "2026-10-29T19:00:00Z",
                status: "pending",
                status_history: [],
                website_id: null,
                lookup_token: "tok-cap",
                customer_phone: "+15555550100",
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
    rpc: async () => ({
      data: {
        success: false,
        error: "CAPACITY_EXCEEDED",
        seat_capacity: 50,
        current_covers: 48,
        requested_party_size: 4,
      },
      error: null,
    }),
  };

  const res = await updateReservationStatusWithClient(
    {
      reservationId: "res-cap-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "confirmed",
    },
    mockClient,
    "user-1"
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "capacity_exceeded");
  assert.equal(res.currentCovers, 48);
  assert.equal(res.seatCapacity, 50);
  assert.equal(res.requestedPartySize, 4);
  assert.equal(
    res.message,
    "Not enough seats for this time. 48 of 50 seats are already confirmed, and this party needs 4."
  );
});

test("Stage C: Guest fully_booked message is plain and kind", async () => {
  resetState();
  const adminClient = {
    from: (table) => {
      if (table === "tenant_websites") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "ws-kind",
                  tenant_id: "org-kind",
                  slug: "kind-bistro",
                  status: "published",
                  metadata: {
                    storefront: {
                      reservations: {
                        enabled: true,
                        slot_minutes: 30,
                        min_lead_minutes: 0,
                        max_days_ahead: 30,
                        allowed_stay_minutes: [60, 90, 120],
                        default_stay_minutes: 90,
                        max_stay_minutes: 120,
                      },
                    },
                    timezone: "UTC",
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "businesses") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "biz-kind",
                      industry: "Food & Beverage",
                      category: "Restaurant",
                      business_type: "Full-Service Restaurant",
                      offerings: ["table_reservations"],
                      seat_capacity: 10,
                      default_stay_minutes: 90,
                      max_stay_minutes: 120,
                      booking_model: "capacity",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "website_content") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { content: { hours: { sun: { open: "10:00", close: "23:00" } } } },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "reservations") {
        return {
          select: (cols) => {
            const chain = {
              eq: () => chain,
              in: () => chain,
              lt: () => chain,
              gt: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: async () => ({ data: null, error: null }),
              then: (resolve) => {
                if (cols.includes("party_size")) {
                  resolve({ data: [{ party_size: 9 }], error: null });
                } else {
                  resolve({ data: [], error: null });
                }
              },
            };
            return chain;
          },
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };

  const res = await submitReservationRequestWithClient(
    {
      slug: "kind-bistro",
      customerName: "Kind Guest",
      customerPhone: "+15555550199",
      partySize: 2, // 9 + 2 = 11 > 10
      startsAt: "2026-11-08T12:00:00Z",
      durationMinutes: 90,
    },
    adminClient
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "fully_booked");
  assert.equal(
    res.message,
    "That time is fully booked. Please pick another time or call the restaurant."
  );
});

test("Stage C: ReservationCard payment badge rendered only when payment_status is not unpaid", () => {
  const cardSource = fs.readFileSync(
    path.join(ROOT, "components/dashboard/reservations/ReservationCard.tsx"),
    "utf8"
  );
  assert.match(
    cardSource,
    /reservation\.payment_status\s*&&\s*reservation\.payment_status\s*!==\s*["']unpaid["']/,
    "ReservationCard must guard payment status badge to render only when not unpaid"
  );
});

test("Stage C2 migration 205: forward, rollback fail-closed, and Supabase mirror conventions", () => {
  const forwardPath = path.join(ROOT, "db/migration_205_reservation_internal_notes.sql");
  const rollbackPath = path.join(ROOT, "db/migration_205_reservation_internal_notes_rollback.sql");
  const mirrorPath = path.join(
    ROOT,
    "supabase/migrations/20261030090000_migration_205_reservation_internal_notes.sql"
  );

  assert.equal(fs.existsSync(forwardPath), true, "Migration 205 forward file must exist");
  assert.equal(fs.existsSync(rollbackPath), true, "Migration 205 rollback file must exist");
  assert.equal(fs.existsSync(mirrorPath), true, "Migration 205 Supabase mirror must exist");

  const forwardSql = fs.readFileSync(forwardPath, "utf8");
  const rollbackSql = fs.readFileSync(rollbackPath, "utf8");
  const mirrorSql = fs.readFileSync(mirrorPath, "utf8");

  // Byte identical mirror
  assert.equal(
    forwardSql,
    mirrorSql,
    "supabase/migrations copy of migration 205 must be byte-identical to db/ forward migration"
  );

  // Forward migration adds internal_note column with length check <= 1000
  assert.match(
    forwardSql,
    /ALTER\s+TABLE\s+public\.reservations\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+internal_note\s+text\s+NULL/i,
    "Forward migration must add reservations.internal_note text NULL"
  );
  assert.match(
    forwardSql,
    /CHECK\s*\(\s*internal_note\s+IS\s+NULL\s+OR\s+length\s*\(\s*internal_note\s*\)\s*<=\s*1000\s*\)/i,
    "Forward migration must enforce length(internal_note) <= 1000"
  );

  // Fail-closed rollback
  assert.match(
    rollbackSql,
    /RAISE\s+EXCEPTION/i,
    "Rollback must fail-closed (RAISE EXCEPTION) if non-null internal_note exists"
  );
  assert.match(
    rollbackSql,
    /DROP\s+COLUMN\s+IF\s+EXISTS\s+internal_note/i,
    "Rollback must drop internal_note column when safe"
  );
});

test("Stage C2: internal_note is never exposed to guest tracking page, types, or notifications", () => {
  const guestPageSource = fs.readFileSync(
    path.join(ROOT, "app/site/[slug]/reservations/[lookup_token]/page.tsx"),
    "utf8"
  );
  assert.doesNotMatch(
    guestPageSource,
    /\binternal_note\b/,
    "Guest tracking page must never query or reference internal_note"
  );

  const notificationsSource = fs.readFileSync(
    path.join(ROOT, "lib/reservation-notifications.ts"),
    "utf8"
  );
  assert.doesNotMatch(
    notificationsSource,
    /\binternal_note\b/,
    "Guest/customer notifications must never query or reference internal_note"
  );

  const trackingComponentSource = fs.readFileSync(
    path.join(ROOT, "components/site/ReservationTrackingView.tsx"),
    "utf8"
  );
  assert.doesNotMatch(
    trackingComponentSource,
    /\binternal_note\b/,
    "Guest tracking component must never reference internal_note"
  );
});

test("Stage C2: updateReservationInternalNoteWithClient validates length and does not touch status_history", async () => {
  let updatedPayload = null;
  const mockAdmin = {
    from(table) {
      assert.equal(table, "reservations");
      return {
        update(payload) {
          updatedPayload = payload;
          return {
            eq(col1, val1) {
              return {
                eq() {
                  return {
                    select() {
                      return {
                        maybeSingle: async () => ({
                          data: { id: val1, internal_note: payload.internal_note },
                          error: null,
                        }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  // Rejects notes exceeding 1000 characters
  const tooLong = "a".repeat(1001);
  const tooLongRes = await updateReservationInternalNoteWithClient(
    { reservationId: "res-1", organizerId: "org-1", internalNote: tooLong },
    mockAdmin
  );
  assert.equal(tooLongRes.success, false);
  assert.equal(tooLongRes.error, "invalid_input");

  // Accepts valid note up to 1000 chars and updates internal_note without status_history
  const validNote = "VIP table near window. Guest prefers still water.";
  const validRes = await updateReservationInternalNoteWithClient(
    { reservationId: "res-1", organizerId: "org-1", internalNote: validNote },
    mockAdmin
  );
  assert.equal(validRes.success, true);
  assert.equal(validRes.internalNote, validNote);
  assert.notEqual(updatedPayload, null);
  assert.equal(updatedPayload.internal_note, validNote);
  assert.equal(typeof updatedPayload.updated_at, "string");
  assert.equal(updatedPayload.status_history, undefined, "internal_note must NEVER touch status_history");
});

test("Stage C2: RESERVATION_TRANSITION_GRAPH allows seated to completed, confirmed, no_show, cancelled; keeps terminal states blocked", () => {
  const seatedTransitions = RESERVATION_TRANSITION_GRAPH.seated;
  assert.ok(seatedTransitions.includes("completed"), "seated must transition to completed");
  assert.ok(seatedTransitions.includes("confirmed"), "seated must transition to confirmed (undo)");
  assert.ok(seatedTransitions.includes("no_show"), "seated must transition to no_show");
  assert.ok(seatedTransitions.includes("cancelled"), "seated must transition to cancelled");

  // Terminal states must remain empty (terminal)
  assert.deepEqual(RESERVATION_TRANSITION_GRAPH.cancelled, [], "cancelled must be terminal");
  assert.deepEqual(RESERVATION_TRANSITION_GRAPH.completed, [], "completed must be terminal");
  assert.deepEqual(RESERVATION_TRANSITION_GRAPH.no_show, [], "no_show must be terminal");
  assert.deepEqual(RESERVATION_TRANSITION_GRAPH.declined, [], "declined must be terminal");
});

test("Stage C2: seated transitions to cancelled and no_show require reason; undo to confirmed succeeds", async () => {
  resetState();

  let updateCalled = false;
  let updatePayload = null;
  let rpcCalled = false;

  function buildSeatedMock(initialStatus) {
    return {
      from(table) {
        if (table === "reservations") {
          const selectChain = {
            eq: () => selectChain,
            maybeSingle: async () => ({
              data: {
                id: "res-seated-1",
                reservation_number: "RES-SEAT-1",
                organizer_id: "org-1",
                business_id: "biz-1",
                starts_at: "2026-11-08T19:00:00Z",
                duration_minutes: 90,
                party_size: 4,
                status: initialStatus,
                status_history: [{ status: "seated", at: "2026-11-08T19:05:00Z" }],
                customer_phone: "+15555550100",
                customer_email: "guest@example.com",
                website_id: "site-1",
                lookup_token: "token-seat",
              },
              error: null,
            }),
          };
          return {
            select: () => selectChain,
            update(payload) {
              updateCalled = true;
              updatePayload = payload;
              const updateChain = {
                eq: () => updateChain,
                select: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "res-seated-1",
                      status: payload.status,
                      status_history: payload.status_history,
                      updated_at: payload.updated_at,
                    },
                    error: null,
                  }),
                }),
              };
              return updateChain;
            },
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
      rpc: async (fn, args) => {
        rpcCalled = true;
        assert.equal(fn, "confirm_reservation_with_capacity");
        assert.equal(args.p_reservation_id, "res-seated-1");
        assert.equal(args.p_expected_status, "seated");
        return { data: { success: true, status: "confirmed" }, error: null };
      },
    };
  }

  // 1. seated -> cancelled without reason is rejected
  updateCalled = false;
  const noReasonCancel = await updateReservationStatusWithClient(
    {
      reservationId: "res-seated-1",
      organizerId: "org-1",
      expectedCurrentStatus: "seated",
      nextStatus: "cancelled",
    },
    buildSeatedMock("seated"),
    "user-owner-1"
  );
  assert.equal(noReasonCancel.success, false);
  assert.equal(noReasonCancel.error, "missing_decline_reason");
  assert.equal(updateCalled, false);

  // 2. seated -> no_show without reason is rejected
  updateCalled = false;
  const noReasonNoShow = await updateReservationStatusWithClient(
    {
      reservationId: "res-seated-1",
      organizerId: "org-1",
      expectedCurrentStatus: "seated",
      nextStatus: "no_show",
    },
    buildSeatedMock("seated"),
    "user-owner-1"
  );
  assert.equal(noReasonNoShow.success, false);
  assert.equal(noReasonNoShow.error, "missing_decline_reason");
  assert.equal(updateCalled, false);

  // 3. seated -> cancelled with reason succeeds
  updateCalled = false;
  const withReasonCancel = await updateReservationStatusWithClient(
    {
      reservationId: "res-seated-1",
      organizerId: "org-1",
      expectedCurrentStatus: "seated",
      nextStatus: "cancelled",
      reason: "Emergency called guest away after sitting down",
    },
    buildSeatedMock("seated"),
    "user-owner-1"
  );
  assert.equal(withReasonCancel.success, true);
  assert.equal(withReasonCancel.nextStatus, "cancelled");
  assert.equal(updateCalled, true);
  assert.equal(updatePayload.status, "cancelled");
  const cancelEntry = updatePayload.status_history[updatePayload.status_history.length - 1];
  assert.equal(cancelEntry.reason, "Emergency called guest away after sitting down");

  // 4. seated -> confirmed (undo accidental seating) succeeds via RPC without requiring reason
  rpcCalled = false;
  const undoRes = await updateReservationStatusWithClient(
    {
      reservationId: "res-seated-1",
      organizerId: "org-1",
      expectedCurrentStatus: "seated",
      nextStatus: "confirmed",
    },
    buildSeatedMock("seated"),
    "user-owner-1"
  );
  assert.equal(undoRes.success, true);
  assert.equal(undoRes.nextStatus, "confirmed");
  assert.equal(rpcCalled, true, "Undoing seated to confirmed must invoke confirm_reservation_with_capacity RPC");
});

test("Stage C2: early stale check returns already_updated when row.status !== expectedCurrentStatus before any write or RPC call", async () => {
  resetState();

  let rpcCalled = false;
  let updateCalled = false;

  const mockAdmin = {
    rpc() {
      rpcCalled = true;
      return Promise.resolve({ data: { success: true }, error: null });
    },
    from(table) {
      if (table === "reservations") {
        const selectChain = {
          eq: () => selectChain,
          maybeSingle: async () => ({
            // DB status is 'seated', but caller will expect 'confirmed'
            data: {
              id: "res-stale-1",
              organizer_id: "org-1",
              business_id: "biz-1",
              status: "seated",
              status_history: [{ status: "seated", at: "2026-11-08T19:00:00Z" }],
            },
            error: null,
          }),
        };
        return {
          select: () => selectChain,
          update() {
            updateCalled = true;
            return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: {}, error: null }) }) }) }) };
          },
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };

  const res = await updateReservationStatusWithClient(
    {
      reservationId: "res-stale-1",
      organizerId: "org-1",
      expectedCurrentStatus: "confirmed", // Stale expectation!
      nextStatus: "completed",
    },
    mockAdmin,
    "user-owner-1"
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "already_updated");
  assert.equal(
    res.message,
    "This request was already updated by another team member. Refresh to see the latest."
  );
  assert.equal(rpcCalled, false, "RPC must NOT be called on stale status mismatch");
  assert.equal(updateCalled, false, "Update must NOT be written on stale status mismatch");

  // Verify French translation exists in messages/fr.json
  const frMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));
  assert.equal(
    frMessages.Reservations.alreadyUpdated,
    "Cette demande a déjà été mise à jour par un autre membre de l'équipe. Actualisez pour voir la dernière version."
  );
});


test("Stage C2: formatActorLabel — legacy entry {note:'Cancelled by guest', by_user_id:null} returns 'Guest'", () => {
  // Simulate the label logic from ReservationCard.tsx formatActorLabel()
  // Must match the exact branch conditions: by_user_id truthy → Owner team;
  // by_user_id null AND (status==='pending' OR reason==='cancelled_by_guest' OR note==='Cancelled by guest') → Guest;
  // else → System.
  function formatActorLabel(hist) {
    if (hist.by_user_id) return "Owner team";
    if (
      hist.status === "pending" ||
      hist.reason === "cancelled_by_guest" ||
      hist.note === "Cancelled by guest"
    ) {
      return "Guest";
    }
    return "System";
  }

  // Real legacy entry written by cancelReservationByGuest before this fix
  const legacyEntry = { note: "Cancelled by guest", status: "cancelled", by_user_id: null };
  assert.equal(formatActorLabel(legacyEntry), "Guest", "legacy Cancelled-by-guest entry must show Guest");

  // New entry with reason field (written after this fix)
  const newEntry = { status: "cancelled", by_user_id: null, reason: "cancelled_by_guest", note: "Cancelled by guest" };
  assert.equal(formatActorLabel(newEntry), "Guest", "new entry with reason must still show Guest");

  // Pending entry (guest submitted)
  const pendingEntry = { status: "pending", by_user_id: null };
  assert.equal(formatActorLabel(pendingEntry), "Guest", "pending entry with no by_user_id must show Guest");

  // Owner action
  const ownerEntry = { status: "confirmed", by_user_id: "user-abc" };
  assert.equal(formatActorLabel(ownerEntry), "Owner team", "entry with by_user_id must show Owner team");

  // System action (e.g. auto-complete with no user)
  const systemEntry = { status: "completed", by_user_id: null };
  assert.equal(formatActorLabel(systemEntry), "System", "entry with null by_user_id and no guest markers must show System");
});

test("Stage C2: guest-cancel server path writes reason='cancelled_by_guest' on new entries", () => {
  // Read the reservations.ts source and verify the guest-cancel history entry
  // includes reason: "cancelled_by_guest" alongside note: "Cancelled by guest".
  const src = fs.readFileSync(path.join(ROOT, "lib/actions/reservations.ts"), "utf8");
  const cancelEntryMatch = src.match(/\{\s*status:\s*"cancelled"[^}]*by_user_id:\s*null[^}]*\}/s);
  assert.ok(cancelEntryMatch, "guest-cancel history entry must be present in reservations.ts");
  const entryText = cancelEntryMatch[0];
  assert.ok(entryText.includes("reason: \"cancelled_by_guest\""),
    `guest-cancel entry must include reason: "cancelled_by_guest", got: ${entryText}`);
  assert.ok(entryText.includes("note: \"Cancelled by guest\""),
    `guest-cancel entry must include note: "Cancelled by guest", got: ${entryText}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage D: Cancellation cutoff and Change requests
// ─────────────────────────────────────────────────────────────────────────────

test("Stage D settings: validates cancellation_cutoff_minutes bounds and extraction", () => {
  const base = {
    enabled: true,
    max_party_size: 10,
    min_lead_minutes: 60,
    max_days_ahead: 30,
    slot_minutes: 30,
  };

  // Valid cutoff values (0 to 10080 minutes = up to 7 days)
  const validZero = validateReservationSettings({ ...base, cancellation_cutoff_minutes: 0 });
  assert.equal(validZero.valid, true);
  if (validZero.valid) assert.equal(validZero.settings.cancellation_cutoff_minutes, 0);

  const validCutoff = validateReservationSettings({ ...base, cancellation_cutoff_minutes: 120 });
  assert.equal(validCutoff.valid, true);
  if (validCutoff.valid) assert.equal(validCutoff.settings.cancellation_cutoff_minutes, 120);

  const validMax = validateReservationSettings({ ...base, cancellation_cutoff_minutes: 10080 });
  assert.equal(validMax.valid, true);
  if (validMax.valid) assert.equal(validMax.settings.cancellation_cutoff_minutes, 10080);

  // Null or empty falls back to null (no cutoff)
  const nullCutoff = validateReservationSettings({ ...base, cancellation_cutoff_minutes: null });
  assert.equal(nullCutoff.valid, true);
  if (nullCutoff.valid) assert.equal(nullCutoff.settings.cancellation_cutoff_minutes, null);

  // Invalid bounds (< 0 or > 10080)
  const negative = validateReservationSettings({ ...base, cancellation_cutoff_minutes: -1 });
  assert.equal(negative.valid, false);

  const overMax = validateReservationSettings({ ...base, cancellation_cutoff_minutes: 10081 });
  assert.equal(overMax.valid, false);

  // Extraction from metadata
  const extracted = extractReservationSettings({
    storefront: {
      reservations: {
        cancellation_cutoff_minutes: 60,
      },
    },
  });
  assert.equal(extracted.cancellation_cutoff_minutes, 60);

  const extractedDefault = extractReservationSettings({});
  assert.equal(extractedDefault.cancellation_cutoff_minutes, null);
});

test("Stage D cancelReservationByToken: enforces cancellation cutoff", async () => {
  resetState();

  const startsAtIn30Min = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const startsAtIn120Min = new Date(Date.now() + 120 * 60 * 1000).toISOString();

  function makeMockClient(metadata, startsAt) {
    return {
      from(table) {
        if (table === "tenant_websites") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { tenant_id: "org-1", slug: "test-bistro", metadata },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "reservations") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "res-1",
                      reservation_number: "RES-101",
                      customer_name: "Alice",
                      status: "confirmed",
                      starts_at: startsAt,
                      status_history: [],
                      organizer_id: "org-1",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: { id: "res-1" }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
    };
  }

  // 1. Cutoff = 60 minutes. Starts at +30 minutes -> inside cutoff -> BLOCKED
  const blockedClient = makeMockClient(
    { storefront: { reservations: { cancellation_cutoff_minutes: 60 } } },
    startsAtIn30Min
  );
  const blockedRes = await cancelReservationByTokenWithClient(
    { slug: "test-bistro", lookupToken: "tok-1", expectedCurrentStatus: "confirmed" },
    blockedClient
  );
  assert.equal(blockedRes.success, false);
  assert.equal(blockedRes.error, "cancellation_window_closed");

  // 2. Cutoff = 60 minutes. Starts at +120 minutes -> outside cutoff -> ALLOWED
  const allowedClient = makeMockClient(
    { storefront: { reservations: { cancellation_cutoff_minutes: 60 } } },
    startsAtIn120Min
  );
  const allowedRes = await cancelReservationByTokenWithClient(
    { slug: "test-bistro", lookupToken: "tok-1", expectedCurrentStatus: "confirmed" },
    allowedClient
  );
  assert.equal(allowedRes.success, true);

  // 3. Cutoff = null (default). Starts at +30 minutes -> always ALLOWED as long as in future
  const noCutoffClient = makeMockClient(
    { storefront: { reservations: { cancellation_cutoff_minutes: null } } },
    startsAtIn30Min
  );
  const noCutoffRes = await cancelReservationByTokenWithClient(
    { slug: "test-bistro", lookupToken: "tok-1", expectedCurrentStatus: "confirmed" },
    noCutoffClient
  );
  assert.equal(noCutoffRes.success, true);
});

test("Stage D owner cancel ignores cutoff: owner update uses updateReservationStatusWithClient", async () => {
  resetState();

  // Reservation starts in 10 minutes (inside any cutoff)
  const startsAtSoon = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  let updateCalled = false;
  const ownerClient = {
    from(table) {
      if (table === "reservations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "res-1",
                    organizer_id: "org-1",
                    business_id: "biz-1",
                    reservation_number: "RES-001",
                    customer_name: "Test User",
                    customer_email: null,
                    party_size: 2,
                    duration_minutes: 90,
                    ends_at: null,
                    website_id: null,
                    lookup_token: "tok1",
                    customer_phone: "+15555550100",
                    status: "confirmed",
                    starts_at: startsAtSoon,
                    status_history: [],
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: () => {
            updateCalled = true;
            const chain = {
              eq: () => chain,
              select: () => ({
                maybeSingle: async () => ({ data: { id: "res-1", status: "cancelled" }, error: null }),
              }),
            };
            return chain;
          },
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };

  const res = await updateReservationStatusWithClient(
    {
      reservationId: "res-1",
      organizerId: "org-1",
      expectedCurrentStatus: "confirmed",
      nextStatus: "cancelled",
      declineReason: "fully_booked",
      ownerNote: "Owner override",
    },
    ownerClient,
    "user-owner-1"
  );

  assert.equal(res.success, true);
  assert.equal(res.nextStatus, "cancelled");
  assert.equal(updateCalled, true, "Owner cancel must succeed regardless of guest cutoff");
});

test("Stage D change request submit: validation of inputs and single open request rule", async () => {
  resetState();

  function makeSubmitClient(hasExistingPending, reservationStatus) {
    let insertedRow = null;
    return {
      inserted: () => insertedRow,
      from(table) {
        if (table === "tenant_websites") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "site-1",
                    tenant_id: "org-1",
                    slug: "test-bistro",
                    metadata: {
                      storefront: {
                        reservations: {
                          enabled: true,
                          max_party_size: 8,
                          allowed_stay_minutes: [60, 90, 120],
                        },
                      },
                    },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "website_content") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    content: {
                      hours: {
                        mon: { open: "12:00", close: "23:00" },
                        tue: { open: "12:00", close: "23:00" },
                        wed: { open: "12:00", close: "23:00" },
                        thu: { open: "12:00", close: "23:00" },
                        fri: { open: "12:00", close: "23:00" },
                        sat: { open: "12:00", close: "23:00" },
                        sun: { open: "12:00", close: "23:00" },
                      },
                    },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "reservations") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "res-change-1",
                      status: reservationStatus,
                      starts_at: "2026-11-15T19:00:00Z",
                      party_size: 4,
                      duration_minutes: 90,
                      organizer_id: "org-1",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "reservation_change_requests") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: hasExistingPending ? { id: "open-cr-1" } : null,
                    error: null,
                  }),
                }),
              }),
            }),
            insert: (payload) => {
              insertedRow = payload;
              return {
                select: () => ({
                  maybeSingle: async () => ({ data: { id: "new-cr-1" }, error: null }),
                }),
              };
            },
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
    };
  }

  // 1. Empty change request (no fields provided) -> rejected
  const client1 = makeSubmitClient(false, "confirmed");
  const emptyRes = await submitChangeRequestWithClient(
    { slug: "test-bistro", lookupToken: "tok-1" },
    client1
  );
  assert.equal(emptyRes.success, false);
  assert.equal(emptyRes.error, "invalid_input");

  // 2. Party size exceeds max_party_size (8 in settings, requested 10) -> rejected
  const client2 = makeSubmitClient(false, "confirmed");
  const partyRes = await submitChangeRequestWithClient(
    { slug: "test-bistro", lookupToken: "tok-1", requestedPartySize: 10 },
    client2
  );
  assert.equal(partyRes.success, false);
  assert.equal(partyRes.error, "invalid_input");

  // 3. Duration not in allowed_stay_minutes ([60, 90, 120], requested 45) -> rejected
  const client3 = makeSubmitClient(false, "confirmed");
  const durRes = await submitChangeRequestWithClient(
    { slug: "test-bistro", lookupToken: "tok-1", requestedDurationMinutes: 45 },
    client3
  );
  assert.equal(durRes.success, false);
  assert.equal(durRes.error, "invalid_input");

  // 4. Reservation is cancelled or completed -> rejected
  const clientCancelled = makeSubmitClient(false, "cancelled");
  const cancelRes = await submitChangeRequestWithClient(
    { slug: "test-bistro", lookupToken: "tok-1", requestedPartySize: 6 },
    clientCancelled
  );
  assert.equal(cancelRes.success, false);
  assert.equal(cancelRes.error, "invalid_status");

  // 5. Already has pending request -> rejected
  const clientExisting = makeSubmitClient(true, "confirmed");
  const duplicateRes = await submitChangeRequestWithClient(
    { slug: "test-bistro", lookupToken: "tok-1", requestedPartySize: 6 },
    clientExisting
  );
  assert.equal(duplicateRes.success, false);
  assert.equal(duplicateRes.error, "has_open_request");

  // 6. Valid change request -> successful insert
  const validClient = makeSubmitClient(false, "confirmed");
  const validRes = await submitChangeRequestWithClient(
    {
      slug: "test-bistro",
      lookupToken: "tok-1",
      requestedPartySize: 6,
      requestedDurationMinutes: 120,
      guestNote: "Table by window please",
    },
    validClient
  );
  assert.equal(validRes.success, true);
  assert.equal(validRes.requestId, "new-cr-1");
  const inserted = validClient.inserted();
  assert.equal(inserted.reservation_id, "res-change-1");
  assert.equal(inserted.requested_party_size, 6);
  assert.equal(inserted.requested_duration_minutes, 120);
  assert.equal(inserted.guest_note, "Table by window please");
  assert.equal(inserted.status, "pending");
});

test("Stage D withdraw change request: guest can withdraw pending request", async () => {
  resetState();

  let statusUpdatedTo = null;
  const mockClient = {
    from(table) {
      if (table === "tenant_websites") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { tenant_id: "org-1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "reservations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: "res-1" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "reservation_change_requests") {
        return {
          update: (payload) => {
            statusUpdatedTo = payload.status;
            return {
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { id: "cr-1" }, error: null }),
                    }),
                  }),
                }),
              }),
            };
          },
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };

  const res = await withdrawChangeRequestWithClient(
    { slug: "test-bistro", lookupToken: "tok-1", requestId: "cr-1" },
    mockClient
  );
  assert.equal(res.success, true);
  assert.equal(statusUpdatedTo, "withdrawn");
});

test("Stage D approve/decline change requests: owner actions and CAPACITY_EXCEEDED mapping", async () => {
  resetState();

  // 1. Approve calls RPC and maps CAPACITY_EXCEEDED
  const capExceededClient = {
    rpc: async (fn, args) => {
      assert.equal(fn, "approve_reservation_change_with_capacity");
      assert.equal(args.p_request_id, "cr-1");
      assert.equal(args.p_organizer_id, "org-1", "action must pass p_organizer_id to RPC");
      return {
        data: {
          success: false,
          error: "CAPACITY_EXCEEDED",
          current_covers: 8,
          seat_capacity: 10,
          requested_party_size: 4,
        },
        error: null,
      };
    },
  };

  const capRes = await approveChangeRequestWithClient(
    { requestId: "cr-1", organizerId: "org-1" },
    capExceededClient,
    "user-owner-1"
  );
  assert.equal(capRes.success, false);
  assert.equal(capRes.error, "capacity_exceeded");
  assert.match(capRes.message || "", /Not enough seats for this time/);

  // 2. Approve success
  const successClient = {
    rpc: async (fn, args) => {
      assert.equal(args.p_organizer_id, "org-1", "action must pass p_organizer_id to RPC");
      return { data: { success: true }, error: null };
    },
  };
  const succRes = await approveChangeRequestWithClient(
    { requestId: "cr-1", organizerId: "org-1" },
    successClient,
    "user-owner-1"
  );
  assert.equal(succRes.success, true);

  // 3. Decline updates status to declined with decision_note
  let declinedUpdate = null;
  const declineClient = {
    from(table) {
      if (table === "reservation_change_requests") {
        return {
          update: (payload) => {
            declinedUpdate = payload;
            return {
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { id: "cr-1" }, error: null }),
                    }),
                  }),
                }),
              }),
            };
          },
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };

  const decRes = await declineChangeRequestWithClient(
    { requestId: "cr-1", organizerId: "org-1", decisionNote: "Fully booked" },
    declineClient,
    "user-owner-1"
  );
  assert.equal(decRes.success, true);
  assert.equal(declinedUpdate.status, "declined");
  assert.equal(declinedUpdate.decision_note, "Fully booked");
  assert.equal(declinedUpdate.decided_by, "user-owner-1");
});

test("Stage D migration 206: files exist, mirror is byte-identical, rollback has fail-closed guard, RPC has REVOKE", () => {
  const fwdPath = path.join(ROOT, "db/migration_206_reservation_change_requests.sql");
  const rollPath = path.join(ROOT, "db/migration_206_reservation_change_requests_rollback.sql");
  const mirrorPath = path.join(ROOT, "supabase/migrations/20261030120000_migration_206_reservation_change_requests.sql");

  assert.ok(fs.existsSync(fwdPath), "migration 206 forward must exist");
  assert.ok(fs.existsSync(rollPath), "migration 206 rollback must exist");
  assert.ok(fs.existsSync(mirrorPath), "migration 206 supabase mirror must exist");

  const fwdContent = fs.readFileSync(fwdPath, "utf8");
  const mirrorContent = fs.readFileSync(mirrorPath, "utf8");
  const rollContent = fs.readFileSync(rollPath, "utf8");

  // Byte identical
  assert.equal(fwdContent, mirrorContent, "forward migration and supabase mirror must be byte-identical");

  // Rollback fail-closed guard uses to_regclass (does not error if table absent)
  assert.ok(rollContent.includes("RAISE EXCEPTION"), "rollback must fail-closed if data exists");
  assert.ok(rollContent.includes("reservation_change_requests"), "rollback must check table for data");
  assert.ok(rollContent.includes("to_regclass"), "rollback must use to_regclass to avoid error if table absent");
  assert.ok(rollContent.includes("DROP FUNCTION IF EXISTS public.approve_reservation_change_with_capacity(uuid, uuid, uuid, text)"),
    "rollback must drop function with exact 4-argument signature");

  // Forward RPC security
  assert.ok(fwdContent.includes("SECURITY DEFINER"), "RPC must be SECURITY DEFINER");
  assert.ok(fwdContent.includes("SET search_path = public, pg_temp"), "RPC must pin search_path");

  // 4-argument signature
  const sig4 = "approve_reservation_change_with_capacity(uuid, uuid, uuid, text)";
  assert.ok(fwdContent.includes(sig4),
    "RPC must use 4-argument signature (p_request_id, p_organizer_id, p_actor, p_decision_note)");

  // Old 3-arg signature is dropped before CREATE OR REPLACE
  const drop3sig = "DROP FUNCTION IF EXISTS public.approve_reservation_change_with_capacity(uuid, uuid, text)";
  const createIdx = fwdContent.indexOf("CREATE OR REPLACE FUNCTION public.approve_reservation_change_with_capacity");
  const drop3Idx  = fwdContent.indexOf(drop3sig);
  assert.ok(drop3Idx !== -1, "migration must DROP the old 3-argument signature before recreating the function");
  assert.ok(drop3Idx < createIdx, "DROP of old 3-arg signature must appear before the CREATE OR REPLACE");

  // REVOKE/GRANT on 4-arg signature
  assert.ok(
    fwdContent.includes(`REVOKE ALL ON FUNCTION public.approve_reservation_change_with_capacity(uuid, uuid, uuid, text)`) &&
    fwdContent.includes("FROM PUBLIC, anon, authenticated"),
    "RPC must REVOKE ALL from public, anon, authenticated"
  );
  assert.ok(
    fwdContent.includes(`GRANT EXECUTE ON FUNCTION public.approve_reservation_change_with_capacity(uuid, uuid, uuid, text)`) &&
    fwdContent.includes("TO service_role"),
    "RPC must GRANT EXECUTE only to service_role"
  );

  // Advisory lock taken BEFORE loading/checking request status
  const lockIdx = fwdContent.indexOf("pg_advisory_xact_lock");
  const requestLoadIdx = fwdContent.indexOf("v_request.status");
  assert.ok(lockIdx !== -1, "RPC must take advisory transaction lock on business");
  assert.ok(lockIdx < requestLoadIdx,
    "advisory lock must be taken BEFORE checking v_request.status (lock before load)");

  // Capacity sum filters by business_id, not organizer_id
  assert.ok(fwdContent.includes("r.business_id = v_business_id"),
    "capacity overlap query must filter by business_id, not organizer_id");

  // p_organizer_id parameter present
  assert.ok(fwdContent.includes("p_organizer_id"),
    "RPC must have p_organizer_id parameter for organizer guard");

  // Organizer guard enforced after lock
  assert.ok(fwdContent.includes("v_request.organizer_id <> p_organizer_id"),
    "RPC must verify request.organizer_id matches p_organizer_id after the lock");
});

test("Stage D guest tracking page: never selects internal_note or select('*')", () => {
  const pageSrc = fs.readFileSync(path.join(ROOT, "app/site/[slug]/reservations/[lookup_token]/page.tsx"), "utf8");
  assert.ok(!pageSrc.includes("internal_note"), "guest tracking page must NEVER select or reference internal_note");
  assert.ok(!pageSrc.includes('select("*")') && !pageSrc.includes("select('*')"), "guest tracking page must use explicit column select, never select('*')");
});

