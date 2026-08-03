import { CURATED_DESTINATIONS } from "@/lib/curated-destinations";
import { getCachedEventCities } from "@/lib/event-cities";
import { slugifyCity } from "@/lib/city-slug";

/**
 * Resolves an /events/city/[citySlug] URL segment back to the exact city
 * name to filter/display with. Checks the curated destinations list first
 * (fixed, known capitalization), then falls back to real city values pulled
 * from approved events (same source that powers the location autocomplete) —
 * this avoids lossily reconstructing punctuated names (e.g. "Hamilton
 * Township, NJ") from a naive hyphen-to-space conversion, which would break
 * the `ilike` substring match in getEventList.
 *
 * Never returns null: an unrecognized slug (no curated match, no event in
 * that city yet) falls back to a best-effort title-cased name built from the
 * slug itself, so the route still renders — same "no events found" empty
 * state you'd get from /events?location=<anything-with-zero-matches> today,
 * rather than a 404 for a city that simply doesn't have events yet.
 */
export async function resolveCitySlugName(citySlug: string): Promise<string> {
  const normalizedSlug = citySlug.trim().toLowerCase();

  const curated = CURATED_DESTINATIONS.find(
    (destination) => slugifyCity(destination.name) === normalizedSlug
  );
  if (curated) return curated.name;

  const knownCities = await getCachedEventCities();
  const known = knownCities.find((city) => slugifyCity(city) === normalizedSlug);
  if (known) return known;

  return normalizedSlug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
