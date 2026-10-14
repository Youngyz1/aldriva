/**
 * lib/reservation-settings.ts
 *
 * Owner-managed table-reservation settings under
 * tenant_websites.metadata.storefront.reservations.
 * Pure validation, extraction, and defaults (no "use server", zero I/O).
 *
 * Merge-safe save pattern mirrors delivery settings: the server action
 * spreads the existing metadata/storefront keys and only replaces the
 * `reservations` leaf. Lookups scope tenant_websites by tenant_id.
 */

export interface ReservationSettings {
  enabled: boolean;
  max_party_size: number;
  min_lead_minutes: number;
  max_days_ahead: number;
  slot_minutes: 15 | 30 | 60;
  note: string | null;
}

export const DEFAULT_RESERVATION_SETTINGS: ReservationSettings = {
  enabled: true,
  max_party_size: 12,
  min_lead_minutes: 60,
  max_days_ahead: 30,
  slot_minutes: 30,
  note: null,
};

const MAX_PARTY_SIZE = 50;
const MAX_LEAD_MINUTES = 1440;
const MAX_DAYS_AHEAD = 180;
const MAX_NOTE_LENGTH = 200;
const ALLOWED_SLOT_MINUTES = [15, 30, 60] as const;

function toInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

/**
 * Safely extracts validated ReservationSettings from tenant_websites metadata.
 * Missing or malformed leaves fall back to defaults; unknown keys are dropped.
 * No settings at all => feature follows the owner offering with defaults.
 */
export function extractReservationSettings(metadata: unknown): ReservationSettings {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { ...DEFAULT_RESERVATION_SETTINGS };
  }
  const storefront = (metadata as Record<string, unknown>).storefront;
  if (!storefront || typeof storefront !== "object" || Array.isArray(storefront)) {
    return { ...DEFAULT_RESERVATION_SETTINGS };
  }
  const raw = (storefront as Record<string, unknown>).reservations;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_RESERVATION_SETTINGS };
  }
  const r = raw as Record<string, unknown>;

  const enabled = typeof r.enabled === "boolean" ? r.enabled : true;

  let max_party_size = DEFAULT_RESERVATION_SETTINGS.max_party_size;
  const rawParty = toInt(r.max_party_size);
  if (rawParty !== null && rawParty >= 1 && rawParty <= MAX_PARTY_SIZE) {
    max_party_size = rawParty;
  }

  let min_lead_minutes = DEFAULT_RESERVATION_SETTINGS.min_lead_minutes;
  const rawLead = toInt(r.min_lead_minutes);
  if (rawLead !== null && rawLead >= 0 && rawLead <= MAX_LEAD_MINUTES) {
    min_lead_minutes = rawLead;
  }

  let max_days_ahead = DEFAULT_RESERVATION_SETTINGS.max_days_ahead;
  const rawDays = toInt(r.max_days_ahead);
  if (rawDays !== null && rawDays >= 1 && rawDays <= MAX_DAYS_AHEAD) {
    max_days_ahead = rawDays;
  }

  const slot_minutes: ReservationSettings["slot_minutes"] = (
    ALLOWED_SLOT_MINUTES as readonly number[]
  ).includes(r.slot_minutes as number)
    ? (r.slot_minutes as ReservationSettings["slot_minutes"])
    : DEFAULT_RESERVATION_SETTINGS.slot_minutes;

  let note: string | null = null;
  if (typeof r.note === "string" && r.note.trim()) {
    note = r.note.trim().slice(0, MAX_NOTE_LENGTH);
  }

  return { enabled, max_party_size, min_lead_minutes, max_days_ahead, slot_minutes, note };
}

export interface ValidateReservationSettingsInput {
  enabled?: unknown;
  max_party_size?: unknown;
  min_lead_minutes?: unknown;
  max_days_ahead?: unknown;
  slot_minutes?: unknown;
  note?: unknown;
}

export type ValidateReservationSettingsResult =
  | { valid: true; settings: ReservationSettings }
  | { valid: false; error: string };

/**
 * Strictly validates owner-submitted reservation settings.
 * Drops unknown keys. Bounds every numeric field.
 */
export function validateReservationSettings(
  input: ValidateReservationSettingsInput
): ValidateReservationSettingsResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, error: "Invalid reservation settings payload." };
  }

  if (typeof input.enabled !== "boolean") {
    return { valid: false, error: "Reservation enabled flag must be true or false." };
  }

  const party = toInt(input.max_party_size);
  if (party === null || party < 1 || party > MAX_PARTY_SIZE) {
    return { valid: false, error: `Maximum party size must be between 1 and ${MAX_PARTY_SIZE}.` };
  }

  const lead = toInt(input.min_lead_minutes);
  if (lead === null || lead < 0 || lead > MAX_LEAD_MINUTES) {
    return { valid: false, error: `Minimum lead time must be between 0 and ${MAX_LEAD_MINUTES} minutes.` };
  }

  const days = toInt(input.max_days_ahead);
  if (days === null || days < 1 || days > MAX_DAYS_AHEAD) {
    return { valid: false, error: `Booking horizon must be between 1 and ${MAX_DAYS_AHEAD} days.` };
  }

  if (!(ALLOWED_SLOT_MINUTES as readonly unknown[]).includes(input.slot_minutes)) {
    return { valid: false, error: "Slot size must be 15, 30, or 60 minutes." };
  }

  let note: string | null = null;
  if (input.note !== null && input.note !== undefined && input.note !== "") {
    if (typeof input.note !== "string") {
      return { valid: false, error: "Reservation note must be text." };
    }
    if (input.note.trim().length > MAX_NOTE_LENGTH) {
      return { valid: false, error: `Reservation note must be ${MAX_NOTE_LENGTH} characters or fewer.` };
    }
    note = input.note.trim() || null;
  }

  return {
    valid: true,
    settings: {
      enabled: input.enabled,
      max_party_size: party,
      min_lead_minutes: lead,
      max_days_ahead: days,
      slot_minutes: input.slot_minutes as ReservationSettings["slot_minutes"],
      note,
    },
  };
}
