import EventsLocationDateBar from "@/components/events/EventsLocationDateBar";
import { getCachedEventCities } from "@/lib/event-cities";
import { getVisitorCity } from "@/lib/request-geo";
import { resolveEventFilters, type EventsPageFilters } from "@/lib/events-filters";

/**
 * Location-aware heading + Location/date filter bar — the one piece of
 * /events that's genuinely per-visitor: `getVisitorCity()` calls `headers()`
 * directly. Everything here depends on `filters` (itself a request-time read
 * under Cache Components, same category as headers()/cookies()), so heading
 * and filter bar are bundled into one boundary rather than split further —
 * splitting wouldn't remove either one's dependency on filters.
 */
export default async function EventsFilterHeader({
  filters,
  forcedLocation,
}: {
  filters: Promise<EventsPageFilters>;
  forcedLocation?: string;
}) {
  const resolved = resolveEventFilters(await filters, forcedLocation);
  const { location, activeWhen, customFrom, customTo } = resolved;

  // Location-aware heading: tracks whatever the person actually searched for
  // (the `location` filter, or the forced city on a city route) first, and
  // only falls back to the visitor's IP/edge-detected city when nothing has
  // been searched.
  const visitorCity = await getVisitorCity();
  const displayLocation = location || visitorCity;
  const locationHeading = displayLocation ? `Events in ${displayLocation}` : "Events";

  // City suggestions for the Location autocomplete (cleaned + deduped).
  const eventCities = await getCachedEventCities();

  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-6 lg:px-8">
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
  );
}
