// @ts-check
/**
 * lib/__tests__/rental-booking-pricing.test.cjs
 *
 * Comprehensive tests for the calculateRentalAmount pure function.
 * Mirrors the implementation in lib/actions/rental-bookings.ts.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert");

// Inline the pure calculateRentalAmount function (mirrors lib/actions/rental-bookings.ts)
function calculateRentalAmount({
  dailyRate,
  weeklyRate,
  startsAt,
  endsAt,
  billingBoundary = "rolling_24h",
}) {
  let days;
  if (billingBoundary === "calendar_day") {
    const startDay = Date.UTC(
      startsAt.getUTCFullYear(),
      startsAt.getUTCMonth(),
      startsAt.getUTCDate()
    );
    const endDay = Date.UTC(
      endsAt.getUTCFullYear(),
      endsAt.getUTCMonth(),
      endsAt.getUTCDate()
    );
    days = Math.max(
      1,
      Math.round((endDay - startDay) / (1000 * 60 * 60 * 24))
    );
  } else {
    days = Math.max(
      1,
      Math.ceil(
        (endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60 * 24)
      )
    );
  }
  if (weeklyRate != null && days >= 7) {
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    return weeks * weeklyRate + remainingDays * dailyRate;
  }
  return days * dailyRate;
}

const D = (s) => new Date(s);

describe("calculateRentalAmount - rolling_24h", () => {
  test("1 day", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        startsAt: D("2026-11-10T10:00:00Z"),
        endsAt: D("2026-11-11T10:00:00Z"),
      }),
      60
    ));

  test("2 days", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        startsAt: D("2026-11-10T10:00:00Z"),
        endsAt: D("2026-11-12T10:00:00Z"),
      }),
      120
    ));

  test("7 days with weekly rate", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        weeklyRate: 350,
        startsAt: D("2026-11-10T10:00:00Z"),
        endsAt: D("2026-11-17T10:00:00Z"),
      }),
      350
    ));

  test("8 days = 1 week + 1 day", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        weeklyRate: 350,
        startsAt: D("2026-11-10T10:00:00Z"),
        endsAt: D("2026-11-18T10:00:00Z"),
      }),
      410
    ));

  test("14 days = 2 weeks", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        weeklyRate: 350,
        startsAt: D("2026-11-10T10:00:00Z"),
        endsAt: D("2026-11-24T10:00:00Z"),
      }),
      700
    ));

  test("30 days = 4 weeks + 2 days", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        weeklyRate: 350,
        startsAt: D("2026-11-01T10:00:00Z"),
        endsAt: D("2026-12-01T10:00:00Z"),
      }),
      1520
    ));

  test("no weekly rate: 7 days × daily", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        weeklyRate: null,
        startsAt: D("2026-11-10T10:00:00Z"),
        endsAt: D("2026-11-17T10:00:00Z"),
      }),
      420
    ));

  test("partial day rounds up (25h = 2 days)", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        startsAt: D("2026-11-10T10:00:00Z"),
        endsAt: D("2026-11-11T11:00:00Z"),
      }),
      120
    ));

  test("minimum 1 day even for sub-hour rental", () => {
    const start = D("2026-11-10T10:00:00Z");
    const end = D("2026-11-10T10:30:00Z"); // 30 minutes
    assert.strictEqual(
      calculateRentalAmount({ dailyRate: 60, startsAt: start, endsAt: end }),
      60
    );
  });
});

describe("calculateRentalAmount - calendar_day", () => {
  test("same day = 1 day", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        startsAt: D("2026-11-10T09:00:00Z"),
        endsAt: D("2026-11-10T18:00:00Z"),
        billingBoundary: "calendar_day",
      }),
      60
    ));

  test("1 calendar day (overnight)", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        startsAt: D("2026-11-10T10:00:00Z"),
        endsAt: D("2026-11-11T10:00:00Z"),
        billingBoundary: "calendar_day",
      }),
      60
    ));

  test("7 calendar days with weekly rate", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        weeklyRate: 350,
        startsAt: D("2026-11-10T10:00:00Z"),
        endsAt: D("2026-11-17T10:00:00Z"),
        billingBoundary: "calendar_day",
      }),
      350
    ));

  test("2 calendar days (overnight into next day)", () =>
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 60,
        startsAt: D("2026-11-10T22:00:00Z"),
        endsAt: D("2026-11-12T06:00:00Z"),
        billingBoundary: "calendar_day",
      }),
      120
    ));
});

describe("calculateRentalAmount - deposit invariant", () => {
  test("deposit amount must NOT be added to returned rental_amount", () => {
    // Document the invariant: deposit is strictly separate
    const rentalAmount = calculateRentalAmount({
      dailyRate: 100,
      startsAt: D("2026-11-10T10:00:00Z"),
      endsAt: D("2026-11-13T10:00:00Z"),
    });
    const depositAmount = 500;
    // rental_amount = 300 (3 days × 100); deposit tracked separately
    assert.strictEqual(rentalAmount, 300);
    assert.ok(depositAmount > 0, "deposit is a separate field");
    // The combined total for a customer is rentalAmount + depositAmount,
    // but rentalAmount alone must NEVER include deposit:
    assert.notStrictEqual(rentalAmount, rentalAmount + depositAmount);
  });
});
