import { Suspense } from "react";
import EventsHeroSearch from "@/app/events/EventsHeroSearch";
import EventsHero from "@/app/events/EventsHero";
import EventsCategoryIcons from "@/app/events/EventsCategoryIcons";
import EventsFilterHeader from "@/app/events/EventsFilterHeader";
import EventsResultsSection from "@/app/events/EventsResultsSection";
import TopDestinations from "@/components/events/TopDestinations";
import type { EventsPageFilters } from "@/lib/events-filters";

export type { EventsPageFilters };

// Fallback for EventsFilterHeader — matches its row height so resolving the
// visitor's location/filter state doesn't shift layout. Non-personalized
// "Events" text rather than a spinner, since this boundary resolves fast
// (a headers() read + cache hits) and rarely stays visible long enough for a
// generic heading to be noticeable.
function EventsFilterHeaderFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
          Events
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-11 w-48 animate-pulse rounded-full bg-zinc-100" />
          <div className="h-11 w-40 animate-pulse rounded-full bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}

// Fallback for EventsResultsSection — sized to the actual Trending/Discover
// More card-row shape (a 4-card grid, matching each carousel's xl:basis-1/4),
// not the old full-page loading.tsx skeleton, which no longer applies since
// hero/chips are now part of the instant static shell above this boundary.
function EventsResultsSkeleton() {
  const cardGrid = (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-zinc-100">
          <div className="aspect-video w-full animate-pulse bg-zinc-100" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <div className="mb-14">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-zinc-200" />
        {cardGrid}
      </div>
      <div className="rounded-3xl border-t-4 border-orange-600 bg-white p-6 shadow-sm ring-1 ring-zinc-100 sm:p-8">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-zinc-200" />
        {cardGrid}
      </div>
    </div>
  );
}

export default function EventsPageView({
  filters,
  forcedLocation,
  showTrendingEvents = false,
  showHero = false,
  showCategoryIcons = false,
}: {
  filters: Promise<EventsPageFilters>;
  /** Pins the location filter (from the /events/city/[citySlug] route) regardless of any `location` in `filters`. */
  forcedLocation?: string;
  /** Site-wide Trending rail — only makes sense unscoped by location, so it's opt-in (only /events passes true) rather than shown on city pages, where it would surface events unrelated to the city being viewed. */
  showTrendingEvents?: boolean;
  /** "Sell Tickets. Organize Event" image banner — homepage-only branding, not scoped to a city. */
  showHero?: boolean;
  /** Category chip row — browsing-entry-point UI that belongs on the homepage, not a city-scoped page. */
  showCategoryIcons?: boolean;
}) {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 pb-16">
      {/* ── Hero + Category chips: CMS/admin-managed, same for every visitor
          regardless of filters — cached, part of the instant static shell.
          Homepage-only (skipped on city pages). ── */}
      {showHero && <EventsHero />}

      {/* ── Search — extracted from the old dark hero into its own section;
          restyled for the light background it now sits on (wired to the same
          nav /search endpoint). ── */}
      <section className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <EventsHeroSearch />
      </section>

      {showCategoryIcons && <EventsCategoryIcons />}

      {/* ── Location-aware heading + Location/date filter bar — the one
          genuinely per-visitor piece (getVisitorCity() reads headers()),
          bundled with the filter bar since both need `filters` regardless. ── */}
      <Suspense fallback={<EventsFilterHeaderFallback />}>
        <EventsFilterHeader filters={filters} forcedLocation={forcedLocation} />
      </Suspense>

      {/* ── Featured This Week / Trending / Discover More / External results
          — the part of the page that actually depends on filters (search,
          category, location, date), so it can't be part of the static shell.
          EventsResultsSection owns the top half of the original combined
          div's padding (pt-8/pt-10); this wrapper owns the bottom half
          (pb-8/pb-10) for TopDestinations, which stays outside the Suspense
          boundary (static, no filter dependency) — total spacing matches
          the pre-decomposition single-div layout exactly. ── */}
      <Suspense fallback={<EventsResultsSkeleton />}>
        <EventsResultsSection
          filters={filters}
          forcedLocation={forcedLocation}
          showTrendingEvents={showTrendingEvents}
        />
      </Suspense>

      <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 sm:pb-10 lg:px-8">
        <TopDestinations />
      </div>
    </main>
  );
}
