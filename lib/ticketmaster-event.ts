import { unstable_cache } from "next/cache";

export type RawImage = { ratio?: string; width?: number; url?: string };
export type RawVenue = {
  name?: string;
  city?: { name?: string };
  state?: { name?: string; stateCode?: string };
  address?: { line1?: string };
  timezone?: string;
};
export type RawEvent = {
  id: string;
  name?: string;
  info?: string;
  pleaseNote?: string;
  url?: string;
  images?: RawImage[];
  dates?: {
    start?: {
      dateTime?: string;
      localDate?: string;
      localTime?: string;
    };
    status?: { code?: string };
    timezone?: string;
  };
  classifications?: Array<{
    segment?: { name?: string };
    genre?: { name?: string };
    subGenre?: { name?: string };
  }>;
  priceRanges?: Array<{
    min?: number;
    max?: number;
    currency?: string;
  }>;
  _embedded?: {
    venues?: RawVenue[];
  };
};

export type TicketmasterFetchResult =
  | { status: "found"; event: RawEvent }
  | { status: "not_found" };

/**
 * A genuine 404 from Ticketmaster (event doesn't exist) is stable and safe to
 * cache. Anything else — rate limiting, a 5xx, a network error — is thrown
 * instead of returned, specifically so unstable_cache (below) never persists
 * a transient failure as if it were a real result; a plain `fetch` with
 * `next.revalidate` will cache a non-ok response same as a successful one,
 * which is exactly what turned one rate-limited request into ~5 minutes of
 * every visitor hitting a hard 404 for a perfectly real event.
 */
async function fetchTicketmasterEvent(id: string): Promise<TicketmasterFetchResult> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return { status: "not_found" };

  const params = new URLSearchParams({ apikey: apiKey });
  const response = await fetch(
    `https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(id)}.json?${params.toString()}`
  );

  if (response.status === 404) return { status: "not_found" };
  if (!response.ok) {
    throw new Error(`Ticketmaster API error ${response.status}`);
  }

  const event = (await response.json()) as RawEvent;
  return { status: "found", event };
}

/**
 * Shared between proxy.ts (the pre-streaming existence gate, mirroring the
 * article access-control pattern) and the detail page (the actual render).
 * Both call this exact same unstable_cache instance with the same id, so
 * whichever one runs first for a given id within the 5-minute window is the
 * only one that hits Ticketmaster — proxy defaults to the Node.js runtime in
 * this Next version, so its Data Cache is genuinely shared with the page's,
 * not a separate Edge-isolated cache. Keeps the existence-check gate from
 * doubling the upstream request per pageview.
 */
export const getCachedTicketmasterEvent = unstable_cache(
  fetchTicketmasterEvent,
  ["ticketmaster-event-detail"],
  { revalidate: 300 }
);
