/**
 * lib/rental/pickup-guard.ts
 *
 * Pickup guard validation logic for rental bookings.
 * Enforces:
 *   1. A vehicle must be assigned (vehicle_id non-null/non-empty).
 *   2. Pickup cannot be recorded more than 4 hours before scheduled start,
 *      unless an owner explicitly overrides with a written reason (>= 5 chars).
 */

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export interface PickupGuardBooking {
  vehicle_id: string | null;
  starts_at: string;
  notes?: string | null;
}

export interface PickupGuardResult {
  success: boolean;
  code?: "VEHICLE_NOT_ASSIGNED" | "TOO_EARLY_FOR_PICKUP";
  error?: string;
  notesOverride?: string;
}

export function validatePickupGuard(
  booking: PickupGuardBooking,
  now: Date = new Date(),
  overrideReason?: string
): PickupGuardResult {
  if (!booking.vehicle_id || booking.vehicle_id.trim() === "") {
    return {
      success: false,
      code: "VEHICLE_NOT_ASSIGNED",
      error: "A vehicle must be assigned before recording pickup.",
    };
  }

  const startsAt = new Date(booking.starts_at);
  const fourHoursBefore = new Date(startsAt.getTime() - FOUR_HOURS_MS);

  if (now < fourHoursBefore) {
    if (!overrideReason || overrideReason.trim().length < 5) {
      return {
        success: false,
        code: "TOO_EARLY_FOR_PICKUP",
        error: `Pickup cannot be recorded more than 4 hours before the scheduled start (${startsAt.toLocaleString()}). To override, provide a written reason.`,
      };
    }
    // Override approved — append audit entry
    const stamp = now.toISOString();
    const auditEntry = `[Early pickup override ${stamp}] ${overrideReason.trim()}`;
    const existingNotes = booking.notes ? booking.notes + "\n" : "";
    return {
      success: true,
      notesOverride: existingNotes + auditEntry,
    };
  }

  return { success: true };
}
