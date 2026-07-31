import { supabase } from "@/lib/supabase";
import { escapePostgrestOrValue } from "@/lib/fundraiser-data";

export type EventListSort = "date_asc" | "date_desc" | "newest";

export type EventListParams = {
  /** Include filter — fetch a specific set (e.g. Trending's sales-ranked IDs). */
  ids?: string[];
  /** Exclusion filter — keep a section's picks out of another section (dedupe). */
  excludeIds?: string[];
  /** Single category (events use a fixed category set); matched case-insensitively. */
  category?: string;
  featuredOnly?: boolean;
  /** Limit to events dated now or later. */
  upcoming?: boolean;
  /** Inclusive ISO lower bound on `event_date` (e.g. the weekend filter start). */
  dateFrom?: string;
  /** Inclusive ISO upper bound on `event_date` (e.g. the weekend filter end). */
  dateTo?: string;
  /** Free-text title search. */
  searchQuery?: string;
  /** City/venue search — routed through the injection-safe escaped `.or()`. */
  location?: string;
  sort?: EventListSort;
  page?: number;
  pageSize?: number;
};

export type EventListItem = {
  id: string;
  slug: string;
  title: string;
  eventDate: string | null;
  city: string | null;
  venue: string | null;
  /** Raw banner URL — image normalization/fallback stays in EventCard. */
  banner: string | null;
  category: string | null;
  isFeatured: boolean;
  latitude: number | null;
  longitude: number | null;
  createdAt: string | null;
};

export type EventListResult = {
  events: EventListItem[];
  total: number;
};

type EventListRow = {
  id: string;
  slug: string | null;
  title: string;
  event_date: string | null;
  city: string | null;
  venue: string | null;
  banner: string | null;
  category: string | null;
  is_featured: boolean | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string | null;
};

const EVENT_LIST_COLUMNS =
  "id, slug, title, event_date, city, venue, banner, category, is_featured, latitude, longitude, created_at";

function mapEventRow(row: EventListRow): EventListItem {
  return {
    id: row.id,
    slug: row.slug ?? row.id,
    title: row.title,
    eventDate: row.event_date ?? null,
    city: row.city ?? null,
    venue: row.venue ?? null,
    banner: row.banner ?? null,
    category: row.category ?? null,
    isFeatured: row.is_featured === true,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    createdAt: row.created_at ?? null,
  };
}

/**
 * Shared browse/list query for the `/events` page — the single source of truth
 * for the Featured, Browse, and Trending sections (each just passes different
 * params), mirroring `getFundraiserList` on `/fundraisers`.
 *
 * Every query is pinned to public + approved events. Every sort adds `id` as a
 * secondary tie-breaker so rows can't shuffle/duplicate/skip across `.range()`
 * pages when the primary sort key ties (many events share a coarse `event_date`
 * or `created_at`). `excludeIds` lets one section keep another section's picks
 * out of its results, so the same event never renders in two sections at once.
 *
 * Local DB events only: `total` is the local count. External (Ticketmaster)
 * results are merged and paginated separately by the page — this leaves that
 * seam clean without solving it here.
 */
export async function getEventList(
  params: EventListParams = {}
): Promise<EventListResult> {
  const ids = params.ids;
  const excludeIds = params.excludeIds;
  const category = params.category;
  const featuredOnly = params.featuredOnly ?? false;
  const upcoming = params.upcoming ?? false;
  const dateFrom = params.dateFrom;
  const dateTo = params.dateTo;
  const searchQuery = params.searchQuery;
  const location = params.location;
  const sort = params.sort ?? "date_asc";
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 12;

  let query = supabase
    .from("events")
    .select(EVENT_LIST_COLUMNS, { count: "exact" })
    .eq("visibility", "public")
    .eq("status", "approved")
    .is("deleted_at", null);

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  }
  if (excludeIds && excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }
  if (category) {
    // Exact match, case-insensitive (events use a fixed category set) — no
    // wildcards, so it can't fuzzily bleed into adjacent category names.
    query = query.ilike("category", category);
  }
  if (featuredOnly) {
    query = query.eq("is_featured", true);
  }
  if (upcoming) {
    query = query.gte("event_date", new Date().toISOString());
  }
  if (dateFrom) {
    query = query.gte("event_date", dateFrom);
  }
  if (dateTo) {
    query = query.lte("event_date", dateTo);
  }
  if (searchQuery) {
    query = query.ilike("title", `%${searchQuery}%`);
  }
  if (location) {
    const safeLocation = escapePostgrestOrValue(location);
    query = query.or(
      `city.ilike."%${safeLocation}%",venue.ilike."%${safeLocation}%"`
    );
  }

  if (sort === "date_desc") {
    query = query.order("event_date", { ascending: false }).order("id", { ascending: true });
  } else if (sort === "newest") {
    query = query.order("created_at", { ascending: false }).order("id", { ascending: true });
  } else {
    query = query.order("event_date", { ascending: true }).order("id", { ascending: true });
  }

  const from = (page - 1) * pageSize;
  const { data, count } = await query.range(from, from + pageSize - 1);

  const rows = (data ?? []) as unknown as EventListRow[];
  return { events: rows.map(mapEventRow), total: count ?? 0 };
}
