import EventsHeroSearch from "@/app/events/EventsHeroSearch";
import TrendingCarousel from "@/app/events/TrendingCarousel";
import DiscoverMoreCarousel from "@/app/events/DiscoverMoreCarousel";
import TopDestinations from "@/components/events/TopDestinations";
import ExternalEventsCarousel from "@/components/events/ExternalEventsCarousel";
import EventsLocationDateBar, { type WhenValue } from "@/components/events/EventsLocationDateBar";
import PublicEmptyState from "@/components/public/PublicEmptyState";
import CategoryGrid from "@/components/CategoryGrid";
import FeaturedSlider, { type FeaturedSliderItem } from "@/components/FeaturedSlider";
import { getCategoryChips } from "@/lib/category-chips";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { HOMEPAGE_SETTING_KEYS, getHomepageSettings } from "@/lib/homepage-hero";
import { getCachedEventCities } from "@/lib/event-cities";
import {
  getEventList,
  type EventListItem,
  type EventListSort,
} from "@/lib/event-data";
import {
  searchExternalEvents,
  type ExternalEvent,
  type ExternalSearchParams,
} from "@/lib/external-events";
import { getVisitorCity } from "@/lib/request-geo";
import Link from "next/link";
import { unstable_cache } from "next/cache";

// ---------------------------------------------------------------------------
// Cached data fetchers for events listing page — shared by both /events and
// /events/city/[citySlug], since both routes render through EventsPageView.
// ---------------------------------------------------------------------------

const getEventsPageCmsAndStats = unstable_cache(
  async () => {
    const adminClient = createSupabaseAdmin();
    const [
      { data: cmsRows },
      { count: totalEventsCount },
      { data: ticketSalesData },
      { count: activeOrganizersCount }
    ] = await Promise.all([
      adminClient.from("platform_settings").select("key, value").in("key", HOMEPAGE_SETTING_KEYS),
      adminClient.from("events").select("id", { count: "exact", head: true }).eq("visibility", "public").eq("status", "approved"),
      adminClient.from("ticket_orders").select("quantity").in("status", ["valid", "used"]),
      adminClient.from("organizers").select("id", { count: "exact", head: true }).eq("visibility", "public")
    ]);

    const cms = getHomepageSettings(cmsRows);
    const totalEvents = totalEventsCount ?? 0;
    const ticketsSold = ticketSalesData?.reduce((sum, order) => sum + (order.quantity || 0), 0) || 0;
    const activeOrganizers = activeOrganizersCount ?? 0;

    return { cms, totalEvents, ticketsSold, activeOrganizers };
  },
  ["events-page-cms-and-stats"],
  { revalidate: 300 }
);

const getCachedTrendingRankedEventIds = unstable_cache(
  async () => {
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
  },
  ["events-page-trending-ranked-ids"],
  { revalidate: 600 }
);

// Ticketmaster/SeatGeek results now blend into every /events view (not just
// active searches), so this is no longer occasional traffic. `dynamic =
// "force-dynamic"` (set on both app/events/page.tsx and
// app/events/city/[citySlug]/page.tsx) makes every `fetch()` in these routes
// equivalent to `{ cache: "no-store" }` (see node_modules/next/dist/docs/
// 01-app/02-guides/caching-without-cache-components.md) — that silently
// defeats the `next: { revalidate: 300 }` set inside searchTicketmaster/
// searchSeatGeek. unstable_cache is a separate caching layer unaffected by
// that override (same reason the caches above exist), keyed automatically by
// its arguments, so each distinct location/query/category/date combination
// gets its own 20-minute-cached entry regardless of how many visitors hit it.
const getCachedExternalEvents = unstable_cache(
  async (params: ExternalSearchParams) => searchExternalEvents(params),
  ["events-page-external-search"],
  { revalidate: 1200 }
);

// "Discover More" is a single continuous Embla rail (see DiscoverMoreCarousel),
// not a paginated grid — one over-fetched batch replaces the old page-number
// pagination, capped well above what fits on screen so Prev/Next has real
// room to scroll through, same idea as Trending's own 60-row over-fetch above.
const DISCOVER_MORE_PAGE_SIZE = 60;

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayRange() {
  const key = formatDateKey(new Date());
  return { start: key, end: key, dates: [key] };
}

function getTomorrowRange() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const key = formatDateKey(d);
  return { start: key, end: key, dates: [key] };
}

function getWeekendRange() {
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

function getNextWeekendRange() {
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

export type EventsPageFilters = {
  q?: string;
  location?: string;
  category?: string;
  when?: string;
  from?: string;
  to?: string;
  sort?: string;
};

export default async function EventsPageView({
  filters,
  forcedLocation,
  showTrendingEvents = false,
  showHero = false,
  showCategoryIcons = false,
}: {
  filters: EventsPageFilters;
  /** Pins the location filter (from the /events/city/[citySlug] route) regardless of any `location` in `filters`. */
  forcedLocation?: string;
  /** Site-wide Trending rail — only makes sense unscoped by location, so it's opt-in (only /events passes true) rather than shown on city pages, where it would surface events unrelated to the city being viewed. */
  showTrendingEvents?: boolean;
  /** "Sell Tickets. Organize Event" image banner — homepage-only branding, not scoped to a city. */
  showHero?: boolean;
  /** Category chip row — browsing-entry-point UI that belongs on the homepage, not a city-scoped page. */
  showCategoryIcons?: boolean;
}) {
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

  // 1. Fetch CMS settings (via cached helper; the hero stats row was removed).
  //    Skipped on city pages (showHero=false) — the hero is homepage-only branding.
  const cms = showHero ? (await getEventsPageCmsAndStats()).cms : null;

  // Category chip grid — shared with the homepage (lib/category-chips). Skipped
  // on city pages (showCategoryIcons=false).
  const categories = showCategoryIcons ? await getCategoryChips() : [];

  // Recurring events are stored as many separate rows sharing one title (e.g.
  // "30-Day Financial Glow-Up" has 19 monthly occurrences). Collapse them to a
  // single card per title so the same event can't appear twice in a rail.
  const normalizeTitle = (title: string) => title.toLowerCase().replace(/\s+/g, " ").trim();

  // Location-aware heading below the hero: tracks whatever the person actually
  // searched for (the `location` filter, or the forced city on a city route)
  // first, and only falls back to the visitor's IP/edge-detected city when
  // nothing has been searched.
  const visitorCity = await getVisitorCity();
  const displayLocation = location || visitorCity;
  const locationHeading = displayLocation ? `Events in ${displayLocation}` : "Events";

  // City suggestions for the Location autocomplete (cleaned + deduped).
  const eventCities = await getCachedEventCities();

  // 2. Featured events (step 2) — upcoming featured picks, shown only when
  //    browsing without filters. `upcoming: true` keeps past events out of the
  //    most prominent slot. Over-fetch, then dedupe by title to 4.
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

  // 3. Trending events (step 3) — moved ahead of Browse so Browse can exclude
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

  // 4. Discover More rail (step 4) — the shared list query, excluding the
  //    Featured and Trending picks (by id) so the same event never renders in
  //    more than one section. A single over-fetched batch (DISCOVER_MORE_PAGE_SIZE)
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

  // 5. Fetch external events (Ticketmaster + SeatGeek, live). `ExternalEvent`
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
  // Blended on every /events view now, not just active searches. Discover
  // More no longer paginates (it's a single carousel batch, see
  // DISCOVER_MORE_PAGE_SIZE above), so there's no "later page" to skip this
  // fetch on anymore — it always runs once per view. No `location` (the
  // default, unfiltered view) is a deliberate nationwide query, not a skipped
  // one — Ticketmaster falls back to countryCode: "US" and SeatGeek omits
  // venue.city — kept to a single shared cache entry rather than a
  // visitor-geolocated default, which would multiply cache keys per visitor
  // IP and undercut the rate-limit safety margin below.
  const datesToFetch = dateRange?.dates ?? [null];
  const responses = await Promise.all(
    datesToFetch.map((eventDate) =>
      getCachedExternalEvents({ query, location, category, date: eventDate })
    )
  );
  const externalEvents: ExternalEvent[] = responses.flat();

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
    <main className="min-h-screen bg-zinc-50 text-zinc-950 pb-16">
      {/* ── Hero: image banner + gradient overlay + headline + CTAs, styled
          after the homepage hero (app/page.tsx), with events-relevant CMS
          copy and events-relevant CTAs. Homepage-only branding — skipped on
          city pages (showHero=false). ── */}
      {showHero && cms && (
        <section className="bg-white px-3 pt-3 sm:px-6 sm:pt-6 lg:px-8">
          <div
            className="relative mx-auto flex aspect-[4/3] max-w-7xl items-end overflow-hidden rounded-xl bg-cover bg-center px-4 py-6 sm:aspect-[16/7] sm:items-center sm:rounded-sm sm:px-12 sm:py-16 lg:aspect-[16/5] lg:rounded-b-lg lg:px-20"
            style={{
              backgroundImage: `url("${cms.eventsHeroImageUrl.replaceAll('"', "")}")`,
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/10 sm:from-black/85 sm:via-black/48 sm:to-black/15" />
            <div className="relative w-full max-w-full sm:max-w-3xl">
              <p className="text-xs font-black uppercase tracking-wide text-white drop-shadow sm:text-sm">
                {cms.eventsHeroEyebrow}
              </p>
              <h1 className="mt-2 max-w-full text-2xl font-black leading-[1.1] tracking-tight text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.65)] sm:mt-3 sm:text-4xl md:text-5xl lg:text-6xl">
                {cms.eventsHeroHeadlineLine1}
                {cms.eventsHeroHeadlineLine2 && (
                  <>
                    <br />
                    <span className="text-orange-400">{cms.eventsHeroHeadlineLine2}</span>
                  </>
                )}
              </h1>
              <div className="relative z-10 mt-4 flex flex-wrap gap-3 sm:mt-6">
                <Link
                  href="/events"
                  className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-orange-50 sm:px-7 sm:py-3 sm:text-base shadow-lg shadow-black/20"
                >
                  Browse Events
                </Link>
                <Link
                  href="/create-event"
                  className="inline-flex rounded-full border border-white/80 bg-white/10 px-5 py-2.5 text-sm font-black text-white backdrop-blur transition hover:bg-white/20 sm:px-7 sm:py-3 sm:text-base"
                >
                  Create Event
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Search — extracted from the old dark hero into its own section;
          restyled for the light background it now sits on (wired to the same
          nav /search endpoint). ── */}
      <section className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <EventsHeroSearch />
      </section>

      {/* ── Category chip grid — shared with the homepage (components/CategoryGrid).
          Homepage-only browsing entry point — skipped on city pages (showCategoryIcons=false). ── */}
      {showCategoryIcons && (
        <section className="bg-white px-3 sm:px-6 lg:px-8">
          <CategoryGrid categories={categories} />
        </section>
      )}

      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-6 lg:px-8">
        {/* Location-aware heading (left, tracks the searched location, falling
            back to visitor IP/city) + Location + date filter bar (right). */}
        <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
            {locationHeading}
          </h2>
          <EventsLocationDateBar
            initialLocation={location ?? ""}
            initialWhen={activeWhen}
            initialFrom={customFrom}
            initialTo={customTo}
            citySuggestions={eventCities}
          />
        </div>
      </div>

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

      <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 sm:pb-10 sm:pt-10 lg:px-8">
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

        {/* ── Top Destinations (explore by city; below the results) ── */}
        <TopDestinations />
      </div>
    </main>
  );
}
