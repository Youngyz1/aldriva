export type InvitationRsvpResponse = "accepted" | "declined";

export interface NormalizedRsvpDetails {
  guestCount?: number;
  guestNames?: string;
  message?: string;
}

export class RsvpValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RsvpValidationError";
  }
}

export class InvitationNotFoundError extends Error {
  constructor() {
    super("Invitation not found.");
    this.name = "InvitationNotFoundError";
  }
}

function normalizeOptionalText(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new RsvpValidationError(`${label} must be text.`);

  const normalized = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
  if (Array.from(normalized).length > maxLength) {
    throw new RsvpValidationError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized || undefined;
}

/** Normalize optional RSVP fields. Legacy callers may omit every detail field. */
export function normalizeRsvpDetails(
  response: InvitationRsvpResponse,
  input: { guestCount?: unknown; guestNames?: unknown; message?: unknown },
  guestAllowance?: number | null,
): NormalizedRsvpDetails {
  if (response !== "accepted" && response !== "declined") {
    throw new RsvpValidationError("Invalid RSVP response.");
  }

  const message = normalizeOptionalText(input.message, "Message", 500);
  if (response === "declined") return { message };

  let guestCount: number | undefined;
  if (input.guestCount !== undefined) {
    if (typeof input.guestCount !== "number" || !Number.isInteger(input.guestCount) || input.guestCount < 1 || input.guestCount > 20) {
      throw new RsvpValidationError("Guest count must be a whole number from 1 to 20.");
    }
    if (guestAllowance != null) {
      if (!Number.isInteger(guestAllowance) || guestAllowance < 1 || guestAllowance > 20) {
        throw new RsvpValidationError("The invitation guest allowance is invalid.");
      }
      if (input.guestCount > guestAllowance) {
        throw new RsvpValidationError("Guest count cannot exceed the number of guests allowed.");
      }
    }
    guestCount = input.guestCount;
  }

  const guestNames = normalizeOptionalText(input.guestNames, "Guest names", 300);
  return { guestCount, guestNames, message };
}

/** Build the database update so every legacy response clears optional RSVP data. */
export function buildRsvpInvitationUpdate(
  response: InvitationRsvpResponse,
  details: NormalizedRsvpDetails,
  timestamp: string,
) {
  return {
    rsvp_status: response,
    rsvp_at: timestamp,
    updated_at: timestamp,
    rsvp_guest_count: response === "accepted" ? details.guestCount ?? null : null,
    rsvp_guest_names: response === "accepted" ? details.guestNames ?? null : null,
    rsvp_message: details.message ?? null,
  };
}

/** Evergreen uses the shared personal-link accept/decline flow. */
export function usesEvergreenRsvpForm(templateId: string): boolean {
  void templateId;
  return false;
}
