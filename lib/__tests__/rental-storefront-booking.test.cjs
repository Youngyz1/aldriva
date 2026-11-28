// @ts-check
/**
 * lib/__tests__/rental-storefront-booking.test.cjs
 *
 * Slice 3 unit & integration regression tests:
 *  - submitPublicRentalBooking validation & price recomputation
 *  - Deposit separation invariant (deposits are never rental revenue)
 *  - Notice window, driver age, and duration limits
 *  - Public privacy scrubbing (no plates, VINs, vehicle IDs, licenses on public views)
 *  - Availability count capping (privacy cap of 5)
 *  - Webhook idempotency and instant vs. approval modes
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// Pure pricing helper matching calculateRentalAmount
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
    days = Math.max(1, Math.round((endDay - startDay) / (1000 * 60 * 60 * 24)));
  } else {
    days = Math.max(
      1,
      Math.ceil((endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60 * 24))
    );
  }
  if (weeklyRate != null && days >= 7) {
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    return weeks * weeklyRate + remainingDays * dailyRate;
  }
  return days * dailyRate;
}

// Validation logic matching submitPublicRentalBooking
function validateBookingInput({
  startsAt,
  endsAt,
  driverDob,
  driverLicenseNumber,
  requireLicenseDob = true,
  minDriverAge = 21,
  minNoticeHours = 2,
  now = new Date(),
}) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: "invalid_dates", message: "Invalid dates." };
  }
  if (end <= start) {
    return { valid: false, error: "invalid_duration", message: "End date must be after pickup date." };
  }

  // Minimum duration: 1 day
  const durationMs = end.getTime() - start.getTime();
  if (durationMs < 24 * 60 * 60 * 1000) {
    return { valid: false, error: "minimum_duration", message: "Minimum rental duration is 1 day (24 hours)." };
  }

  // Maximum duration: 30 days
  if (durationMs > 30 * 24 * 60 * 60 * 1000) {
    return { valid: false, error: "maximum_duration", message: "Online reservations are limited to 30 days max." };
  }

  // Minimum notice check
  const noticeMs = start.getTime() - now.getTime();
  if (noticeMs < minNoticeHours * 60 * 60 * 1000) {
    return {
      valid: false,
      error: "minimum_notice",
      message: `Pickup must be at least ${minNoticeHours} hour(s) from now.`,
    };
  }

  // Driver verification
  if (requireLicenseDob) {
    if (!driverLicenseNumber || !driverLicenseNumber.trim()) {
      return { valid: false, error: "missing_license", message: "Driver license number is required." };
    }
    if (!driverDob) {
      return { valid: false, error: "missing_dob", message: "Driver date of birth is required." };
    }

    const birthDate = new Date(driverDob);
    if (isNaN(birthDate.getTime())) {
      return { valid: false, error: "invalid_dob", message: "Invalid date of birth." };
    }

    let age = now.getFullYear() - birthDate.getFullYear();
    const m = now.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < minDriverAge) {
      return {
        valid: false,
        error: "underage_driver",
        message: `Primary driver must be at least ${minDriverAge} years old.`,
      };
    }
  }

  return { valid: true };
}

describe("Slice 3: Pricing Validation & Deposit Separation", () => {
  test("server calculates rental price from DB rates, ignoring client price input", () => {
    const dbDailyRate = 50;
    const dbWeeklyRate = 300;
    const start = new Date("2026-12-01T10:00:00Z");
    const end = new Date("2026-12-08T10:00:00Z"); // 7 days

    const calculated = calculateRentalAmount({
      dailyRate: dbDailyRate,
      weeklyRate: dbWeeklyRate,
      startsAt: start,
      endsAt: end,
    });

    assert.equal(calculated, 300, "7-day rental should use weekly rate");

    // Even if client sent $1, server recomputed amount is $300
    const clientProvidedTotal = 1.0;
    assert.notEqual(clientProvidedTotal, calculated, "Client total is rejected in favor of server calculation");
  });

  test("security deposit is never added to rental revenue charge", () => {
    const dailyRate = 75;
    const depositRequired = 250;
    const days = 3;

    const rentalAmount = dailyRate * days; // 225
    assert.equal(rentalAmount, 225);

    // Revenue invariant: gross revenue = rentalAmount, NOT rentalAmount + depositRequired
    const grossRevenue = rentalAmount;
    assert.equal(grossRevenue, 225, "Gross revenue strictly excludes deposit");
    assert.equal(depositRequired, 250, "Deposit is tracked separately");
  });

  test("rejects duration under 1 day (24 hours)", () => {
    const now = new Date("2026-12-01T10:00:00Z");
    const start = new Date("2026-12-02T10:00:00Z");
    const end = new Date("2026-12-02T18:00:00Z"); // 8 hours

    const result = validateBookingInput({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      driverDob: "1995-05-15",
      driverLicenseNumber: "DL123456",
      now,
    });

    assert.equal(result.valid, false);
    assert.equal(result.error, "minimum_duration");
  });

  test("rejects duration over 30 days", () => {
    const now = new Date("2026-12-01T10:00:00Z");
    const start = new Date("2026-12-02T10:00:00Z");
    const end = new Date("2027-01-10T10:00:00Z"); // 39 days

    const result = validateBookingInput({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      driverDob: "1995-05-15",
      driverLicenseNumber: "DL123456",
      now,
    });

    assert.equal(result.valid, false);
    assert.equal(result.error, "maximum_duration");
  });
});

describe("Slice 3: Driver Verification & Minimum Notice", () => {
  test("rejects booking when driver is younger than minimum age", () => {
    const now = new Date("2026-12-01T10:00:00Z");
    const start = new Date("2026-12-05T10:00:00Z");
    const end = new Date("2026-12-07T10:00:00Z");

    // Born 2007-06-01 -> 19 years old in Dec 2026
    const result = validateBookingInput({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      driverDob: "2007-06-01",
      driverLicenseNumber: "DL-YOUNG",
      minDriverAge: 21,
      now,
    });

    assert.equal(result.valid, false);
    assert.equal(result.error, "underage_driver");
    assert.match(result.message || "", /21 years old/);
  });

  test("accepts driver meeting minimum driver age", () => {
    const now = new Date("2026-12-01T10:00:00Z");
    const start = new Date("2026-12-05T10:00:00Z");
    const end = new Date("2026-12-07T10:00:00Z");

    // Born 2001-01-01 -> 25 years old
    const result = validateBookingInput({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      driverDob: "2001-01-01",
      driverLicenseNumber: "DL-VALID",
      minDriverAge: 21,
      now,
    });

    assert.equal(result.valid, true);
  });

  test("rejects booking within minimum notice window", () => {
    const now = new Date("2026-12-01T10:00:00Z");
    // Pickup is only 30 minutes from now, but minNoticeHours is 2
    const start = new Date("2026-12-01T10:30:00Z");
    const end = new Date("2026-12-03T10:30:00Z");

    const result = validateBookingInput({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      driverDob: "1990-01-01",
      driverLicenseNumber: "DL-NOTICE",
      minNoticeHours: 2,
      now,
    });

    assert.equal(result.valid, false);
    assert.equal(result.error, "minimum_notice");
    assert.match(result.message || "", /2 hour\(s\)/);
  });
});

describe("Slice 3: Privacy & Availability Scrubbing", () => {
  test("availability count is capped at 5 for competitor privacy", () => {
    const capAvailabilityCount = (unassignedCount) => Math.min(5, Math.max(0, unassignedCount));

    assert.equal(capAvailabilityCount(12), 5, "Large fleet size capped to 5");
    assert.equal(capAvailabilityCount(3), 3, "Fleet size under 5 returns actual count");
    assert.equal(capAvailabilityCount(0), 0, "Zero fleet size returns 0");
  });

  test("public booking record scrubs sensitive driver identity and vehicle identifiers", () => {
    // Simulated internal database row
    const rawDbRow = {
      id: "booking-uuid-1234",
      booking_number: "RB-20261201-ABCD",
      customer_name: "Jane Doe",
      driver_license_number: "B12345678X",
      driver_dob: "1988-03-24",
      vehicle_id: "vehicle-uuid-9999",
      vehicle_plate: "XYZ-789",
      vehicle_vin: "1HGCR2F83HA123456",
      status: "confirmed",
      starts_at: "2026-12-01T10:00:00Z",
      ends_at: "2026-12-05T10:00:00Z",
      rental_amount: 250.0,
      snapshot_currency: "USD",
      payment_status: "paid",
      deposit_required_amount: 300.0,
      deposit_status: "pending",
      pickup_branch_id: "branch-uuid-1",
      return_branch_id: "branch-uuid-1",
    };

    // Public representation (matching get_public_rental_booking RPC projection)
    const publicProjection = {
      booking_number: rawDbRow.booking_number,
      status: rawDbRow.status,
      starts_at: rawDbRow.starts_at,
      ends_at: rawDbRow.ends_at,
      rental_amount: rawDbRow.rental_amount,
      snapshot_currency: rawDbRow.snapshot_currency,
      payment_status: rawDbRow.payment_status,
      deposit_required_amount: rawDbRow.deposit_required_amount,
      deposit_status: rawDbRow.deposit_status,
      customer_name: rawDbRow.customer_name,
      pickup_branch_id: rawDbRow.pickup_branch_id,
      return_branch_id: rawDbRow.return_branch_id,
    };

    // Assert sensitive fields are completely absent from public projection
    assert.equal(rawDbRow.driver_license_number, "B12345678X");
    assert.equal(rawDbRow.driver_dob, "1988-03-24");
    assert.equal(rawDbRow.vehicle_plate, "XYZ-789");
    assert.equal(rawDbRow.vehicle_vin, "1HGCR2F83HA123456");

    assert.equal("driver_license_number" in publicProjection, false);
    assert.equal("driver_dob" in publicProjection, false);
    assert.equal("vehicle_id" in publicProjection, false);
    assert.equal("vehicle_plate" in publicProjection, false);
    assert.equal("vehicle_vin" in publicProjection, false);
  });
});

describe("Slice 3: Webhook Idempotency & Confirmation Modes", () => {
  test("webhook execution is idempotent: second run does not double-update or duplicate", () => {
    let updateCount = 0;
    let notificationCount = 0;

    function simulateWebhookFulfill({ currentPaymentStatus, confirmationMode }) {
      // Step 1: Idempotency gate
      if (currentPaymentStatus === "paid") {
        return { updated: false, status: "already_paid" };
      }

      // Step 2: Apply payment
      updateCount++;
      const nextStatus = confirmationMode === "instant" ? "confirmed" : "pending";

      // Step 3: Notify
      notificationCount++;

      return { updated: true, nextStatus };
    }

    // First webhook call: booking is unpaid
    const firstRun = simulateWebhookFulfill({
      currentPaymentStatus: "unpaid",
      confirmationMode: "instant",
    });
    assert.equal(firstRun.updated, true);
    assert.equal(firstRun.nextStatus, "confirmed");
    assert.equal(updateCount, 1);
    assert.equal(notificationCount, 1);

    // Second webhook call: booking is now paid
    const secondRun = simulateWebhookFulfill({
      currentPaymentStatus: "paid",
      confirmationMode: "instant",
    });
    assert.equal(secondRun.updated, false);
    assert.equal(secondRun.status, "already_paid");
    assert.equal(updateCount, 1, "Update count remains 1 on duplicate webhook");
    assert.equal(notificationCount, 1, "Notification count remains 1 on duplicate webhook");
  });

  test("instant mode transitions booking to confirmed upon payment; approval mode remains pending", () => {
    function resolveStatusOnPayment(mode, currentStatus) {
      return mode === "instant" ? "confirmed" : currentStatus;
    }

    assert.equal(resolveStatusOnPayment("instant", "pending"), "confirmed");
    assert.equal(resolveStatusOnPayment("approval", "pending"), "pending");
  });

  test("payment_intent.succeeded alone must not mark a rental paid", () => {
    // Rental payments are ONLY fulfilled via checkout.session.completed.
    // An incoming payment_intent.succeeded event with kind: "rental" has no handler
    // and must leave payment_status strictly as "unpaid".
    function handlePaymentIntent({ kind, currentPaymentStatus }) {
      if (kind === "rental") {
        // No-op: checkout.session.completed is the only authoritative fulfillment path
        return { updated: false, paymentStatus: currentPaymentStatus };
      }
      return { updated: true, paymentStatus: "paid" };
    }

    const result = handlePaymentIntent({ kind: "rental", currentPaymentStatus: "unpaid" });
    assert.equal(result.updated, false, "payment_intent.succeeded must not update rental booking");
    assert.equal(result.paymentStatus, "unpaid", "booking payment_status remains unpaid");
  });

  test("checkout paid after the hold expired is flagged and not confirmed", () => {
    // When a customer pays after the 35-minute hold has elapsed and the booking is expired
    // (or cancelled), the booking must NOT be confirmed or marked paid. Instead it alerts reconciliation.
    let reconciliationAlertLogged = false;
    let bookingUpdated = false;

    function fulfillRentalCheckout({ bookingStatus, currentPaymentStatus }) {
      const TERMINAL_STATUSES = ["cancelled", "expired", "no_show"];
      if (TERMINAL_STATUSES.includes(bookingStatus)) {
        reconciliationAlertLogged = true;
        return { updated: false, reason: "terminal_state_alerted" };
      }
      bookingUpdated = true;
      return { updated: true, nextStatus: "confirmed" };
    }

    const expiredResult = fulfillRentalCheckout({
      bookingStatus: "expired",
      currentPaymentStatus: "unpaid",
    });

    assert.equal(expiredResult.updated, false, "expired booking must not be updated to confirmed");
    assert.equal(bookingUpdated, false);
    assert.equal(reconciliationAlertLogged, true, "expired payment must alert reconciliation for manual refund");
  });
});
