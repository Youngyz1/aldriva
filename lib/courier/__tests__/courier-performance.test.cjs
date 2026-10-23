const test = require("node:test");
const assert = require("node:assert/strict");

const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Replicate window generation logic for unit test
function getCourierPerformanceWindow(range, now = new Date()) {
  if (range !== "today" && range !== "7-days" && range !== "30-days") return null;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;

  const end = new Date(now.getTime());
  const start = range === "today"
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    : new Date(now.getTime() - (range === "7-days" ? 7 : 30) * DAY_MS);

  return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
}

function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isMedian(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRating(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5);
}

function shapeCourierPerformanceRows(value) {
  if (!Array.isArray(value)) return null;

  const shaped = [];
  for (const rawRow of value) {
    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) return null;
    const row = rawRow;
    if (
      typeof row.courier_worker_id !== "string" || !UUID_PATTERN.test(row.courier_worker_id) ||
      typeof row.courier_name !== "string" ||
      typeof row.courier_is_active !== "boolean" ||
      !isNonNegativeInteger(row.deliveries_completed) ||
      !isNonNegativeInteger(row.ready_to_delivered_n) ||
      !isMedian(row.ready_to_delivered_median_minutes) ||
      !isNonNegativeInteger(row.picked_up_to_delivered_n) ||
      !isMedian(row.picked_up_to_delivered_median_minutes) ||
      !isRating(row.average_delivery_rating) ||
      !isNonNegativeInteger(row.rating_count)
    ) {
      return null;
    }

    shaped.push({
      courier_worker_id: row.courier_worker_id,
      courier_name: row.courier_name,
      courier_is_active: row.courier_is_active,
      deliveries_completed: row.deliveries_completed,
      ready_to_delivered_n: row.ready_to_delivered_n,
      ready_to_delivered_median_minutes: row.ready_to_delivered_n < 3
        ? null
        : row.ready_to_delivered_median_minutes,
      picked_up_to_delivered_n: row.picked_up_to_delivered_n,
      picked_up_to_delivered_median_minutes: row.picked_up_to_delivered_n < 3
        ? null
        : row.picked_up_to_delivered_median_minutes,
      average_delivery_rating: row.average_delivery_rating,
      rating_count: row.rating_count,
    });
  }

  return shaped;
}

// Rating validation logic
function validateRatingPayload(body) {
  if (typeof body !== "object" || body === null) {
    return { valid: false, error: "Invalid payload." };
  }

  const { rating, comment } = body;

  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { valid: false, error: "Rating must be an integer from 1 to 5." };
  }

  if (comment !== undefined && comment !== null && comment !== "") {
    if (typeof comment !== "string" || comment.length > 500) {
      return { valid: false, error: "Comment must be a string of at most 500 characters." };
    }
  }

  return { valid: true, sanitizedComment: (typeof comment === "string" ? comment.trim() : null) || null };
}

function canRateOrder(order) {
  if (order.fulfilment_type !== "delivery") return { allowed: false, reason: "not_delivery" };
  if (order.status !== "delivered" && order.status !== "completed") return { allowed: false, reason: "not_delivered" };
  if (order.delivery_rating !== null && order.delivery_rating !== undefined) return { allowed: false, reason: "already_rated" };
  return { allowed: true };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("Courier Performance: window calculation for ranges", () => {
  const fixedNow = new Date("2026-10-22T14:30:00.000Z");

  const todayWindow = getCourierPerformanceWindow("today", fixedNow);
  assert.equal(todayWindow.rangeStart, "2026-10-22T00:00:00.000Z");
  assert.equal(todayWindow.rangeEnd, "2026-10-22T14:30:00.000Z");

  const sevenDaysWindow = getCourierPerformanceWindow("7-days", fixedNow);
  assert.equal(sevenDaysWindow.rangeStart, "2026-10-15T14:30:00.000Z");
  assert.equal(sevenDaysWindow.rangeEnd, "2026-10-22T14:30:00.000Z");

  const thirtyDaysWindow = getCourierPerformanceWindow("30-days", fixedNow);
  assert.equal(thirtyDaysWindow.rangeStart, "2026-09-22T14:30:00.000Z");
  assert.equal(thirtyDaysWindow.rangeEnd, "2026-10-22T14:30:00.000Z");

  assert.equal(getCourierPerformanceWindow("year", fixedNow), null);
  assert.equal(getCourierPerformanceWindow(null, fixedNow), null);
});

test("Courier Performance: shapes rows and suppresses median when n < 3", () => {
  const rawData = [
    {
      courier_worker_id: "00000000-0000-0000-0000-000000000001",
      courier_name: "Amadou Diallo",
      courier_is_active: true,
      deliveries_completed: 12,
      ready_to_delivered_n: 10,
      ready_to_delivered_median_minutes: 24.5,
      picked_up_to_delivered_n: 10,
      picked_up_to_delivered_median_minutes: 15.2,
      average_delivery_rating: 4.8,
      rating_count: 8,
    },
    {
      courier_worker_id: "00000000-0000-0000-0000-000000000002",
      courier_name: "Fatou Sow",
      courier_is_active: true,
      deliveries_completed: 2,
      ready_to_delivered_n: 2,
      ready_to_delivered_median_minutes: 18.0, // should be nulled because n=2 (< 3)
      picked_up_to_delivered_n: 1,
      picked_up_to_delivered_median_minutes: 12.0, // should be nulled because n=1 (< 3)
      average_delivery_rating: 5.0,
      rating_count: 1,
    },
  ];

  const shaped = shapeCourierPerformanceRows(rawData);
  assert.ok(shaped);
  assert.equal(shaped.length, 2);

  // Amadou has n >= 3, medians preserved
  assert.equal(shaped[0].ready_to_delivered_median_minutes, 24.5);
  assert.equal(shaped[0].picked_up_to_delivered_median_minutes, 15.2);
  assert.equal(shaped[0].average_delivery_rating, 4.8);

  // Fatou has n < 3, medians nulled out
  assert.equal(shaped[1].ready_to_delivered_median_minutes, null);
  assert.equal(shaped[1].picked_up_to_delivered_median_minutes, null);
  assert.equal(shaped[1].ready_to_delivered_n, 2); // sample count preserved for UI
  assert.equal(shaped[1].average_delivery_rating, 5.0);
});

test("Courier Performance: rejects malformed RPC rows", () => {
  // Missing worker ID
  assert.equal(shapeCourierPerformanceRows([{ courier_name: "Test" }]), null);

  // Invalid UUID
  assert.equal(
    shapeCourierPerformanceRows([
      {
        courier_worker_id: "not-a-uuid",
        courier_name: "Test",
        courier_is_active: true,
        deliveries_completed: 1,
        ready_to_delivered_n: 1,
        ready_to_delivered_median_minutes: null,
        picked_up_to_delivered_n: 1,
        picked_up_to_delivered_median_minutes: null,
        average_delivery_rating: null,
        rating_count: 0,
      },
    ]),
    null
  );

  // Negative count
  assert.equal(
    shapeCourierPerformanceRows([
      {
        courier_worker_id: "00000000-0000-0000-0000-000000000001",
        courier_name: "Test",
        courier_is_active: true,
        deliveries_completed: -5,
        ready_to_delivered_n: 0,
        ready_to_delivered_median_minutes: null,
        picked_up_to_delivered_n: 0,
        picked_up_to_delivered_median_minutes: null,
        average_delivery_rating: null,
        rating_count: 0,
      },
    ]),
    null
  );
});

test("Customer Rating: enforces 1–5 integer range and 500-char comment limit", () => {
  // Valid ratings
  assert.equal(validateRatingPayload({ rating: 1 }).valid, true);
  assert.equal(validateRatingPayload({ rating: 5, comment: "Fast and polite!" }).valid, true);
  assert.equal(validateRatingPayload({ rating: 3, comment: "" }).valid, true);

  // Invalid ratings
  assert.equal(validateRatingPayload({ rating: 0 }).valid, false);
  assert.equal(validateRatingPayload({ rating: 6 }).valid, false);
  assert.equal(validateRatingPayload({ rating: 4.5 }).valid, false);
  assert.equal(validateRatingPayload({ rating: "5" }).valid, false);
  assert.equal(validateRatingPayload(null).valid, false);

  // Comment limits
  const longComment = "a".repeat(501);
  assert.equal(validateRatingPayload({ rating: 5, comment: longComment }).valid, false);
  const okComment = "a".repeat(500);
  assert.equal(validateRatingPayload({ rating: 5, comment: okComment }).valid, true);
});

test("Customer Rating: only allows rating delivered delivery orders", () => {
  // Delivered delivery order -> allowed
  assert.equal(canRateOrder({ fulfilment_type: "delivery", status: "delivered", delivery_rating: null }).allowed, true);
  assert.equal(canRateOrder({ fulfilment_type: "delivery", status: "completed", delivery_rating: null }).allowed, true);

  // Non-delivery order (pickup) -> rejected
  assert.equal(canRateOrder({ fulfilment_type: "pickup", status: "delivered", delivery_rating: null }).allowed, false);

  // In-transit or preparing order -> rejected
  assert.equal(canRateOrder({ fulfilment_type: "delivery", status: "out_for_delivery", delivery_rating: null }).allowed, false);
  assert.equal(canRateOrder({ fulfilment_type: "delivery", status: "picked_up", delivery_rating: null }).allowed, false);
  assert.equal(canRateOrder({ fulfilment_type: "delivery", status: "ready", delivery_rating: null }).allowed, false);

  // Already rated order -> rejected
  assert.equal(canRateOrder({ fulfilment_type: "delivery", status: "delivered", delivery_rating: 5 }).allowed, false);
});
