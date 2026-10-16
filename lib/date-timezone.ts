/**
 * lib/date-timezone.ts
 *
 * Pure date and timezone calculations for site-relative "Today" windows.
 * No I/O. Supports any standard IANA timezone identifier (e.g. "Africa/Abidjan", "America/New_York").
 * Defaults to "Africa/Abidjan" (UTC+0).
 */

export const DEFAULT_SITE_TIMEZONE = "Africa/Abidjan";

/**
 * Business-country → default IANA site timezone. Normalized comparison
 * (case/diacritics-insensitive; "CI" alpha-2 also accepted). Unknown or
 * missing countries fall back to DEFAULT_SITE_TIMEZONE. The owner's explicit
 * choice (tenant_websites.metadata.timezone) always wins over this default.
 */
const TIMEZONE_BY_COUNTRY: Record<string, string> = {
  "cote d'ivoire": "Africa/Abidjan",
  "ivory coast": "Africa/Abidjan",
  ci: "Africa/Abidjan",
  senegal: "Africa/Dakar",
  sn: "Africa/Dakar",
  mali: "Africa/Bamako",
  ml: "Africa/Bamako",
  "burkina faso": "Africa/Ouagadougou",
  bf: "Africa/Ouagadougou",
  benin: "Africa/Porto-Novo",
  bj: "Africa/Porto-Novo",
  togo: "Africa/Lome",
  tg: "Africa/Lome",
  niger: "Africa/Niamey",
  ne: "Africa/Niamey",
  "guinea-bissau": "Africa/Bissau",
  gw: "Africa/Bissau",
  guinea: "Africa/Conakry",
  gn: "Africa/Conakry",
  cameroon: "Africa/Douala",
  cm: "Africa/Douala",
  chad: "Africa/Ndjamena",
  td: "Africa/Ndjamena",
  "central african republic": "Africa/Bangui",
  cf: "Africa/Bangui",
  "republic of the congo": "Africa/Brazzaville",
  congo: "Africa/Brazzaville",
  cg: "Africa/Brazzaville",
  "equatorial guinea": "Africa/Malabo",
  gq: "Africa/Malabo",
  gabon: "Africa/Libreville",
  ga: "Africa/Libreville",
  nigeria: "Africa/Lagos",
  ng: "Africa/Lagos",
  ghana: "Africa/Accra",
  gh: "Africa/Accra",
  liberia: "Africa/Monrovia",
  lr: "Africa/Monrovia",
  "sierra leone": "Africa/Freetown",
  sl: "Africa/Freetown",
  france: "Europe/Paris",
  fr: "Europe/Paris",
  "united states": "America/New_York",
  "united states of america": "America/New_York",
  usa: "America/New_York",
  us: "America/New_York",
  "united kingdom": "Europe/London",
  uk: "Europe/London",
  gb: "Europe/London",
  canada: "America/Toronto",
  ca: "America/Toronto",
};

export function defaultTimezoneForCountry(country: unknown): string {
  if (typeof country !== "string" || !country.trim()) return DEFAULT_SITE_TIMEZONE;
  const key = country
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return TIMEZONE_BY_COUNTRY[key] ?? DEFAULT_SITE_TIMEZONE;
}

/** Curated IANA list for the organizer Settings timezone dropdown. */
export const SITE_TIMEZONE_OPTIONS = [
  "Africa/Abidjan",
  "Africa/Accra",
  "Africa/Bamako",
  "Africa/Bangui",
  "Africa/Bissau",
  "Africa/Brazzaville",
  "Africa/Conakry",
  "Africa/Dakar",
  "Africa/Douala",
  "Africa/Freetown",
  "Africa/Lagos",
  "Africa/Libreville",
  "Africa/Lome",
  "Africa/Malabo",
  "Africa/Monrovia",
  "Africa/Ndjamena",
  "Africa/Niamey",
  "Africa/Ouagadougou",
  "Africa/Porto-Novo",
  "Europe/Paris",
  "Europe/London",
  "America/New_York",
  "America/Toronto",
  "UTC",
] as const;

/** True for real IANA zones (used to validate the owner's timezone choice). */
export function isValidIanaTimezone(zone: unknown): boolean {
  if (typeof zone !== "string" || !zone.trim()) return false;
  try {
    const supported: string[] =
      typeof (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf === "function"
        ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone")
        : [];
    if (supported.length > 0) return supported.includes(zone.trim());
    new Intl.DateTimeFormat("en-US", { timeZone: zone.trim() });
    return true;
  } catch {
    return false;
  }
}

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

/**
 * ONE timezone precedence rule for every Today/order/reservation reader:
 * the owner's explicit metadata.timezone choice wins, else the default
 * derived from the business country, else DEFAULT_SITE_TIMEZONE.
 */
export function resolveSiteTimezone(
  metadataTimezone: unknown,
  countryDefault: string = DEFAULT_SITE_TIMEZONE
): string {
  if (typeof metadataTimezone === "string" && metadataTimezone.trim()) {
    return metadataTimezone.trim();
  }
  if (typeof countryDefault === "string" && countryDefault.trim()) {
    return countryDefault.trim();
  }
  return DEFAULT_SITE_TIMEZONE;
}
