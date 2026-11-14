/**
 * lib/rental/validation.ts
 *
 * Authoritative server-side validations for rental bookings (Slice 2 & 3).
 * Shared by:
 *  - Public storefront booking action (lib/actions/rental-public.ts)
 *  - Office booking server action (lib/actions/rental-bookings.ts)
 *
 * Invariants:
 *  - Return date must be strictly after pickup date.
 *  - Pickup date must respect rental_min_notice_hours.
 *  - Driver date of birth must be strictly in the past.
 *  - Driver must be at least rental_min_driver_age on the pickup date.
 */

export interface RentalValidationInput {
  startsAt: string | Date;
  endsAt: string | Date;
  driverDob?: string | null;
  driverLicenseNumber?: string | null;
  requireLicenseDob?: boolean;
  minDriverAge?: number;
  minNoticeHours?: number;
  now?: Date;
}

export type RentalValidationErrorCode =
  | "invalid_dates"
  | "insufficient_notice"
  | "license_required"
  | "dob_required"
  | "dob_invalid"
  | "dob_in_future"
  | "under_age";

export interface RentalValidationResult {
  valid: boolean;
  field?: "startsAt" | "endsAt" | "driverDob" | "driverLicenseNumber";
  error?: RentalValidationErrorCode;
  message?: string;
}

/**
 * Calculates a person's age on an exact target date.
 */
export function calculateAgeOnDate(dob: Date, targetDate: Date): number {
  let age = targetDate.getFullYear() - dob.getFullYear();
  const monthDiff = targetDate.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && targetDate.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/**
 * Validates rental booking timing, driver license, and driver age on the pickup date.
 */
export function validateRentalDatesAndDriver(input: RentalValidationInput): RentalValidationResult {
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  const now = input.now ?? new Date();

  // 1. Date range sanity: return strictly after pickup
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
  if (minNoticeHours > 0 && noticeMs < minNoticeHours * 3600 * 1000) {
    return {
      valid: false,
      field: "startsAt",
      error: "insufficient_notice",
      message: `Bookings require at least ${minNoticeHours} hour(s) advance notice before pickup.`,
    };
  }
  if (minNoticeHours === 0 && noticeMs < -5 * 60 * 1000) {
    // Allow starting now or very recently; don't allow starting more than 5 min in the past
    return {
      valid: false,
      field: "startsAt",
      error: "invalid_dates",
      message: "Pickup time cannot be more than 5 minutes in the past.",
    };
  }

  // 3. Driver License and DOB requirements
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

  // 4. If DOB is provided (whether optional or required), validate it strictly
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

    // Date of birth must be in the past
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
