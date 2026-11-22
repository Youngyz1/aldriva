/**
 * lib/reservation-slots.ts
 *
 * Pure slot generation and starts_at validation for request-based table
 * reservations. Zero I/O; safe for the client picker and the server action.
 *
 * Reuses lib/website-hours.ts for the open/closed verdicts (overnight
 * spillover included) and only adds what orders never needed: discrete
 * slot boundaries within opening intervals.
 *
 * Hours shape: { mon: { open: "HH:MM", close: "HH:MM", closed?: true }, ... }.
 * A day without configured hours contributes no slots (the owner must set
 * opening hours; the setup checklist covers it).
 */

import {
  DEFAULT_WEBSITE_TIME_ZONE,
  isOvernightWebsiteInterval,
  isValidWebsiteTime,
  validateScheduledOrderTime,
} from "./website-hours";
import type { ReservationSettings } from "./reservation-settings";

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

const SHORT_DAY_TO_KEY: Record<string, WeekdayKey> = {
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
  sun: "sun",
};

const PREVIOUS_DAY_MAP: Record<WeekdayKey, WeekdayKey> = {
  mon: "sun",
  tue: "mon",
  wed: "tue",
  thu: "wed",
  fri: "thu",
  sat: "fri",
  sun: "sat",
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function safeTimeZone(timeZone: string): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_WEBSITE_TIME_ZONE;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toSlotLabel(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Minutes east of UTC for the wall clock at utcMs (DST-aware). */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - utcMs;
}

/**
 * Interprets a calendar date + wall-clock time in the site timezone as UTC
 * milliseconds. Returns null for malformed input or unknown zones.
 */
export function zonedTimeToUtc(dateYmd: string, hhmm: string, timeZone: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!dateMatch || !timeMatch || !isValidTimeZone(timeZone)) return null;
  const [/* full */, ys, ms, ds] = dateMatch;
  const [/* full */, hs, mins] = timeMatch;
  const y = Number(ys);
  const mo = Number(ms);
  const d = Number(ds);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  try {
    const naive = Date.UTC(y, mo - 1, d, Number(hs), Number(mins));
    let guess = naive - tzOffsetMs(naive, timeZone);
    guess = naive - tzOffsetMs(guess, timeZone);
    // Round-trip guard: the resolved instant must format back identically.
    const back = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(new Date(guess))
      .replace(",", "");
    if (back !== `${dateYmd} ${hhmm}`) return null;
    return guess;
  } catch {
    return null;
  }
}

/** Weekday key of a calendar date as seen in the site timezone. */
export function weekdayKeyOfDate(dateYmd: string, timeZone: string): WeekdayKey | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  if (!dateMatch || !isValidTimeZone(timeZone)) return null;
  try {
    const noonUtc = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), 12));
    const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone })
      .format(noonUtc)
      .toLowerCase();
    return SHORT_DAY_TO_KEY[name] ?? null;
  } catch {
    return null;
  }
}

/** Calendar date (YYYY-MM-DD) of an instant in the site timezone. */
export function ymdInTimeZone(date: Date, timeZone: string): string {
  const tz = safeTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Calendar date `days` after `ymd`, computed in the site timezone. */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Whether any weekday row is configured (open hours or an explicit closed). */
export function hasConfiguredHours(hoursValue: unknown): boolean {
  const hours = record(hoursValue);
  if (!hours) return false;
  return WEEKDAY_KEYS.some((day) => {
    const row = record(hours[day]);
    return Boolean(
      row && (row.closed === true || (isValidWebsiteTime(row.open) && isValidWebsiteTime(row.close)))
    );
  });
}

/**
 * Raw wall-clock slots for a calendar date: same-day open intervals plus the
 * previous day's overnight spill into the early morning. No lead/horizon
 * filtering — the picker applies the window, the server re-checks it.
 */
export function getRawReservationSlotsForDate(
  dateYmd: string,
  hoursValue: unknown,
  slotMinutes: number,
  timeZone: string
): string[] {
  if (!Number.isInteger(slotMinutes) || slotMinutes <= 0) return [];
  const tz = safeTimeZone(timeZone);
  const dayKey = weekdayKeyOfDate(dateYmd, tz);
  if (!dayKey) return [];
  const hours = record(hoursValue);
  if (!hours) return [];

  const intervals: Array<[number, number]> = [];

  const dayRow = record(hours[dayKey]);
  if (dayRow && dayRow.closed !== true && isValidWebsiteTime(dayRow.open) && isValidWebsiteTime(dayRow.close)) {
    const open = toMinutes(dayRow.open as string);
    const close = toMinutes(dayRow.close as string);
    intervals.push(isOvernightWebsiteInterval(dayRow.open, dayRow.close) ? [open, close + 1440] : [open, close]);
  }

  const prevRow = record(hours[PREVIOUS_DAY_MAP[dayKey]]);
  if (
    prevRow &&
    prevRow.closed !== true &&
    isValidWebsiteTime(prevRow.open) &&
    isValidWebsiteTime(prevRow.close) &&
    isOvernightWebsiteInterval(prevRow.open, prevRow.close)
  ) {
    intervals.push([0, toMinutes(prevRow.close as string)]);
  }

  const slots = new Set<string>();
  for (const [start, end] of intervals) {
    for (let t = start; t < end; t += slotMinutes) {
      slots.add(toSlotLabel(t));
    }
  }
  return [...slots].sort();
}

/**
 * Bookable slots for a calendar date after lead-time and horizon filtering.
 * Used by the date/slot picker (client) — the server validates on submit.
 */
export function getReservationSlotsForDate(
  dateYmd: string,
  hoursValue: unknown,
  settings: ReservationSettings,
  timeZone: string,
  now: Date = new Date()
): string[] {
  const tz = safeTimeZone(timeZone);
  const raw = getRawReservationSlotsForDate(dateYmd, hoursValue, settings.slot_minutes, tz);
  if (raw.length === 0) return [];
  const minMs = now.getTime() + settings.min_lead_minutes * 60_000;
  const maxMs = now.getTime() + settings.max_days_ahead * 86_400_000;
  return raw.filter((slot) => {
    const utc = zonedTimeToUtc(dateYmd, slot, tz);
    return utc !== null && utc >= minMs && utc <= maxMs;
  });
}

export type StartsAtErrorCode =
  | "invalid_format"
  | "lead_time_too_short"
  | "horizon_exceeded"
  | "closed_day"
  | "outside_opening_hours"
  | "off_slot"
  | "past_date";

export type ValidateStartsAtResult =
  | { valid: true; startsAt: string }
  | { valid: false; error: StartsAtErrorCode; message: string };

/**
 * Server-authoritative starts_at validation in the SITE timezone:
 * slot boundary, lead time, horizon, opening hours incl. overnight spill,
 * and closed days. Hours/lead/horizon verdicts reuse validateScheduledOrderTime.
 */
export function validateReservationStartsAt(
  requestedIso: unknown,
  hoursValue: unknown,
  settings: ReservationSettings,
  timeZone: string,
  now: Date = new Date()
): ValidateStartsAtResult {
  const tz = safeTimeZone(timeZone);
  if (typeof requestedIso !== "string" || !requestedIso.trim()) {
    return { valid: false, error: "invalid_format", message: "Please choose a date and time for your request." };
  }
  const target = new Date(requestedIso);
  if (isNaN(target.getTime())) {
    return { valid: false, error: "invalid_format", message: "Please choose a valid date and time." };
  }

  const hoursVerdict = validateScheduledOrderTime(
    requestedIso,
    hoursValue,
    tz,
    settings.min_lead_minutes,
    settings.max_days_ahead,
    now
  );
  if (!hoursVerdict.valid) {
    if (hoursVerdict.error === "lead_time_too_short") {
      return {
        valid: false,
        error: "lead_time_too_short",
        message: `Requests must be made at least ${settings.min_lead_minutes} minutes in advance.`,
      };
    }
    if (hoursVerdict.error === "horizon_exceeded") {
      return {
        valid: false,
        error: "horizon_exceeded",
        message: `Requests cannot be made more than ${settings.max_days_ahead} days in advance.`,
      };
    }
    if (hoursVerdict.error === "outside_opening_hours") {
      // Distinguish an explicitly closed day for a clearer message.
      const ymd = ymdInTimeZone(target, tz);
      const dayKey = weekdayKeyOfDate(ymd, tz);
      const hours = record(hoursValue);
      const dayRow = dayKey && hours ? record(hours[dayKey]) : undefined;
      if (dayRow && dayRow.closed === true) {
        return {
          valid: false,
          error: "closed_day",
          message: "The restaurant is closed that day. Please choose another date.",
        };
      }
      return {
        valid: false,
        error: "outside_opening_hours",
        message: "That time is outside opening hours. Please choose an available slot.",
      };
    }
    return { valid: false, error: "invalid_format", message: "Please choose a valid date and time." };
  }

  // Slot boundary: the requested wall-clock time must be a real slot.
  const ymd = ymdInTimeZone(target, tz);
  const wallClockRaw = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(target);
  // ICU can render midnight as "24:00" under hour12:false; normalize to "00:00".
  const wallClock = wallClockRaw.replace(/^24:/, "00:");
  const raw = getRawReservationSlotsForDate(ymd, hoursValue, settings.slot_minutes, tz);
  if (!raw.includes(wallClock)) {
    return {
      valid: false,
      error: "off_slot",
      message: "Please choose one of the available time slots.",
    };
  }

  return { valid: true, startsAt: target.toISOString() };
}

/**
 * Validates that starts_at is valid and that starts_at + duration_minutes
 * does not extend beyond opening hours (including overnight closing spillover).
 */
export function validateReservationInterval(
  requestedIso: unknown,
  durationMinutes: number,
  hoursValue: unknown,
  settings: ReservationSettings,
  timeZone: string,
  now: Date = new Date()
): ValidateStartsAtResult {
  const startsCheck = validateReservationStartsAt(requestedIso, hoursValue, settings, timeZone, now);
  if (!startsCheck.valid) return startsCheck;

  if (!Number.isInteger(durationMinutes) || durationMinutes < 15) {
    return { valid: false, error: "invalid_format", message: "Duration must be at least 15 minutes." };
  }

  if (hasConfiguredHours(hoursValue)) {
    const tz = safeTimeZone(timeZone);
    const target = new Date(requestedIso as string);
    const ymd = ymdInTimeZone(target, tz);
    const dayKey = weekdayKeyOfDate(ymd, tz);
    const hours = record(hoursValue);
    if (dayKey && hours) {
      const dayRow = record(hours[dayKey]);
      if (dayRow && dayRow.closed !== true && isValidWebsiteTime(dayRow.open) && isValidWebsiteTime(dayRow.close)) {
        const wallClockRaw = new Intl.DateTimeFormat("en-GB", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(target);
        const wallClock = wallClockRaw.replace(/^24:/, "00:");
        const startMins = toMinutes(wallClock);
        const isOvernight = isOvernightWebsiteInterval(dayRow.open, dayRow.close);
        const openMins = toMinutes(dayRow.open as string);
        const closeMins = toMinutes(dayRow.close as string) + (isOvernight ? 1440 : 0);

        let effectiveStart = startMins;
        if (isOvernight && startMins < openMins) {
          effectiveStart = startMins + 1440;
        }

        if (effectiveStart + durationMinutes > closeMins) {
          return {
            valid: false,
            error: "outside_opening_hours",
            message: "Reservation duration extends past closing time. Please choose an earlier time or shorter stay.",
          };
        }
      }
    }
  }

  return startsCheck;
}

/**
 * Whether a calendar date is an "open day" by the owner's saved business
 * hours: the date's own weekday row is configured with open + close and is
 * not explicitly closed. No overnight-spill or slot-boundary consideration —
 * used for the date_only booking mode, which offers no time grid at all.
 */
export function isDateOpen(dateYmd: string, hoursValue: unknown, timeZone: string): boolean {
  const tz = safeTimeZone(timeZone);
  const dayKey = weekdayKeyOfDate(dateYmd, tz);
  if (!dayKey) return false;
  const hours = record(hoursValue);
  if (!hours) return false;
  const row = record(hours[dayKey]);
  return Boolean(row && row.closed !== true && isValidWebsiteTime(row.open as string) && isValidWebsiteTime(row.close as string));
}

/**
 * Server-authoritative date-only validation for a service in date_only mode.
 * Checks the date is today-or-later, inside the horizon, and on an open day
 * by business hours. There is NO slot-grid / off_slot check: date_only
 * bookings carry no chosen time.
 */
export function validateReservationDateOnly(
  requestedIso: unknown,
  hoursValue: unknown,
  settings: ReservationSettings,
  timeZone: string,
  now: Date = new Date()
): ValidateStartsAtResult {
  const tz = safeTimeZone(timeZone);
  if (typeof requestedIso !== "string" || !requestedIso.trim()) {
    return { valid: false, error: "invalid_format", message: "Please choose a date for your request." };
  }
  const target = new Date(requestedIso);
  if (isNaN(target.getTime())) {
    return { valid: false, error: "invalid_format", message: "Please choose a valid date." };
  }
  const ymd = ymdInTimeZone(target, tz);
  if (!ymd) {
    return { valid: false, error: "invalid_format", message: "Please choose a valid date." };
  }
  const todayYmd = ymdInTimeZone(now, tz);
  if (ymd < todayYmd) {
    return { valid: false, error: "past_date", message: "Please choose today or a later date." };
  }
  const maxYmd = addDaysYmd(todayYmd, settings.max_days_ahead);
  if (ymd > maxYmd) {
    return { valid: false, error: "horizon_exceeded", message: `Requests cannot be made more than ${settings.max_days_ahead} days in advance.` };
  }
  if (!isDateOpen(ymd, hoursValue, tz)) {
    return { valid: false, error: "closed_day", message: "The business is closed that day. Please choose another date." };
  }
  const startsAt = zonedTimeToUtc(ymd, "12:00", tz);
  if (startsAt === null) {
    return { valid: false, error: "invalid_format", message: "Please choose a valid date." };
  }
  return { valid: true, startsAt: new Date(startsAt).toISOString() };
}

/**
 * Display helper: formats duration minutes as "1 h", "1 h 30", or "45 m".
 */
export function formatDurationOptionLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} h ${m}`;
  if (h > 0) return `${h} h`;
  return `${m} m`;
}

export interface FormatReservationTimeRangeInput {
  startsAt: string;
  endsAt?: string | null;
  durationMinutes?: number | null;
  timeZone: string;
  locale?: string;
}

/**
 * Display helper: formats start and end time ("12:00 PM – 2:00 PM") plus duration ("2 h")
 * using ends_at (or starts_at + duration_minutes fallback) and the exact same timezone
 * formatter options used for starts_at.
 */
export function formatReservationTimeRange(input: FormatReservationTimeRangeInput): string {
  const { startsAt, endsAt, durationMinutes, timeZone, locale } = input;
  const loc = locale === "fr" ? "fr-FR" : "en-US";
  const startDate = new Date(startsAt);

  let endDate: Date;
  let effectiveDuration = durationMinutes;

  if (endsAt) {
    endDate = new Date(endsAt);
    if (!effectiveDuration || effectiveDuration <= 0) {
      effectiveDuration = Math.round((endDate.getTime() - startDate.getTime()) / 60_000);
    }
  } else if (effectiveDuration && effectiveDuration > 0) {
    endDate = new Date(startDate.getTime() + effectiveDuration * 60_000);
  } else {
    effectiveDuration = 90;
    endDate = new Date(startDate.getTime() + effectiveDuration * 60_000);
  }

  const durationStr = formatDurationOptionLabel(effectiveDuration);

  try {
    const startFormatted = startDate.toLocaleString(loc, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
    const endFormatted = endDate.toLocaleTimeString(loc, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
    return `${startFormatted} – ${endFormatted} (${durationStr})`;
  } catch {
    try {
      const startFormatted = startDate.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const endFormatted = endDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${startFormatted} – ${endFormatted} (${durationStr})`;
    } catch {
      return `${startsAt} (${durationStr})`;
    }
  }
}

