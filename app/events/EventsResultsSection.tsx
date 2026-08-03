import TrendingCarousel from "@/app/events/TrendingCarousel";
import DiscoverMoreCarousel from "@/app/events/DiscoverMoreCarousel";
import ExternalEventsCarousel from "@/components/events/ExternalEventsCarousel";
import PublicEmptyState from "@/components/public/PublicEmptyState";
import FeaturedSlider, { type FeaturedSliderItem } from "@/components/FeaturedSlider";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getEventList,
  type EventListItem,
  type EventListSort,
} from "@/lib/event-data";
import {
  searchExternalEvents,
  type ExternalEvent,
} from "@/lib/external-events";
import { resolveEventFilters, type EventsPageFilters } from "@/lib/events-filters";
import { cacheLife } from "next/cache";

const getCachedTrendingRankedEventIds = async () => {
  "use cache";
  cacheLife({ revalidate: 600 });

  const adminClient = createSupabaseAdmin();
  const { data: ticketSalesForTrending } = await adminClient
    .from("ticket_orders")
    .select("event_id, quantity")
    .in("status", ["valid", "used"]);

  const salesMap: Record<string, number> = {};
  for (const sale of ticketSalesForTrending ?? []) {
    if (sale.event_id) {
      salesMap[sale.event_id] = (salesMap[sale.event_id] || 0) + (sale.quantity || 0);
    }
  }

  // Event IDs ranked by all-time ticket sales (descending). Only the
  // (expensive) sales aggregation is cached — the event rows are fetched
  // per-request via getEventList so Trending can be filtered to upcoming-only
  // and de-duplicated against Featured/Browse.
  return Object.keys(salesMap).sort((a, b) => salesMap[b] - salesMap[a]);
};

// Ticketmaster/SeatGeek results blend into every /events view (not just
// active searches). `'use cache'` here is a separate caching layer from the
// `next: { revalidate }` already set inside searchTicketmaster/searchSeatGeek
// (see lib/external-events.ts) — keyed automatically by its arguments, so
// each distinct location/query/category/dates combination gets its own
// 20-minute-cached entry regardless of how many visitors hit it.
//
// The date fan-out lives INSIDE this one cached function (one call site, one
// cache entry per resolved filter set) rather than the caller doing
// Promise.all across N separate calls to this function — a call-site
// restructure only, same combined/flattened result as before.
const getCachedExternalEvents = async (params: {
  query?: string;
  location?: string;
  category?: string;
  dates: (string | null)[];
}) => {
  "use cache";
  cacheLife({ revalidate: 1200 });
  const { dates, ...rest } = params;
  const responses = await Promise.all(
    dates.map((date) => searchExternalEvents({ ...rest, date }))
  );
  return responses.flat();
};

// "Discover More" is a single continuous Embla rail (see DiscoverMoreCarousel),
// not a paginated grid — one over-fetched batch replaces the old page-number
// pagination, capped well above what fits on screen so Prev/Next has real
// room to scroll through, same idea as Trending's own 60-row over-fetch below.
const DISCOVER_MORE_PAGE_SIZE = 60;

const normalizeTitle = (title: string) => title.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Featured Slider + Trending + Discover More + External events — the part of
 * /events (and /events/city/[citySlug]) that actually depends on filters, so
 * it can't be part of the static shell. Internal logic is unchanged from the
 * pre-decomposition EventsPageView — only relocated here, one Suspense
 * boundary below the (also-dynamic) EventsFilterHeader.
 */
export default async function EventsResultsSection({
  filters,
  forcedLocation,
  showTrendingEvents,
}: {
  filters: Promise<EventsPageFilters>;
  forcedLocation?: string;
  showTrendingEvents: boolean;
}) {
  const { query, location, category, sort, dateRange, hasFilters } = resolveEventFilters(
    await filters,
    forcedLocation
  );

  // 1. Featured events — upcoming featured picks, shown only when browsing
  //    without filters. `upcoming: true` keeps past events out of the most
  //    prominent slot. Over-fetch, then dedupe by title to 4.
  const featuredRaw: EventListItem[] = !hasFilters
    ? (await getEventList({ featuredOnly: true, upcoming: true, sort: "date_asc", pageSize: 16 })).events
    : [];
  const featured: EventListItem[] = [];
  const seenFeaturedTitles = new Set<string>();
  for (const event of featuredRaw) {
    const key = normalizeTitle(event.title);
    if (seenFeaturedTitles.has(key)) continue;
    seenFeaturedTitles.add(key);
    featured.push(event);
    if (featured.length >= 4) break;
  }

  // Featured This Week slider items — same featured picks as above, mapped to
  // FeaturedSlider's shape. Events-only (FeaturedSlider doesn't query data
  // itself; it just renders whatever `items` it's given, so no "mixed vs
  // events" prop was needed — the homepage passes events+fundraisers, this
  // page passes events only).
  const featuredSliderItems: FeaturedSliderItem[] = featured.map((event) => ({
    type: "event" as const,
    id: event.id,
    title: event.title,
    slug: event.slug,
    date: event.eventDate,
    location: event.city || event.venue || undefined,
    image_url: event.banner,
    category: event.category,
  }));

  // 2. Trending events — moved ahead of Browse so Browse can exclude
  //    Trending's final picks below. Site-wide, ranked by all-time ticket
  //    sales, topped up with the most recently added events. Deduped by BOTH
  //    id and normalized title, and excluded (id + title) against Featured so
  //    the same event can't sit in both prominent rails.
  //    Skipped entirely on city pages (showTrendingEvents=false) — the ranking
  //    is unscoped by location, so it would surface events unrelated to
  //    whatever city is being viewed. `trendingItems` stays `[]` in that case,
  //    so Browse's exclusion below is a no-op rather than a special case.
  const TRENDING_TARGET = 12;
  let trendingItems: {
    id: string;
    slug: string;
    title: string;
    eventDate: string | null;
    city: string | null;
    venue: string | null;
    banner: string | null;
    category: string | null;
  }[] = [];

  if (showTrendingEvents) {
    const rankedEventIds = await getCachedTrendingRankedEventIds();

    const excludeTrendingIds = new Set<string>(featured.map((e) => e.id));
    const excludeTrendingTitles = new Set<string>(
      featured.map((e) => normalizeTitle(e.title))
    );

    const trendingEvents: EventListItem[] = [];
    const seenTrendingTitles = new Set<string>();
    const addTrending = (candidates: EventListItem[]) => {
      for (const event of candidates) {
        if (trendingEvents.length >= TRENDING_TARGET) break;
        const titleKey = normalizeTitle(event.title);
        if (excludeTrendingIds.has(event.id)) continue;
        if (excludeTrendingTitles.has(titleKey) || seenTrendingTitles.has(titleKey)) continue;
        seenTrendingTitles.add(titleKey);
        trendingEvents.push(event);
      }
    };

    if (rankedEventIds.length > 0) {
      const { events: rankedEvents } = await getEventList({
        ids: rankedEventIds.slice(0, 60),
        pageSize: 60,
      });
      // `.in(...)` doesn't preserve order, so re-rank by ticket sales.
      const byId = new Map(rankedEvents.map((e) => [e.id, e]));
      addTrending(
        rankedEventIds
          .map((id) => byId.get(id))
          .filter((e): e is EventListItem => Boolean(e))
      );
    }
    if (trendingEvents.length < TRENDING_TARGET) {
      // Over-fetch (title-dedupe shrinks the set) to fill remaining slots with
      // the most recently added events.
      const { events: fallback } = await getEventList({
        excludeIds: [...excludeTrendingIds, ...trendingEvents.map((e) => e.id)],
        sort: "newest",
        pageSize: TRENDING_TARGET * 4,
      });
      addTrending(fallback);
    }

    trendingItems = trendingEvents.map((event) => ({
      id: event.id,
      slug: event.slug,
      title: event.title,
      eventDate: event.eventDate,
      city: event.city,
      venue: event.venue,
      banner: event.banner,
      category: event.category,
    }));
  }

  // 3. Discover More rail — the shared list query, excluding the Featured and
  //    Trending picks (by id) so the same event never renders in more than
  //    one section. A single over-fetched batch (DISCOVER_MORE_PAGE_SIZE)
  //    rather than a page slice — DiscoverMoreCarousel renders it as one
  //    continuous Embla rail, same shape as Trending's own over-fetch above.
  const sortParam: EventListSort =
    sort === "date_desc" || sort === "newest" ? sort : "date_asc";
  const { events: browseEvents } = await getEventList({
    category,
    searchQuery: query,
    location,
    dateFrom: dateRange ? `${dateRange.start}T00:00:00` : undefined,
    dateTo: dateRange ? `${dateRange.end}T23:59:59` : undefined,
    excludeIds: [...featured.map((e) => e.id), ...trendingItems.map((e) => e.id)],
    sort: sortParam,
    pageSize: DISCOVER_MORE_PAGE_SIZE,
  });

  // 4. Fetch external events (Ticketmaster + SeatGeek, live). `ExternalEvent`
  //    is imported from lib/external-events — the shared multi-source module.
  type LocalEvent = {
    id: string;
    slug: string;
    title: string;
    event_date: string | null;
    city: string | null;
    banner: string | null;
    category: string | null;
    latitude: number | null;
    longitude: number | null;
    url: null;
    source: "local";
  };

  // Call the multi-source lib directly (server-to-server) rather than
  // self-fetching /api/eventbrite — an SSR self-fetch returns empty in dev and
  // adds a needless HTTP hop. Caching + rate-limit handling live in the lib.
  //
  // No `location` (the default, unfiltered view) is a deliberate nationwide
  // query, not a skipped one — Ticketmaster falls back to countryCode: "US"
  // and SeatGeek omits venue.city — kept to a single shared cache entry
  // rather than a visitor-geolocated default, which would multiply cache
  // keys per visitor IP and undercut the rate-limit safety margin.
  const datesToFetch = dateRange?.dates ?? [null];
  const externalEvents: ExternalEvent[] = await getCachedExternalEvents({
    query,
    location,
    category,
    dates: datesToFetch,
  });

  const supabaseNormalized: LocalEvent[] = browseEvents.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    event_date: e.eventDate,
    city: e.city ?? e.venue ?? null,
    banner: e.banner,
    category: e.category,
    latitude: e.latitude,
    longitude: e.longitude,
    url: null,
    source: "local",
  }));

  // External (Ticketmaster + SeatGeek) results render in their own section, not
  // merged into the paginated local grid. Drop any that duplicate a local result
  // on this page (or each other) by title+date, then cap the block at 20 —
  // still within each source's own DEFAULT_SIZE (20) fetch, so this only
  // changes how much of the already-fetched data is shown, not how much is
  // requested upstream.
  const eventKey = (e: { title: string; event_date?: string | null }) =>
    `${e.title.toLowerCase().trim()}-${e.event_date || ""}`;
  const seenEventKeys = new Set<string>(supabaseNormalized.map(eventKey));
  const externalResults: ExternalEvent[] = [];
  for (const event of externalEvents) {
    const key = eventKey(event);
    if (seenEventKeys.has(key)) continue;
    seenEventKeys.add(key);
    externalResults.push(event);
    if (externalResults.length >= 20) break;
  }

  // When a search matches 0 local events but external results exist, the filter
  // sidebar (When / Category / Sort) has nothing to act on — those filters only
  // apply to Aldriva events. Drop it so the "no local matches" note and the
  // external results section use the full width instead of sitting next to a
  // tall, irrelevant sidebar.
  const hideEventsSidebar =
    supabaseNormalized.length === 0 && externalResults.length > 0;

  return (
    <>
      {/* ── Featured This Week — replaces the old "Featured Experiences" grid
          in the same slot, styled after the homepage's slider section, events
          only (same featured picks as before, rendered as a slider instead of
          a grid). ── */}
      {!hasFilters && featuredSliderItems.length > 0 && (
        <section className="bg-white py-7 sm:py-10">
          <div className="mx-auto mb-3 flex max-w-7xl items-center justify-between px-3 sm:mb-5 sm:px-6 lg:px-8">
            <p className="text-xs font-black uppercase tracking-widest text-orange-600 sm:text-xs">
              Featured This Week
            </p>
          </div>
          <FeaturedSlider items={featuredSliderItems} />
        </section>
      )}

      {/* ── Trending/Discover-More/External container — same max-w-7xl box
          the original single div used, split so TopDestinations (static, no
          filter dependency) can render in the shell right after this
          Suspense boundary instead of inside it. This div only carries the
          top half of the original's padding (pt-8/pt-10); EventsPageView's
          wrapper around TopDestinations carries the matching bottom half
          (pb-8/pb-10), so the total spacing is identical to before the
          split — just divided at the boundary between dynamic and static. ── */}
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        {/* ── Trending Events — moved out of the old dark hero; light-mode
            styling now that it sits on the page's bg-zinc-50 background
            (onDark defaults to false). ── */}
        {trendingItems.length > 0 && (
          <div className="mb-14">
            <TrendingCarousel items={trendingItems} />
          </div>
        )}

        {/* ── Discover More — a sliding Embla rail (DiscoverMoreCarousel),
            same shared carousel infrastructure as Trending Events above it,
            inside a white rounded-card treatment with a coral top accent so
            it still reads as a clearly separate section from Trending rather
            than an unlabeled continuation of the same block. Renders the
            default getEventList query; default sort is date_asc — soonest
            event date first (id as tie-breaker). ── */}
        {!hideEventsSidebar && (
          <div className="rounded-3xl border-t-4 border-orange-600 bg-white p-6 shadow-sm ring-1 ring-zinc-100 sm:p-8">
            {supabaseNormalized.length > 0 ? (
              <DiscoverMoreCarousel
                items={supabaseNormalized.map((event) => ({
                  id: event.id,
                  slug: event.slug,
                  title: event.title,
                  eventDate: event.event_date,
                  city: event.city,
                  banner: event.banner,
                  category: event.category,
                }))}
              />
            ) : (
              <>
                <h3 className="mb-6 text-2xl font-black text-zinc-950 sm:text-3xl">
                  Discover More
                </h3>
                <PublicEmptyState
                  icon="🎭"
                  title="No events found"
                  description="Try another location or date range."
                  action={{ label: "Create event", href: "/create-event" }}
                />
              </>
            )}
          </div>
        )}

        {/* ── Live external results (Ticketmaster + SeatGeek) ── */}
        {externalResults.length > 0 && (
          // When there are no local results the carousel is the primary content,
          // so keep it tight under the header; when it follows Discover More,
          // give it more breathing room to read as a distinct section.
          <section className={hideEventsSidebar ? "mt-4" : "mt-14"}>
            <ExternalEventsCarousel events={externalResults} />
          </section>
        )}
      </div>
    </>
  );
}
