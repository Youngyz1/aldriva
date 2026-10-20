/**
 * lib/__tests__/phase4bc-orders.test.cjs
 *
 * Phase 4b+4c: Order operations hermetic tests.
 * Covers:
 *  - updateOrderStatusWithClient: valid transitions, invalid transitions, terminal statuses,
 *    concurrency detection, estimated_ready_at requirement, cancellation reasons.
 *  - adjustEstimatedReadyTimeWithClient: allowed on accepted/preparing; rejected on others.
 *  - Order overdue computation: pending >10m, accepted/preparing past ready time,
 *    ready/completed/cancelled never overdue, minutes late, reason field.
 *  - Checkout timing validation: open hours, overnight intervals, min lead time, max horizon, timezone.
 *  - Payment collection guard: pay-on-fulfilment collection confirmation, online pay guard.
 *  - Tracking lookup & PII masking.
 *  - Migration 174 absence resilience fallback.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
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

const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request === "server-only") return "server-only";
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "stub-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "stub-service-key";

// Stub external side-effects
const originalLoad = Module._load;
const emailDispatches = [];
const revalidatedPaths = [];
Module._load = function mockedLoad(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  if (request === "next/headers") {
    return { headers: async () => ({ get: () => null }) };
  }
  if (request === "next/cache") {
    return { revalidatePath: (route) => revalidatedPaths.push(route) };
  }
  if (request.endsWith("lib/order-notifications") || request.endsWith("lib/order-notifications.ts")) {
    return {
      dispatchCustomerOrderStatusEmail: async (payload) => {
        emailDispatches.push(payload);
        return { dispatched: true };
      },
      dispatchOrderNotifications: async () => {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  updateOrderStatusWithClient,
  adjustEstimatedReadyTimeWithClient,
} = require(path.join(ROOT, "lib/actions/orders.ts"));
const { executeOrderStatusTransitionCore } = require(path.join(ROOT, "lib/orders/transition-core.ts"));

const {
  computeOrderOverdue,
} = require(path.join(ROOT, "lib/order-overdue.ts"));

const {
  validateScheduledOrderTime,
} = require(path.join(ROOT, "lib/website-hours.ts"));

const {
  maskCustomerName,
  maskCustomerPhone,
} = require(path.join(ROOT, "lib/order-masking.ts"));

// ─────────────────────────────────────────────────────────────────────────────
// Mock builder
//
// The actual updateOrderStatusWithClient fetches the order with:
//   admin.from("orders").select(...).eq("id",...).eq("organizer_id",...).maybeSingle()
//
// Then updates with:
//   admin.from("orders").update(payload).eq("id",...).eq("organizer_id",...).eq("status",...).select(...).maybeSingle()
//
// adjustEstimatedReadyTimeWithClient fetches with two-eq chain then updates with two-eq chain (no status eq).
// ─────────────────────────────────────────────────────────────────────────────

function makeEqChain(terminal) {
  // Returns an object that chains arbitrary .eq() calls and ends with the terminal.
  const handler = new Proxy({}, {
    get(_, prop) {
      if (prop === "maybeSingle") return terminal;
      if (prop === "select") return () => handler; // pass-through select inside fetch chain
      return () => handler; // every .eq() returns same handler
    },
  });
  return handler;
}

/**
 * Creates a thenable proxy that:
 *  - Resolves as { error: null, data: null } when awaited directly (adjustEstimatedReadyTime pattern)
 *  - Supports .select().maybeSingle() (updateOrderStatus pattern)
 *  - Chains infinite .eq() calls
 */
function makeUpdateEqChain(updateResult, onEq = () => {}) {
  function makeChain() {
    const chain = {
      // Allow .eq() to keep chaining
      eq: (column, value) => {
        onEq(column, value);
        return makeChain();
      },
      // Support .select().maybeSingle() pattern
      select: () => ({
        maybeSingle: async () => updateResult,
      }),
      // Thenable: allow `const { error } = await chain`
      then: (resolve, reject) => Promise.resolve(updateResult).then(resolve, reject),
    };
    return chain;
  }
  return makeChain();
}

/**
 * Creates a mock Supabase admin client.
 *
 * @param {object|null} orderData - row returned by the initial SELECT
 * @param {"ok"|"not_found"|"error"} updateBehaviour
 *   - "ok": update returns the updated row (no error)
 *   - "not_found": update returns data: null, error: null (concurrency miss in maybeSingle)
 *   - "error": update returns an error
 */
function createMockSupabase(orderData, updateBehaviour = "ok", options = {}) {
  let capturedPayload = null;
  const updateEqFilters = [];
  return {
    getUpdatedPayload: () => capturedPayload,
    getUpdateEqFilters: () => updateEqFilters,
    from: (table) => ({
      select: () => makeEqChain(async () => {
        if (table === "tenant_websites") return { data: options.websiteRow ?? null, error: null };
        if (orderData === null) return { data: null, error: null };
        return { data: { ...orderData }, error: null };
      }),
      update: (payload) => {
        capturedPayload = payload;
        let updateResult;
        if (updateBehaviour === "not_found") {
          updateResult = { data: null, error: null };
        } else if (updateBehaviour === "error") {
          updateResult = { data: null, error: { message: "db error", code: "23505" } };
        } else {
          updateResult = {
            data: { id: "ord-1", status: payload.status, payment_status: payload.payment_status || orderData?.payment_status },
            error: null,
          };
        }
        return makeUpdateEqChain(updateResult, (column, value) => updateEqFilters.push([column, value]));
      },
    }),
  };
}

// ── 1. Order Status Transitions & Graph ──────────────────────────────────────

// Actual signature: updateOrderStatusWithClient(input: UpdateOrderStatusInput, admin, userId)
// UpdateOrderStatusInput: { orderId, organizerId, expectedCurrentStatus, nextStatus, estimatedReadyAt?, cancellationReason?, cancellationNote?, markPaymentCollected? }

test("Phase 4b: updateOrderStatus valid transition pending -> accepted requires ready time", async () => {
  const order = {
    id: "ord-1",
    organizer_id: "org-1",
    order_number: "ORD-001",
    status: "pending",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    status_history: [],
    tracking_token: "tok-abc",
  };

  const client = createMockSupabase(order);
  const futureTime = new Date(Date.now() + 20 * 60_000).toISOString();

  // Missing estimated_ready_at → blocked
  const resMissing = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "accepted",
      // no estimatedReadyAt
    },
    client,
    "usr-1"
  );

  assert.equal(resMissing.success, false);
  assert.equal(resMissing.error, "missing_ready_time");

  // With estimated_ready_at → success
  const resSuccess = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "accepted",
      estimatedReadyAt: futureTime,
    },
    client,
    "usr-1"
  );

  assert.equal(resSuccess.success, true);
  assert.equal(client.getUpdatedPayload().status, "accepted");
  assert.equal(client.getUpdatedPayload().estimated_ready_at, futureTime);
  assert.equal(Array.isArray(client.getUpdatedPayload().status_history), true);
  assert.equal(client.getUpdatedPayload().status_history.length, 1);
});

test("mocked: manager ready transition keeps history, migration-174 timing, email, revalidation, and CAS", async () => {
  emailDispatches.length = 0;
  revalidatedPaths.length = 0;
  const estimatedReadyAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const order = {
    id: "ord-1",
    order_number: "ORD-001",
    status: "preparing",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    customer_email: "buyer@example.test",
    customer_name: "Test Buyer",
    fulfilment_type: "pickup",
    currency: "XOF",
    total_amount: 500,
    tracking_token: "tracking-token",
    website_id: "site-1",
    status_history: [{ status: "accepted", at: "2026-10-20T12:00:00.000Z", by_user_id: "manager-1" }],
    estimated_ready_at: estimatedReadyAt,
  };
  const client = createMockSupabase(order, "ok", {
    websiteRow: { slug: "test-shop", metadata: { timezone: "Africa/Abidjan" } },
  });

  const result = await updateOrderStatusWithClient(
    { orderId: "ord-1", organizerId: "org-1", expectedCurrentStatus: "preparing", nextStatus: "ready" },
    client,
    "manager-1"
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(result.success, true);
  const payload = client.getUpdatedPayload();
  const history = payload.status_history;
  assert.equal(history.length, 2);
  assert.equal(history[1].status, "ready");
  assert.equal(history[1].by_user_id, "manager-1");
  assert.equal(history[1].estimated_ready_at, estimatedReadyAt);
  assert.ok(client.getUpdateEqFilters().some(([column, value]) => column === "status" && value === "preparing"));
  assert.ok(revalidatedPaths.includes("/dashboard/org/org-1/orders"));
  assert.ok(emailDispatches.some((email) => email.orderId === "ord-1" && email.status === "ready"));
});

test("mocked: cook core records null user attribution and worker snapshot under business-scoped CAS", async () => {
  emailDispatches.length = 0;
  revalidatedPaths.length = 0;
  const order = {
    id: "ord-1",
    business_id: "business-1",
    organizer_id: "org-1",
    order_number: "ORD-001",
    status: "preparing",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    customer_email: "buyer@example.test",
    customer_name: "Test Buyer",
    fulfilment_type: "pickup",
    currency: "XOF",
    total_amount: 500,
    tracking_token: "tracking-token",
    website_id: "site-1",
    status_history: [],
    estimated_ready_at: "2026-10-20T12:30:00.000Z",
  };
  const client = createMockSupabase(order, "ok", { websiteRow: { slug: "test-shop", metadata: {} } });
  const result = await executeOrderStatusTransitionCore(
    { orderId: "ord-1", organizerId: "org-1", expectedCurrentStatus: "preparing", nextStatus: "ready" },
    client,
    null,
    order,
    true,
    false,
    { workerId: "cook-1", workerName: "Ama Cook" },
    ["/kitchen"],
    "business-1"
  );

  assert.equal(result.success, true);
  const history = client.getUpdatedPayload().status_history;
  assert.equal(history[0].status, "ready");
  assert.equal(history[0].by_user_id, null);
  assert.equal(history[0].worker_id, "cook-1");
  assert.equal(history[0].worker_name, "Ama Cook");
  assert.equal(history[0].estimated_ready_at, "2026-10-20T12:30:00.000Z");
  assert.ok(client.getUpdateEqFilters().some(([column, value]) => column === "business_id" && value === "business-1"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(revalidatedPaths.includes("/kitchen"));
  assert.ok(emailDispatches.some((email) => email.orderId === "ord-1" && email.status === "ready"));
});

test("Phase 4b: updateOrderStatus pending -> cancelled requires valid cancellation reason", async () => {
  const order = {
    id: "ord-1",
    organizer_id: "org-1",
    order_number: "ORD-001",
    status: "pending",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    status_history: [],
    tracking_token: "tok-abc",
  };

  const client = createMockSupabase(order);

  // Missing reason → "missing_cancellation_reason" (actual error code)
  const resNoReason = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "cancelled",
      // no cancellationReason
    },
    client,
    "usr-1"
  );

  assert.equal(resNoReason.success, false);
  assert.equal(resNoReason.error, "missing_cancellation_reason");

  // Valid reason → success
  const resValid = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "cancelled",
      cancellationReason: "out_of_stock",
      cancellationNote: "Ran out of rice",
    },
    client,
    "usr-1"
  );

  assert.equal(resValid.success, true);
  assert.equal(client.getUpdatedPayload().status, "cancelled");
  assert.equal(client.getUpdatedPayload().cancellation_reason, "out_of_stock");
});

test("Phase 4b: updateOrderStatus rejects invalid transitions", async () => {
  const order = {
    id: "ord-1",
    organizer_id: "org-1",
    status: "pending",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    tracking_token: "tok-abc",
  };
  const client = createMockSupabase(order);

  // pending -> ready is not in the graph (skips accepted/preparing)
  const res = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "ready",
    },
    client,
    "usr-1"
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "invalid_transition");
});

test("Phase 4b: updateOrderStatus rejects transitions from terminal statuses", async () => {
  const completedOrder = {
    id: "ord-1",
    organizer_id: "org-1",
    status: "completed",
    payment_method: "on_fulfilment",
    payment_status: "paid",
    tracking_token: "tok-abc",
  };
  const client = createMockSupabase(completedOrder);

  // completed -> ready is not in transition graph → invalid_transition
  // (terminal statuses have empty allowed[] so it falls through as invalid_transition)
  const res = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "completed",
      nextStatus: "ready",
    },
    client,
    "usr-1"
  );

  assert.equal(res.success, false);
  // The implementation returns "invalid_transition" for all empty-graph transitions
  assert.ok(res.error === "invalid_transition" || res.error === "terminal_status");
});

test("Phase 4b: updateOrderStatus detects concurrent updates (update returns null row)", async () => {
  const order = {
    id: "ord-1",
    organizer_id: "org-1",
    status: "pending",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    status_history: [],
    tracking_token: "tok-abc",
  };
  // "not_found" means the status filter in WHERE matched 0 rows → concurrency
  const client = createMockSupabase(order, "not_found");

  const res = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "pending",
      nextStatus: "accepted",
      estimatedReadyAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
    client,
    "usr-1"
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "order_already_updated");
});

// ── 2. Payment Collection Guard ──────────────────────────────────────────────

test("Phase 4b: completing unpaid pickup order requires collection confirmation", async () => {
  const readyOrder = {
    id: "ord-1",
    organizer_id: "org-1",
    status: "ready",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    total_amount: 5000,
    tracking_token: "tok-abc",
    status_history: [],
  };
  const client = createMockSupabase(readyOrder);

  // Without confirmation → blocked
  const resNoConfirm = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "ready",
      nextStatus: "completed",
      markPaymentCollected: false,
    },
    client,
    "usr-1"
  );

  assert.equal(resNoConfirm.success, false);
  assert.equal(resNoConfirm.error, "payment_collection_required");

  // With confirmation → success, payment_status set to paid
  const resConfirmed = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "ready",
      nextStatus: "completed",
      markPaymentCollected: true,
    },
    client,
    "usr-1"
  );

  assert.equal(resConfirmed.success, true);
  assert.equal(client.getUpdatedPayload().payment_status, "paid");
});

test("Phase 4b: completing unpaid online order cannot be manually marked paid", async () => {
  const readyOnlineOrder = {
    id: "ord-1",
    organizer_id: "org-1",
    status: "ready",
    payment_method: "online",
    payment_status: "unpaid",
    total_amount: 25,
    tracking_token: "tok-abc",
    status_history: [],
  };
  const client = createMockSupabase(readyOnlineOrder);

  const res = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "ready",
      nextStatus: "completed",
      markPaymentCollected: true,
    },
    client,
    "usr-1"
  );

  assert.equal(res.success, false);
  // Actual error code from implementation
  assert.equal(res.error, "online_payment_cannot_be_manually_marked_paid");
});

// ── 3. Adjust Estimated Ready Time ───────────────────────────────────────────

// Actual signature: adjustEstimatedReadyTimeWithClient(input, admin, userId)
// AdjustEstimatedReadyTimeInput: { orderId, organizerId, newEstimatedReadyAt, note? }

test("Phase 4b: adjustEstimatedReadyTime allowed only on accepted and preparing", async () => {
  const newReady = new Date(Date.now() + 45 * 60_000).toISOString();

  // On accepted: allowed
  const clientAccepted = createMockSupabase({
    id: "ord-1",
    organizer_id: "org-1",
    status: "accepted",
    status_history: [],
    tracking_token: "tok-abc",
  });
  const resAccepted = await adjustEstimatedReadyTimeWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      newEstimatedReadyAt: newReady,
    },
    clientAccepted,
    "usr-1"
  );
  assert.equal(resAccepted.success, true);

  // On preparing: allowed
  const clientPreparing = createMockSupabase({
    id: "ord-2",
    organizer_id: "org-1",
    status: "preparing",
    status_history: [],
    tracking_token: "tok-abc",
  });
  const resPreparing = await adjustEstimatedReadyTimeWithClient(
    {
      orderId: "ord-2",
      organizerId: "org-1",
      newEstimatedReadyAt: newReady,
    },
    clientPreparing,
    "usr-1"
  );
  assert.equal(resPreparing.success, true);

  // On ready: rejected
  const clientReady = createMockSupabase({
    id: "ord-3",
    organizer_id: "org-1",
    status: "ready",
    status_history: [],
    tracking_token: "tok-abc",
  });
  const resReady = await adjustEstimatedReadyTimeWithClient(
    {
      orderId: "ord-3",
      organizerId: "org-1",
      newEstimatedReadyAt: newReady,
    },
    clientReady,
    "usr-1"
  );
  assert.equal(resReady.success, false);
  assert.equal(resReady.error, "invalid_status");
});

// ── 4. Order Overdue Computation ─────────────────────────────────────────────

test("Phase 4b: computeOrderOverdue calculates overdue for pending and preparing correctly", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  // Pending placed 5 min ago → NOT overdue
  const pendingFresh = {
    status: "pending",
    created_at: "2026-10-14T11:55:00Z",
  };
  assert.deepEqual(computeOrderOverdue(pendingFresh, now), {
    isOverdue: false,
    minutesLate: 0,
    reason: null,
  });

  // Pending placed 15 min ago → OVERDUE (5 minutes late past the 10 min threshold)
  const pendingOld = {
    status: "pending",
    created_at: "2026-10-14T11:45:00Z",
  };
  assert.deepEqual(computeOrderOverdue(pendingOld, now), {
    isOverdue: true,
    minutesLate: 5,
    reason: "pending_timeout",
  });

  // Accepted with promised time in future → NOT overdue
  const acceptedOnTime = {
    status: "accepted",
    created_at: "2026-10-14T11:30:00Z",
    estimated_ready_at: "2026-10-14T12:15:00Z",
  };
  const overdueAccepted = computeOrderOverdue(acceptedOnTime, now);
  assert.equal(overdueAccepted.isOverdue, false);
  assert.equal(overdueAccepted.reason, null);

  // Preparing with promised time 12 min ago → OVERDUE (12 min late)
  const preparingLate = {
    status: "preparing",
    created_at: "2026-10-14T11:20:00Z",
    estimated_ready_at: "2026-10-14T11:48:00Z",
  };
  assert.deepEqual(computeOrderOverdue(preparingLate, now), {
    isOverdue: true,
    minutesLate: 12,
    reason: "past_promised_time",
  });

  // Ready, Completed, Cancelled → NEVER overdue, reason null
  for (const status of ["ready", "completed", "cancelled"]) {
    const result = computeOrderOverdue({ status, estimated_ready_at: "2026-10-14T11:00:00Z" }, now);
    assert.equal(result.isOverdue, false, `${status} should not be overdue`);
    assert.equal(result.reason, null, `${status} reason should be null`);
  }
});

// ── 5. Scheduled Order Time Validation ───────────────────────────────────────

// Actual signature: validateScheduledOrderTime(requestedIso, hoursValue, timeZone, minLeadTimeMin, maxHorizonDays, now)
// hoursValue must be an object keyed by weekday (e.g. { wed: { open: "10:00", close: "22:00" } })
// Error codes: "lead_time_too_short", "horizon_exceeded", "outside_opening_hours", "invalid_format"

test("Phase 4b: validateScheduledOrderTime validates within hours, lead time, and horizon", () => {
  // Build hours as the object shape the function expects (record keyed by weekday)
  const hoursObj = {
    mon: { open: "10:00", close: "22:00" },
    tue: { open: "10:00", close: "22:00" },
    wed: { open: "10:00", close: "22:00" },
    thu: { open: "10:00", close: "22:00" },
    fri: { open: "10:00", close: "22:00" },
    sat: { open: "10:00", close: "22:00" },
  };

  // now = Wednesday 11:00 UTC (Africa/Abidjan is UTC+0 so local time = UTC)
  const now = new Date("2026-10-14T11:00:00Z");

  // 1. Scheduled in 2 hours (13:00 Wednesday) → VALID
  const validSlot = new Date("2026-10-14T13:00:00Z").toISOString();
  const resValid = validateScheduledOrderTime(validSlot, hoursObj, "Africa/Abidjan", 30, 7, now);
  assert.equal(resValid.valid, true, "13:00 same day should be valid");

  // 2. Scheduled in 15 minutes (< 30 min default lead time) → INVALID lead_time_too_short
  const tooSoon = new Date("2026-10-14T11:15:00Z").toISOString();
  const resTooSoon = validateScheduledOrderTime(tooSoon, hoursObj, "Africa/Abidjan", 30, 7, now);
  assert.equal(resTooSoon.valid, false);
  assert.equal(resTooSoon.error, "lead_time_too_short");

  // 3. Scheduled at 23:30 (outside 10:00 - 22:00) → INVALID outside_opening_hours
  const closedSlot = new Date("2026-10-14T23:30:00Z").toISOString();
  const resClosed = validateScheduledOrderTime(closedSlot, hoursObj, "Africa/Abidjan", 30, 7, now);
  assert.equal(resClosed.valid, false);
  assert.equal(resClosed.error, "outside_opening_hours");

  // 4. Scheduled in 10 days (> 7 days horizon) → INVALID horizon_exceeded
  const tooFar = new Date("2026-10-25T14:00:00Z").toISOString();
  const resTooFar = validateScheduledOrderTime(tooFar, hoursObj, "Africa/Abidjan", 30, 7, now);
  assert.equal(resTooFar.valid, false);
  assert.equal(resTooFar.error, "horizon_exceeded");
});

test("Phase 4b: validateScheduledOrderTime supports overnight intervals", () => {
  // Bar/Lounge open Friday 18:00 to 03:00 (Saturday morning) — overnight
  const hoursObj = {
    fri: { open: "18:00", close: "03:00" },
  };

  // Friday 20:00 UTC
  const now = new Date("2026-10-16T20:00:00Z");

  // Scheduled for Saturday 01:30 AM (part of Friday overnight session, spills into Saturday)
  // Previous-day spillover check should mark this valid
  const overnightSlot = new Date("2026-10-17T01:30:00Z").toISOString();
  const resOvernight = validateScheduledOrderTime(overnightSlot, hoursObj, "Africa/Abidjan", 30, 7, now);
  assert.equal(resOvernight.valid, true, "Saturday 01:30 inside Friday overnight session should be valid");
});

// ── 6. Tracking Page PII Masking ─────────────────────────────────────────────

test("Phase 4c: PII masking hides full name and phone middle digits", () => {
  // First name + last initial
  assert.equal(maskCustomerName("Jean Dupont"), "Jean D.");
  assert.equal(maskCustomerName("Amadou Diallo Traore"), "Amadou T.");
  assert.equal(maskCustomerName("Sarah"), "Sarah");
  assert.equal(maskCustomerName(""), "");

  // Phone masking: head 6 chars, tail 2 chars, middle obscured
  // "+225 0701020304" → head = "+225 0" (6), tail = "04"
  const phone = "+225 0701020304";
  const masked = maskCustomerPhone(phone);
  assert.ok(masked.startsWith("+225 0"), `expected to start with "+225 0", got "${masked}"`);
  assert.ok(masked.endsWith("04"), `expected to end with "04", got "${masked}"`);
  assert.ok(!masked.includes("701020"), "middle numbers must not be visible");
  assert.ok(masked.includes("••"), "masked section must include bullet characters");
});

// ── 7. Migration 174 Absence Resilience ──────────────────────────────────────

test("Phase 4b: updateOrderStatus succeeds even if migration 174 columns are missing from DB", async () => {
  // The function first fetches the order (full select with status_history/estimated_ready_at).
  // If fetchErr exists it falls back. In the success path (order found), it attempts the
  // update with 174 columns; if that errors with any error, and supports174Columns=true,
  // it retries without 174 columns.
  //
  // To exercise the fallback, we simulate: initial fetch succeeds (order has status_history
  // field as it came from DB with migration applied), but the UPDATE with 174 columns fails
  // with a db error, then the retry without 174 columns succeeds.

  const order = {
    id: "ord-1",
    organizer_id: "org-1",
    order_number: "ORD-001",
    status: "accepted",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    tracking_token: "tok-abc",
    status_history: [],
    estimated_ready_at: null,
  };

  let updateCallCount = 0;
  let fallbackSucceeded = false;

  const clientWithMissingColumns = {
    from: () => ({
      select: () => makeEqChain(async () => {
        return { data: { ...order }, error: null };
      }),
      update: (payload) => {
        updateCallCount++;
        const isFirst = updateCallCount === 1;
        let result;
        if (isFirst && ("status_history" in payload || "estimated_ready_at" in payload)) {
          // Simulate column-missing error on first attempt
          result = { data: null, error: { code: "42703", message: 'column "status_history" does not exist' } };
        } else {
          fallbackSucceeded = true;
          result = { data: { id: "ord-1", status: payload.status }, error: null };
        }
        return makeUpdateEqChain(result);
      },
    }),
  };

  const res = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "accepted",
      nextStatus: "preparing",
    },
    clientWithMissingColumns,
    "usr-1"
  );

  assert.equal(res.success, true, `Expected success but got: ${JSON.stringify(res)}`);
  assert.equal(fallbackSucceeded, true, "Expected fallback update path to run");
});
