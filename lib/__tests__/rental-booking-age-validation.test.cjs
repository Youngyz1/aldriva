/**
 * lib/__tests__/rental-booking-age-validation.test.cjs
 *
 * Tests for server-side rental booking validation:
 *  - Date of birth in the past
 *  - Driver at least rental_min_driver_age on the pickup date
 *  - Return date strictly after pickup date
 *  - Pickup respecting rental_min_notice_hours
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// Pure validation logic matching lib/rental/validation.ts
function calculateAgeOnDate(dob, targetDate) {
  let age = targetDate.getFullYear() - dob.getFullYear();
  const monthDiff = targetDate.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && targetDate.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function validateRentalDatesAndDriver(input) {
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  const now = input.now ? new Date(input.now) : new Date();

  // 1. Return strictly after pickup
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return {
      valid: false,
      field: "startsAt",
      error: "invalid_dates",
      message: "Invalid dates provided.",
    };
  }

  if (end <= start) {
    return {
      valid: false,
      field: "endsAt",
      error: "invalid_dates",
      message: "Return date must be strictly after pickup date.",
    };
  }

  // 2. Minimum notice lead-time check
  const minNoticeHours = input.minNoticeHours ?? 2;
  const noticeMs = start.getTime() - now.getTime();
  if (noticeMs < minNoticeHours * 3600 * 1000) {
    return {
      valid: false,
      field: "startsAt",
      error: "insufficient_notice",
      message: `Bookings require at least ${minNoticeHours} hour(s) advance notice before pickup.`,
    };
  }

  // 3. Driver license & DOB requirement check
  const requireLicenseDob = input.requireLicenseDob ?? false;
  const minDriverAge = input.minDriverAge ?? 21;

  if (requireLicenseDob) {
    const license = (input.driverLicenseNumber || "").trim();
    if (!license || license.length < 3) {
      return {
        valid: false,
        field: "driverLicenseNumber",
        error: "license_required",
        message: "A valid driver's license number is required.",
      };
    }

    if (!input.driverDob) {
      return {
        valid: false,
        field: "driverDob",
        error: "dob_required",
        message: "Date of birth is required to verify driver eligibility.",
      };
    }
  }

  // 4. DOB validations
  if (input.driverDob) {
    const dob = new Date(input.driverDob);
    if (isNaN(dob.getTime())) {
      return {
        valid: false,
        field: "driverDob",
        error: "dob_invalid",
        message: "Invalid date of birth provided.",
      };
    }

    // Date of birth must be strictly in the past
    if (dob.getTime() >= now.getTime()) {
      return {
        valid: false,
        field: "driverDob",
        error: "dob_in_future",
        message: "Date of birth must be in the past.",
      };
    }

    // Driver must be at least rental_min_driver_age on the pickup date
    const ageOnPickup = calculateAgeOnDate(dob, start);
    if (ageOnPickup < minDriverAge) {
      return {
        valid: false,
        field: "driverDob",
        error: "under_age",
        message: `The primary driver must be at least ${minDriverAge} years of age on the pickup date.`,
      };
    }
  }

  return { valid: true };
}

describe("Server-side Rental Booking Validation", () => {
  const fixedNow = new Date("2026-11-10T12:00:00Z");

  test("rejects return date on or before pickup date", () => {
    const resSame = validateRentalDatesAndDriver({
      startsAt: "2026-11-12T10:00:00Z",
      endsAt: "2026-11-12T10:00:00Z",
      now: fixedNow,
    });
    assert.equal(resSame.valid, false);
    assert.equal(resSame.field, "endsAt");
    assert.equal(resSame.error, "invalid_dates");

    const resBefore = validateRentalDatesAndDriver({
      startsAt: "2026-11-12T10:00:00Z",
      endsAt: "2026-11-11T10:00:00Z",
      now: fixedNow,
    });
    assert.equal(resBefore.valid, false);
    assert.equal(resBefore.field, "endsAt");
    assert.equal(resBefore.error, "invalid_dates");
  });

  test("rejects pickup time that violates minimum notice hours", () => {
    // 1 hour notice when 2 hours required
    const res = validateRentalDatesAndDriver({
      startsAt: "2026-11-10T13:00:00Z",
      endsAt: "2026-11-11T13:00:00Z",
      minNoticeHours: 2,
      now: fixedNow,
    });
    assert.equal(res.valid, false);
    assert.equal(res.field, "startsAt");
    assert.equal(res.error, "insufficient_notice");
    assert.match(res.message, /2 hour\(s\) advance notice/);
  });

  test("rejects date of birth in the future or present", () => {
    const resFuture = validateRentalDatesAndDriver({
      startsAt: "2026-11-15T10:00:00Z",
      endsAt: "2026-11-18T10:00:00Z",
      driverDob: "2027-01-01",
      minNoticeHours: 2,
      now: fixedNow,
    });
    assert.equal(resFuture.valid, false);
    assert.equal(resFuture.field, "driverDob");
    assert.equal(resFuture.error, "dob_in_future");
    assert.equal(resFuture.message, "Date of birth must be in the past.");
  });

  test("rejects driver who is under rental_min_driver_age on the pickup date", () => {
    // Pickup on 2026-11-15. Driver born 2005-11-16 is 20 years and 364 days old (under 21)
    const res = validateRentalDatesAndDriver({
      startsAt: "2026-11-15T10:00:00Z",
      endsAt: "2026-11-18T10:00:00Z",
      driverDob: "2005-11-16",
      minDriverAge: 21,
      minNoticeHours: 2,
      now: fixedNow,
    });
    assert.equal(res.valid, false);
    assert.equal(res.field, "driverDob");
    assert.equal(res.error, "under_age");
    assert.match(res.message, /at least 21 years of age on the pickup date/);
  });

  test("accepts driver who turns minimum age on the pickup date even if under age today", () => {
    // Born 2005-11-15. Today is 2026-11-10 (driver is 20 today).
    // On pickup date 2026-11-15, driver turns 21!
    const res = validateRentalDatesAndDriver({
      startsAt: "2026-11-15T10:00:00Z",
      endsAt: "2026-11-18T10:00:00Z",
      driverDob: "2005-11-15",
      minDriverAge: 21,
      minNoticeHours: 2,
      now: fixedNow,
    });
    assert.equal(res.valid, true);
  });

  test("accepts valid booking with full driver credentials meeting all criteria", () => {
    const res = validateRentalDatesAndDriver({
      startsAt: "2026-11-15T10:00:00Z",
      endsAt: "2026-11-18T10:00:00Z",
      driverDob: "1998-05-20",
      driverLicenseNumber: "DL-987654321",
      requireLicenseDob: true,
      minDriverAge: 21,
      minNoticeHours: 2,
      now: fixedNow,
    });
    assert.equal(res.valid, true);
  });
});
