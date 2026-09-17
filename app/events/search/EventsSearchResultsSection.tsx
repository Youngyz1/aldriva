import Link from "next/link";
import { Search } from "lucide-react";
import EventCard from "@/components/EventCard";
import ExternalEventsCarousel from "@/components/events/ExternalEventsCarousel";
import DiscoverMoreCarousel, {
  type DiscoverMoreItem,
} from "@/app/events/DiscoverMoreCarousel";
import PublicEmptyState from "@/components/public/PublicEmptyState";
import { getEventList, type EventListItem } from "@/lib/event-data";
import { searchExternalEvents, type ExternalEvent } from "@/lib/external-events";
import EventsHeroSearch from "@/app/events/EventsHeroSearch";

export function EventsSearchResultsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-6 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="aspect-video w-full animate-pulse bg-zinc-100" />
            <div className="space-y-2.5 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(date: string | null | undefined) {
  if (!date) return "Date TBA";
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "Date TBA";
  return value.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default async function EventsSearchResultsSection({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    location?: string;
    category?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const { q, location, category, sort } = await searchParams;
  const query = q?.trim() || "";

  // 1. Domain-isolated query: touches only events table + external live events API
  const [localResults, externalEvents] = await Promise.all([
    query || location || category
      ? getEventList({
          searchQuery: query || undefined,
          location: location || undefined,
          category: category || undefined,
          sort: sort === "newest" || sort === "date_desc" ? sort : "date_asc",
          pageSize: 24,
        })
      : Promise.resolve({ events: [] as EventListItem[], total: 0 }),
    query
      ? searchExternalEvents({ query, location: location || undefined }).catch(() => [] as ExternalEvent[])
      : Promise.resolve([] as ExternalEvent[]),
  ]);

  const localEvents = localResults.events;
  const totalResultsCount = localEvents.length + externalEvents.length;
  const hasResults = totalResultsCount > 0;

  // 2. Empty state fallback: fetch curated/upcoming events for discovery
  let fallbackDiscoverItems: DiscoverMoreItem[] = [];
  if (!hasResults) {
    const { events: fallbackEvents } = await getEventList({
      upcoming: true,
      sort: "date_asc",
      pageSize: 16,
    });
    fallbackDiscoverItems = fallbackEvents.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      eventDate: e.eventDate,
      city: e.city,
      banner: e.banner,
      category: e.category,
    }));
  }

  if (!query && !location && !category) {
    return (
      <div className="space-y-8">
        <div className="max-w-2xl">
          <EventsHeroSearch defaultQuery={query} />
        </div>
        <div className="py-6">
          <PublicEmptyState
            icon={<Search className="h-8 w-8 text-zinc-400" />}
            title="Search all events"
            description="Enter an event name, artist, venue, or city in the search bar above."
            action={{ label: "Browse all events", href: "/events" }}
          />
        </div>
      </div>
    );
  }

  if (!hasResults) {
    return (
      <div className="space-y-12">
        <div className="max-w-2xl">
          <EventsHeroSearch defaultQuery={query} />
        </div>
        <div className="py-4">
          <PublicEmptyState
            icon={<Search className="h-8 w-8 text-zinc-400" />}
            title={`No events found for "${query || location || category}"`}
            description="Try checking for spelling errors, using more general keywords, or browse popular upcoming events below."
            action={{ label: "Browse all events", href: "/events" }}
          />
        </div>

        {fallbackDiscoverItems.length > 0 && (
          <div className="border-t border-zinc-200 pt-10">
            <h2 className="mb-6 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
              Discover Popular Events
            </h2>
            <DiscoverMoreCarousel items={fallbackDiscoverItems} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <div className="max-w-2xl">
        <EventsHeroSearch defaultQuery={query} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <p className="text-sm font-semibold text-zinc-500">
            Showing <span className="font-bold text-zinc-900">{totalResultsCount}</span> {totalResultsCount === 1 ? "result" : "results"}
            {query && (
              <>
                {" "}for <span className="font-bold text-zinc-900">&ldquo;{query}&rdquo;</span>
              </>
            )}
            {location && (
              <>
                {" "}in <span className="font-bold text-zinc-900">{location}</span>
              </>
            )}
          </p>
        </div>
        <Link
          href="/events"
          className="text-xs font-bold text-orange-600 transition hover:text-orange-700 sm:text-sm"
        >
          ← Back to all events
        </Link>
      </div>

      {localEvents.length > 0 && (
        <section>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {localEvents.map((event) => (
              <EventCard
                key={event.id}
                slug={event.slug}
                title={event.title}
                date={formatDate(event.eventDate)}
                eventDate={event.eventDate}
                location={event.city || event.venue || "Location TBA"}
                image={event.banner || ""}
                category={event.category}
              />
            ))}
          </div>
        </section>
      )}

      {externalEvents.length > 0 && (
        <section className="border-t border-zinc-200 pt-10">
          <ExternalEventsCarousel events={externalEvents} />
        </section>
      )}
    </div>
  );
}
