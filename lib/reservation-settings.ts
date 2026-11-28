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
  seat_capacity?: number | null;
  default_stay_minutes?: number;
  max_stay_minutes?: number;
  allowed_stay_minutes?: number[];
  cancellation_cutoff_minutes?: number | null;
}

export const DEFAULT_RESERVATION_SETTINGS: ReservationSettings = {
  enabled: true,
  max_party_size: 12,
  min_lead_minutes: 60,
  max_days_ahead: 30,
  slot_minutes: 30,
  note: null,
  seat_capacity: null,
  default_stay_minutes: 90,
  max_stay_minutes: 120,
  allowed_stay_minutes: [90, 120],
  cancellation_cutoff_minutes: null,
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

  let seat_capacity: number | null = null;
  const rawCapacity = toInt(r.seat_capacity);
  if (rawCapacity !== null && rawCapacity >= 1 && rawCapacity <= 5000) {
    seat_capacity = rawCapacity;
  }

  let default_stay_minutes = DEFAULT_RESERVATION_SETTINGS.default_stay_minutes ?? 90;
  const rawDefaultStay = toInt(r.default_stay_minutes);
  if (rawDefaultStay !== null && rawDefaultStay >= 15 && rawDefaultStay <= 480) {
    default_stay_minutes = rawDefaultStay;
  }

  let max_stay_minutes = Math.max(default_stay_minutes, DEFAULT_RESERVATION_SETTINGS.max_stay_minutes ?? 120);
  const rawMaxStay = toInt(r.max_stay_minutes);
  if (rawMaxStay !== null && rawMaxStay >= default_stay_minutes && rawMaxStay <= 720) {
    max_stay_minutes = rawMaxStay;
  }

  let allowed_stay_minutes: number[] = [];
  if (Array.isArray(r.allowed_stay_minutes)) {
    const cleaned = Array.from(
      new Set(
        r.allowed_stay_minutes
          .map(toInt)
          .filter((v): v is number => v !== null && v >= 15 && v <= 720)
      )
    ).sort((a, b) => a - b);
    if (cleaned.length >= 1 && cleaned.length <= 8) {
      allowed_stay_minutes = cleaned;
    }
  }

  // Derive allowed_stay_minutes for existing businesses with no list in metadata
  if (allowed_stay_minutes.length === 0) {
    allowed_stay_minutes =
      default_stay_minutes === max_stay_minutes
        ? [default_stay_minutes]
        : [default_stay_minutes, max_stay_minutes].sort((a, b) => a - b);
  }

  // Ensure default and max stay are consistent with allowed list
  max_stay_minutes = allowed_stay_minutes[allowed_stay_minutes.length - 1];
  if (!allowed_stay_minutes.includes(default_stay_minutes)) {
    default_stay_minutes = allowed_stay_minutes[0];
  }

  let cancellation_cutoff_minutes: number | null = null;
  if (r.cancellation_cutoff_minutes !== undefined && r.cancellation_cutoff_minutes !== null && r.cancellation_cutoff_minutes !== "") {
    const rawCutoff = toInt(r.cancellation_cutoff_minutes);
    if (rawCutoff !== null && rawCutoff >= 0 && rawCutoff <= 10080) {
      cancellation_cutoff_minutes = rawCutoff;
    }
  }

  return {
    enabled,
    max_party_size,
    min_lead_minutes,
    max_days_ahead,
    slot_minutes,
    note,
    seat_capacity,
    default_stay_minutes,
    max_stay_minutes,
    allowed_stay_minutes,
    cancellation_cutoff_minutes,
  };
}

export interface ValidateReservationSettingsInput {
  enabled?: unknown;
  max_party_size?: unknown;
  min_lead_minutes?: unknown;
  max_days_ahead?: unknown;
  slot_minutes?: unknown;
  note?: unknown;
  seat_capacity?: unknown;
  default_stay_minutes?: unknown;
  max_stay_minutes?: unknown;
  allowed_stay_minutes?: unknown;
  cancellation_cutoff_minutes?: unknown;
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

  let seat_capacity: number | null = null;
  if (input.seat_capacity !== undefined && input.seat_capacity !== null && input.seat_capacity !== "") {
    const rawCap = toInt(input.seat_capacity);
    if (rawCap === null || rawCap < 1 || rawCap > 5000) {
      return { valid: false, error: "Seat capacity must be between 1 and 5000." };
    }
    seat_capacity = rawCap;
  }

  let allowed_stay_minutes: number[] = [];
  if (input.allowed_stay_minutes !== undefined) {
    if (!Array.isArray(input.allowed_stay_minutes)) {
      return { valid: false, error: "Allowed stay durations must be a list of numbers." };
    }
    const parsed = input.allowed_stay_minutes.map(toInt);
    if (parsed.some((v) => v === null || v < 15 || v > 720)) {
      return { valid: false, error: "Allowed stay durations must be integers between 15 and 720 minutes." };
    }
    const distinct = Array.from(new Set(parsed as number[])).sort((a, b) => a - b);
    if (distinct.length < 1 || distinct.length > 8) {
      return { valid: false, error: "You must specify between 1 and 8 allowed stay durations." };
    }
    allowed_stay_minutes = distinct;
  }

  let default_stay_minutes = DEFAULT_RESERVATION_SETTINGS.default_stay_minutes ?? 90;
  if (input.default_stay_minutes !== undefined && input.default_stay_minutes !== null && input.default_stay_minutes !== "") {
    const rawDefault = toInt(input.default_stay_minutes);
    if (rawDefault === null || rawDefault < 15 || rawDefault > 480) {
      return { valid: false, error: "Default stay must be between 15 and 480 minutes." };
    }
    default_stay_minutes = rawDefault;
  }

  let max_stay_minutes = Math.max(default_stay_minutes, DEFAULT_RESERVATION_SETTINGS.max_stay_minutes ?? 120);
  if (input.max_stay_minutes !== undefined && input.max_stay_minutes !== null && input.max_stay_minutes !== "") {
    const rawMax = toInt(input.max_stay_minutes);
    if (rawMax === null || rawMax < default_stay_minutes || rawMax > 720) {
      return { valid: false, error: `Max stay must be between default stay (${default_stay_minutes}m) and 720 minutes.` };
    }
    max_stay_minutes = rawMax;
  }

  // If allowed_stay_minutes was omitted, derive from default and max stay
  if (allowed_stay_minutes.length === 0) {
    allowed_stay_minutes =
      default_stay_minutes === max_stay_minutes
        ? [default_stay_minutes]
        : [default_stay_minutes, max_stay_minutes].sort((a, b) => a - b);
  }

  // Consistent: default stay must be in allowed list, and max stay is max(allowed)
  if (!allowed_stay_minutes.includes(default_stay_minutes)) {
    return { valid: false, error: "Default stay duration must be one of the allowed stay durations." };
  }
  max_stay_minutes = allowed_stay_minutes[allowed_stay_minutes.length - 1];

  let cancellation_cutoff_minutes: number | null = null;
  if (
    input.cancellation_cutoff_minutes !== undefined &&
    input.cancellation_cutoff_minutes !== null &&
    input.cancellation_cutoff_minutes !== ""
  ) {
    const rawCutoff = toInt(input.cancellation_cutoff_minutes);
    if (rawCutoff === null || rawCutoff < 0 || rawCutoff > 10080) {
      return { valid: false, error: "Cancellation cutoff must be between 0 and 10080 minutes." };
    }
    cancellation_cutoff_minutes = rawCutoff;
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
      seat_capacity,
      default_stay_minutes,
      max_stay_minutes,
      allowed_stay_minutes,
      cancellation_cutoff_minutes,
    },
  };
}
