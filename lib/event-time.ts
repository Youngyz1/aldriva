/**
 * lib/event-time.ts
 *
 * Canonical date and time parsing, wall-clock to UTC conversion,
 * localized display formatting, and calendar (.ics / Google Calendar) generation.
 *
 * Principles:
 * - `events.event_date` stores a wall-clock timestamp (e.g. "2026-11-14 19:00:00" or "2026-11-14T19:00").
 *   Eventbrite-imported events may store UTC strings with a Z suffix ("2026-11-14T19:00:00Z").
 * - We NEVER call `new Date(naiveString)` because JS Date parses naive ISO strings
 *   in the current environment/process timezone, leading to drift.
 * - Display formatting extracts the numerical parts directly without timezone shift.
 *   When `isUtc=true`, call `toWallClockInTimezone(dateStr, tz)` first to get the
 *   local wall-clock string before displaying.
 * - UTC instant conversion (for countdowns and calendar exports) uses `date-fns-tz` `fromZonedTime`
 *   with the event page's authoritative IANA timezone.
 * - DTEND: only emitted when an explicit end date is present. We do NOT invent a
 *   default duration — absence of DTEND is valid per RFC 5545 §3.6.1 and is safer
 *   than an invented time that may mislead calendar apps.
 */

import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

export interface ParsedEventDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  isUtc: boolean;
  rawString: string;
}

/**
 * Parses any event_date string into its numerical components explicitly.
 * Handles:
 * - "2026-11-14 19:00:00"
 * - "2026-11-14T19:00:00"
 * - "2026-11-14T19:00"
 * - "2026-11-14T19:00:00Z" / "2026-11-14T19:00:00+01:00"
 */
export function parseEventDateParts(dateStr: string | null | undefined): ParsedEventDate | null {
  if (!dateStr || typeof dateStr !== "string") return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Regex to extract YYYY-MM-DD and HH:mm[:ss] with optional timezone offset/Z
  const match = trimmed.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i
  );

  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = match[4] ? parseInt(match[4], 10) : 0;
  const minute = match[5] ? parseInt(match[5], 10) : 0;
  const second = match[6] ? parseInt(match[6], 10) : 0;
  const tzSuffix = match[7];
  const isUtc = Boolean(tzSuffix && (tzSuffix === "Z" || tzSuffix === "z" || tzSuffix.startsWith("+00") || tzSuffix.startsWith("-00")));

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return null;
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    isUtc,
    rawString: trimmed,
  };
}

/**
 * Converts a wall-clock date string + IANA timezone into a UTC JavaScript Date instant.
 * Uses `date-fns-tz` fromZonedTime so all DST transitions and offsets are accurately resolved.
 *
 * If the input string already carries a Z or offset suffix (e.g. Eventbrite UTC strings),
 * `parseEventDateParts` will set `isUtc=true`. In that case, call `toWallClockInTimezone()`
 * first to convert the UTC instant to the local wall-clock before calling this function.
 */
export function wallClockToUtc(dateStr: string | null | undefined, timezone: string): Date | null {
  const parts = parseEventDateParts(dateStr);
  if (!parts) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const isoNaive = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;

  try {
    const tz = timezone && timezone.trim() ? timezone.trim() : "UTC";
    const date = fromZonedTime(isoNaive, tz);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

/**
 * Converts a date string that may carry a UTC offset or Z suffix (e.g. Eventbrite imports:
 * "2026-11-14T19:00:00Z" or "2026-11-14T19:00:00+01:00") into a wall-clock ISO string in
 * the given IANA timezone.
 *
 * If the string is a naive wall-clock (no suffix), it is returned unchanged.
 * This must be called before `formatWallClockDisplay` when `event_date` may be UTC-sourced.
 *
 * Example:
 *   toWallClockInTimezone("2026-11-14T19:00:00Z", "Europe/London") -> "2026-11-14T19:00:00"
 *   toWallClockInTimezone("2026-11-14T19:00:00Z", "America/New_York") -> "2026-11-14T14:00:00"
 */
export function toWallClockInTimezone(dateStr: string | null | undefined, timezone: string): string | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  const parts = parseEventDateParts(trimmed);
  if (!parts) return null;

  // If naive (no UTC/offset marker) — return as-is; it's already a wall-clock string.
  if (!parts.isUtc && !hasOffsetSuffix(trimmed)) {
    return trimmed;
  }

  // The string carries a UTC or offset marker — parse it as a JS Date instant.
  const instant = new Date(trimmed);
  if (Number.isNaN(instant.getTime())) return null;

  const tz = timezone && timezone.trim() ? timezone.trim() : "UTC";
  try {
    // formatInTimeZone returns a string in the target timezone.
    return formatInTimeZone(instant, tz, "yyyy-MM-dd'T'HH:mm:ss");
  } catch {
    return null;
  }
}

/** Returns true if the trimmed date string ends with a timezone offset or Z. */
function hasOffsetSuffix(trimmed: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
}

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const MONTH_NAMES_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"
];

const WEEKDAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_NAMES_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * Formats a wall-clock date string for invitation display without timezone conversion.
 * The display faithfully renders the host-entered wall-clock numbers in the requested locale.
 */
export function formatWallClockDisplay(
  dateStr: string | null | undefined,
  locale: "en" | "fr" = "en",
  timezone?: string | null
): { dateDisplay: string; timeDisplay: string; fullDisplay: string } {
  const parts = parseEventDateParts(dateStr);
  if (!parts) {
    return {
      dateDisplay: locale === "fr" ? "Date à confirmer" : "Date TBA",
      timeDisplay: locale === "fr" ? "Heure à confirmer" : "Time TBA",
      fullDisplay: locale === "fr" ? "Date et heure à confirmer" : "Date & Time TBA",
    };
  }

  // Calculate day of week using standard Gregorian math (Zeller/Sakamoto formula)
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayOfWeekIndex = d.getUTCDay();

  const isFr = locale === "fr";
  const weekday = isFr ? WEEKDAY_NAMES_FR[dayOfWeekIndex] : WEEKDAY_NAMES_EN[dayOfWeekIndex];
  const monthName = isFr ? MONTH_NAMES_FR[parts.month - 1] : MONTH_NAMES_EN[parts.month - 1];

  let dateDisplay = "";
  if (isFr) {
    dateDisplay = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${parts.day} ${monthName} ${parts.year}`;
  } else {
    dateDisplay = `${weekday}, ${monthName} ${parts.day}, ${parts.year}`;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  let timeDisplay = "";
  if (isFr) {
    timeDisplay = `${parts.hour}h${pad(parts.minute)}`;
  } else {
    const isPm = parts.hour >= 12;
    const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
    timeDisplay = `${hour12}:${pad(parts.minute)} ${isPm ? "PM" : "AM"}`;
  }

  // If timezone is known, append short abbreviation or offset if desired
  let tzSuffix = "";
  if (timezone && timezone.trim()) {
    try {
      const utcDate = wallClockToUtc(dateStr, timezone);
      if (utcDate) {
        const tzAbbr = new Intl.DateTimeFormat(isFr ? "fr-FR" : "en-US", {
          timeZone: timezone,
          timeZoneName: "short",
        })
          .formatToParts(utcDate)
          .find((p) => p.type === "timeZoneName")?.value;
        if (tzAbbr) {
          tzSuffix = ` ${tzAbbr}`;
        }
      }
    } catch {}
  }

  const finalTime = tzSuffix ? `${timeDisplay}${tzSuffix}` : timeDisplay;
  const fullDisplay = `${dateDisplay} • ${finalTime}`;

  return {
    dateDisplay,
    timeDisplay: finalTime,
    fullDisplay,
  };
}

/**
 * Formats a Date object into UTC compact format for iCalendar/Google Calendar: `YYYYMMDDTHHMMSSZ`.
 */
export function formatUtcToIcsString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

export interface CalendarEventPayload {
  title: string;
  description?: string | null;
  venue?: string | null;
  address?: string | null;
  startDate: string; // wall-clock or ISO
  endDate?: string | null;
  timezone: string;
  url?: string | null;
}

/**
 * Generates RFC 5545 standard .ics file text with DTSTART in UTC (Z).
 * DTEND is only included when an explicit end date is provided.
 * Omitting DTEND is valid per RFC 5545 §3.6.1 and produces a zero-duration
 * (point-in-time) event in most calendar apps, which is correct when the
 * host has not set an end time.
 */
export function generateIcsContent(event: CalendarEventPayload): string {
  const startUtc = wallClockToUtc(event.startDate, event.timezone) ?? new Date();
  const endUtc = event.endDate ? wallClockToUtc(event.endDate, event.timezone) : null;

  const dtStart = formatUtcToIcsString(startUtc);
  const nowUtc = formatUtcToIcsString(new Date());

  const locationParts = [event.venue, event.address].filter(Boolean);
  const location = locationParts.join(", ").replace(/[\r\n]+/g, " ");

  const cleanDescription = (event.description || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

  const cleanSummary = (event.title || "Aldriva Event")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, " ");

  const cleanLocation = location
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");

  const uid = `aldriva-invitation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@aldriva.com`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aldriva//Invitation Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${nowUtc}`,
    `DTSTART:${dtStart}`,
  ];

  // Only emit DTEND when an explicit end date was provided and is after start.
  if (endUtc && endUtc.getTime() > startUtc.getTime()) {
    lines.push(`DTEND:${formatUtcToIcsString(endUtc)}`);
  }

  lines.push(`SUMMARY:${cleanSummary}`);

  if (cleanDescription) {
    lines.push(`DESCRIPTION:${cleanDescription}`);
  }
  if (cleanLocation) {
    lines.push(`LOCATION:${cleanLocation}`);
  }
  if (event.url) {
    lines.push(`URL:${event.url}`);
  }

  lines.push("STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");
}

/**
 * Triggers a browser download of the generated .ics calendar file.
 *
 * BROWSER-ONLY: This function uses `window`, `URL.createObjectURL`, and
 * `document.createElement`, which are not available in server/Node.js contexts.
 * The early-return guard (`typeof window === "undefined"`) prevents a throw when
 * this module is imported server-side, but the function must never be called on
 * the server. Import from a "use client" component or call from a browser event handler.
 */
export function downloadIcsFile(event: CalendarEventPayload, filename?: string): void {
  if (typeof window === "undefined") return;
  const ics = generateIcsContent(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeTitle = (event.title || "invitation")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-");
  a.download = filename || `invitation-${safeTitle}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generates a Google Calendar URL with DTSTART in UTC (YYYYMMDDTHHMMSSZ).
 * When no end date is provided, the `dates` param uses the start timestamp
 * for both sides — Google Calendar interprets this as a zero-duration event.
 */
export function generateGoogleCalendarUrl(event: CalendarEventPayload): string {
  const startUtc = wallClockToUtc(event.startDate, event.timezone) ?? new Date();
  const endUtc = event.endDate ? wallClockToUtc(event.endDate, event.timezone) : null;

  const dtStart = formatUtcToIcsString(startUtc);
  // When endDate absent or invalid/before start, use startUtc for Google Calendar end too.
  const dtEnd = endUtc && endUtc.getTime() > startUtc.getTime()
    ? formatUtcToIcsString(endUtc)
    : dtStart;

  const locationParts = [event.venue, event.address].filter(Boolean);
  const location = locationParts.join(", ");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || "Aldriva Event",
    dates: `${dtStart}/${dtEnd}`,
  });

  if (event.description) {
    params.set("details", event.description);
  }
  if (location) {
    params.set("location", location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
