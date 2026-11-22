/**
 * lib/dashboard/date-range.ts
 *
 * Shared date-range handling for the dashboard redesign.
 * Resolves period windows (today / 7d / 30d / month / custom) relative to the site timezone.
 */

import {
  DEFAULT_SITE_TIMEZONE,
  getStartOfTodayInTimezone,
  getEndOfTodayInTimezone,
  resolveSiteTimezone,
} from "../date-timezone";

export type PeriodKind = "today" | "7d" | "30d" | "month" | "custom";

export interface PeriodValue {
  kind: PeriodKind;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}

export interface PeriodRange {
  kind: PeriodKind;
  from: Date;
  to: Date;
  fromIso: string;
  toIso: string;
  label: string;
  timezone: string;
}

export const PERIOD_OPTIONS: Array<{ kind: PeriodKind; labelKey: string; defaultLabel: string }> = [
  { kind: "today", labelKey: "Overview.period.today", defaultLabel: "Today" },
  { kind: "7d", labelKey: "Overview.period.7d", defaultLabel: "Last 7 days" },
  { kind: "30d", labelKey: "Overview.period.30d", defaultLabel: "Last 30 days" },
  { kind: "month", labelKey: "Overview.period.month", defaultLabel: "This month" },
  { kind: "custom", labelKey: "Overview.period.custom", defaultLabel: "Custom range" },
];

/**
 * Resolves date boundaries for a period in the given IANA timezone.
 */
export function resolvePeriodRange(
  period: string | undefined | null,
  timezone: string = DEFAULT_SITE_TIMEZONE,
  customFrom?: string | null,
  customTo?: string | null,
  now: Date = new Date()
): PeriodRange {
  const tz = resolveSiteTimezone(timezone);
  const startOfToday = getStartOfTodayInTimezone(tz, now);
  const endOfToday = getEndOfTodayInTimezone(tz, now);

  const normalized = (period || "today").toLowerCase().trim() as PeriodKind;

  switch (normalized) {
    case "7d": {
      const from = new Date(startOfToday.getTime() - 6 * 86_400_000);
      return {
        kind: "7d",
        from,
        to: endOfToday,
        fromIso: from.toISOString(),
        toIso: endOfToday.toISOString(),
        label: "Last 7 days",
        timezone: tz,
      };
    }
    case "30d": {
      const from = new Date(startOfToday.getTime() - 29 * 86_400_000);
      return {
        kind: "30d",
        from,
        to: endOfToday,
        fromIso: from.toISOString(),
        toIso: endOfToday.toISOString(),
        label: "Last 30 days",
        timezone: tz,
      };
    }
    case "month": {
      let year = now.getUTCFullYear();
      let month = now.getUTCMonth();
      try {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          year: "numeric",
          month: "numeric",
        }).formatToParts(now);
        for (const p of parts) {
          if (p.type === "year") year = Number(p.value);
          if (p.type === "month") month = Number(p.value) - 1;
        }
      } catch {
        // fallback to UTC year/month
      }
      const firstOfMonthGuess = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const from = getStartOfTodayInTimezone(tz, firstOfMonthGuess);
      return {
        kind: "month",
        from,
        to: endOfToday,
        fromIso: from.toISOString(),
        toIso: endOfToday.toISOString(),
        label: "This month",
        timezone: tz,
      };
    }
    case "custom": {
      if (customFrom && customTo) {
        const parsedFrom = new Date(customFrom.includes("T") ? customFrom : `${customFrom}T00:00:00Z`);
        const parsedTo = new Date(customTo.includes("T") ? customTo : `${customTo}T23:59:59.999Z`);
        if (!isNaN(parsedFrom.getTime()) && !isNaN(parsedTo.getTime()) && parsedFrom <= parsedTo) {
          return {
            kind: "custom",
            from: parsedFrom,
            to: parsedTo,
            fromIso: parsedFrom.toISOString(),
            toIso: parsedTo.toISOString(),
            label: `${customFrom} – ${customTo}`,
            timezone: tz,
          };
        }
      }
      // fallback to today if custom range is invalid
      return {
        kind: "today",
        from: startOfToday,
        to: endOfToday,
        fromIso: startOfToday.toISOString(),
        toIso: endOfToday.toISOString(),
        label: "Today",
        timezone: tz,
      };
    }
    case "today":
    default: {
      return {
        kind: "today",
        from: startOfToday,
        to: endOfToday,
        fromIso: startOfToday.toISOString(),
        toIso: endOfToday.toISOString(),
        label: "Today",
        timezone: tz,
      };
    }
  }
}

/**
 * Extracts period parameters from URL search params.
 */
export function parsePeriodSearchParams(
  searchParams?: Record<string, string | string[] | undefined> | null
): PeriodValue {
  if (!searchParams) return { kind: "today" };

  const rawPeriod = typeof searchParams.period === "string" ? searchParams.period : undefined;
  const rawFrom = typeof searchParams.from === "string" ? searchParams.from : undefined;
  const rawTo = typeof searchParams.to === "string" ? searchParams.to : undefined;

  const validKinds: PeriodKind[] = ["today", "7d", "30d", "month", "custom"];
  const kind = validKinds.includes(rawPeriod as PeriodKind) ? (rawPeriod as PeriodKind) : "today";

  return {
    kind,
    from: rawFrom,
    to: rawTo,
  };
}
