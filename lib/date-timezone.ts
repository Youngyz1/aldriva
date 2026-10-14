/**
 * lib/date-timezone.ts
 *
 * Pure date and timezone calculations for site-relative "Today" windows.
 * No I/O. Supports any standard IANA timezone identifier (e.g. "Africa/Abidjan", "America/New_York").
 * Defaults to "Africa/Abidjan" (UTC+0).
 */

export const DEFAULT_SITE_TIMEZONE = "Africa/Abidjan";

/**
 * Returns the exact UTC Date representing 00:00:00.000 (start of day)
 * in the specified IANA timezone for the given reference time.
 */
export function getStartOfTodayInTimezone(
  timeZone: string = DEFAULT_SITE_TIMEZONE,
  now: Date = new Date()
): Date {
  const tz = (timeZone && timeZone.trim()) || DEFAULT_SITE_TIMEZONE;
  let dateStr: string;

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateStr = formatter.format(now);
  } catch {
    const fallback = new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_SITE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateStr = fallback.format(now);
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(utcGuess);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: DEFAULT_SITE_TIMEZONE,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(utcGuess);
  }

  const p: Record<string, string> = {};
  for (const item of parts) {
    p[item.type] = item.value;
  }

  const formattedHour = Number(p.hour === "24" ? "0" : p.hour);
  const formattedMin = Number(p.minute || 0);
  const formattedDay = Number(p.day || d);

  const diffMinutes = (formattedDay - d) * 24 * 60 + formattedHour * 60 + formattedMin;
  return new Date(utcGuess.getTime() - diffMinutes * 60_000);
}

/**
 * Returns the exact UTC Date representing 23:59:59.999 (end of day)
 * in the specified IANA timezone.
 */
export function getEndOfTodayInTimezone(
  timeZone: string = DEFAULT_SITE_TIMEZONE,
  now: Date = new Date()
): Date {
  const start = getStartOfTodayInTimezone(timeZone, now);
  return new Date(start.getTime() + 86_400_000 - 1);
}

/**
 * Checks whether an ISO date string falls inside "Today" for the given timezone.
 */
export function isTodayInTimezone(
  isoDateStr: string,
  timeZone: string = DEFAULT_SITE_TIMEZONE,
  now: Date = new Date()
): boolean {
  const date = new Date(isoDateStr);
  if (isNaN(date.getTime())) return false;
  const start = getStartOfTodayInTimezone(timeZone, now);
  const end = getEndOfTodayInTimezone(timeZone, now);
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}
