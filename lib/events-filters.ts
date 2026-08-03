import type { WhenValue } from "@/components/events/EventsLocationDateBar";

export type EventsPageFilters = {
  q?: string;
  location?: string;
  category?: string;
  when?: string;
  from?: string;
  to?: string;
  sort?: string;
};

export type EventsDateRange = { start: string; end: string; dates: string[] };

export type ResolvedEventFilters = {
  query?: string;
  location?: string;
  category?: string;
  customFrom?: string;
  customTo?: string;
  sort: string;
  activeWhen: WhenValue;
  dateRange: EventsDateRange | null;
  hasFilters: boolean;
};

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayRange(): EventsDateRange {
  const key = formatDateKey(new Date());
  return { start: key, end: key, dates: [key] };
}

function getTomorrowRange(): EventsDateRange {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const key = formatDateKey(d);
  return { start: key, end: key, dates: [key] };
}

function getWeekendRange(): EventsDateRange {
  const now = new Date();
  const day = now.getDay();
  const daysUntilSaturday = day === 0 ? -1 : (6 - day + 7) % 7;
  const saturday = new Date(now);
  saturday.setHours(0, 0, 0, 0);
  saturday.setDate(now.getDate() + daysUntilSaturday);

  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  sunday.setHours(23, 59, 59, 999);

  return {
    start: formatDateKey(saturday),
    end: formatDateKey(sunday),
    dates: [formatDateKey(saturday), formatDateKey(sunday)],
  };
}

function getNextWeekendRange(): EventsDateRange {
  const now = new Date();
  const day = now.getDay();
  const daysUntilThisSaturday = day === 0 ? -1 : (6 - day + 7) % 7;
  const nextSaturday = new Date(now);
  nextSaturday.setHours(0, 0, 0, 0);
  nextSaturday.setDate(now.getDate() + daysUntilThisSaturday + 7);

  const nextSunday = new Date(nextSaturday);
  nextSunday.setDate(nextSaturday.getDate() + 1);
  nextSunday.setHours(23, 59, 59, 999);

  return {
    start: formatDateKey(nextSaturday),
    end: formatDateKey(nextSunday),
    dates: [formatDateKey(nextSaturday), formatDateKey(nextSunday)],
  };
}

// Enumerates individual day keys between start/end (inclusive), capped so a
// wide custom calendar range can't blow the external-API fetch budget — the
// local Supabase query still uses the full start/end bound regardless.
function enumerateDates(start: string, end: string, maxDays = 7): string[] {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const dates: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate && dates.length < maxDays) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * Single canonical resolver for /events + /events/city/[citySlug] filter
 * state — shared by EventsFilterHeader and EventsResultsSection (each awaits
 * its own copy of the `filters` prop under Cache Components, since reading
 * searchParams is itself a request-time operation that has to happen inside
 * a Suspense boundary) so the two never drift on what counts as "filtered".
 */
export function resolveEventFilters(
  filters: EventsPageFilters,
  forcedLocation?: string
): ResolvedEventFilters {
  const query = filters.q?.trim();
  const location = forcedLocation ?? filters.location?.trim();
  const category = filters.category?.trim();
  const customFrom = filters.from?.trim();
  const customTo = filters.to?.trim();
  const sort = filters.sort || "date_asc";

  const activeWhen: WhenValue = customFrom
    ? "custom"
    : filters.when === "today" ||
      filters.when === "tomorrow" ||
      filters.when === "weekend" ||
      filters.when === "next_weekend"
    ? filters.when
    : "all";

  const dateRange =
    activeWhen === "custom"
      ? {
          start: customFrom!,
          end: customTo || customFrom!,
          dates: enumerateDates(customFrom!, customTo || customFrom!),
        }
      : activeWhen === "today"
      ? getTodayRange()
      : activeWhen === "tomorrow"
      ? getTomorrowRange()
      : activeWhen === "weekend"
      ? getWeekendRange()
      : activeWhen === "next_weekend"
      ? getNextWeekendRange()
      : null;

  const hasFilters = Boolean(query || location || category || dateRange);

  return { query, location, category, customFrom, customTo, sort, activeWhen, dateRange, hasFilters };
}
