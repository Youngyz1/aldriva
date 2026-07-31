/**
 * Live, multi-source external event search.
 *
 * Aldriva is a discovery surface for events sold on other platforms: results
 * from Ticketmaster and SeatGeek are fetched live per view, rendered, and linked
 * out for purchase — never persisted to our database. Each source's terms allow
 * short-lived caching but not storage, so every fetch uses a 5-minute
 * `revalidate` window (below) and nothing here writes to Postgres.
 *
 * This module is the single server-side entry point. Server Components call
 * {@link searchExternalEvents} (or {@link searchTicketmaster}) directly — do NOT
 * self-fetch an internal API route from a Server Component; that round-trips over
 * HTTP and returns empty during SSR. The `/api/eventbrite` route now delegates
 * here so the browser-side caller (NearbyEvents) keeps working.
 */

/** Sources we combine. Add a source by writing another `search<Source>` adapter. */
export type ExternalEventSource = "ticketmaster" | "seatgeek";

export interface ExternalEvent {
  /** Source-prefixed id (`tm_...` / `sg_...`) so ids never collide across sources. */
  id: string;
  /** External events have no Aldriva slug; kept for `EventCard` prop parity. */
  slug: null;
  title: string;
  event_date: string | null;
  city: string | null;
  venue: string | null;
  banner: string | null;
  category: string | null;
  /** The source platform's event page — where the user buys tickets. */
  url: string | null;
  source: ExternalEventSource;
}

export interface ExternalSearchParams {
  /** City or "City, ST" — only the city part is sent to each API. */
  location?: string | null;
  query?: string | null;
  category?: string | null;
  /** Single day, `YYYY-MM-DD`. Filters both sources to that calendar day. */
  date?: string | null;
  /** Max results requested per source (before dedup). */
  size?: number;
}

const TICKETMASTER_ENDPOINT = "https://app.ticketmaster.com/discovery/v2/events.json";
const SEATGEEK_ENDPOINT = "https://api.seatgeek.com/2/events";

/** Short-TTL cache: enough to absorb repeat views without "storing" event data. */
const REVALIDATE_SECONDS = 300;
const DEFAULT_SIZE = 20;

/**
 * Ticketmaster free tier is 5,000 requests/day. The `Rate-Limit-Available`
 * response header counts down the remaining daily budget; warn well before it
 * hits zero so the ceiling is visible in logs rather than silently degrading.
 */
const TICKETMASTER_RATE_LIMIT_WARN_AT = 250;

function cityOf(location?: string | null): string | null {
  if (!location) return null;
  const city = location.split(",")[0]?.trim();
  return city || null;
}

/**
 * Normalize a source-provided category. Ticketmaster returns the literal string
 * "Undefined" as the segment name for uncategorized events (e.g. watch parties),
 * which must never surface as a visible badge. Treat that — and blank values — as
 * "no category" so the card omits the badge.
 */
function cleanCategory(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "undefined") return null;
  return trimmed;
}

function keywordOf(query?: string | null, category?: string | null): string {
  return [query, category].filter(Boolean).join(" ").trim();
}

// ── Ticketmaster ────────────────────────────────────────────────────────────

type TmImage = { ratio?: string; width?: number; url?: string };
type TmVenue = { city?: { name?: string }; name?: string };
type TmEvent = {
  id: string;
  name?: string;
  dates?: { start?: { localDate?: string; localTime?: string } };
  _embedded?: { venues?: TmVenue[] };
  images?: TmImage[];
  classifications?: Array<{ segment?: { name?: string } }>;
  url?: string;
};

function mapTicketmaster(e: TmEvent, fallbackCity: string | null): ExternalEvent {
  return {
    id: `tm_${e.id}`,
    slug: null,
    title: e.name || "Untitled Event",
    event_date: e.dates?.start?.localDate
      ? `${e.dates.start.localDate}T${e.dates.start.localTime || "00:00:00"}`
      : null,
    city: e._embedded?.venues?.[0]?.city?.name || fallbackCity,
    venue: e._embedded?.venues?.[0]?.name || null,
    banner:
      e.images?.find((img) => img.ratio === "16_9" && (img.width ?? 0) > 500)?.url ||
      e.images?.[0]?.url ||
      null,
    category: cleanCategory(e.classifications?.[0]?.segment?.name),
    url: e.url ?? null,
    source: "ticketmaster",
  };
}

export async function searchTicketmaster(
  params: ExternalSearchParams
): Promise<ExternalEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return [];

  const city = cityOf(params.location);
  const search = new URLSearchParams({
    apikey: apiKey,
    size: String(params.size ?? DEFAULT_SIZE),
    sort: "date,asc",
  });
  if (city) search.set("city", city);
  else search.set("countryCode", "US");

  const keyword = keywordOf(params.query, params.category);
  if (keyword) search.set("keyword", keyword);
  if (params.date) {
    search.set("startDateTime", `${params.date}T00:00:00Z`);
    search.set("endDateTime", `${params.date}T23:59:59Z`);
  }

  const response = await fetch(`${TICKETMASTER_ENDPOINT}?${search.toString()}`, {
    next: { revalidate: REVALIDATE_SECONDS },
  });

  const remaining = Number(response.headers.get("Rate-Limit-Available"));
  if (Number.isFinite(remaining) && remaining <= TICKETMASTER_RATE_LIMIT_WARN_AT) {
    console.warn(
      `[external-events] Ticketmaster daily rate limit low: ${remaining} requests remaining`
    );
  }

  const data = await response.json();
  if (!response.ok) {
    console.error("[external-events] Ticketmaster error:", data);
    return [];
  }

  const rawEvents: TmEvent[] = data._embedded?.events || [];
  return rawEvents.map((e) => mapTicketmaster(e, city));
}

// ── SeatGeek ──────────────────────────────────────────────────────────────

type SgPerformer = { image?: string; images?: { huge?: string; large?: string } };
type SgEvent = {
  id: number;
  title?: string;
  datetime_local?: string;
  url?: string;
  type?: string;
  venue?: { name?: string; city?: string };
  performers?: SgPerformer[];
  taxonomies?: Array<{ name?: string }>;
};

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function mapSeatGeek(e: SgEvent, fallbackCity: string | null): ExternalEvent {
  const performer = e.performers?.[0];
  const rawCategory = cleanCategory(e.type) ?? cleanCategory(e.taxonomies?.[0]?.name);
  return {
    id: `sg_${e.id}`,
    slug: null,
    title: e.title || "Untitled Event",
    event_date: e.datetime_local || null,
    city: e.venue?.city || fallbackCity,
    venue: e.venue?.name || null,
    banner: performer?.images?.huge || performer?.images?.large || performer?.image || null,
    category: rawCategory ? titleCase(rawCategory) : null,
    url: e.url ?? null,
    source: "seatgeek",
  };
}

export async function searchSeatGeek(
  params: ExternalSearchParams
): Promise<ExternalEvent[]> {
  const clientId = process.env.SEATGEEK_CLIENT_ID;
  if (!clientId) return [];

  const city = cityOf(params.location);
  const search = new URLSearchParams({
    client_id: clientId,
    per_page: String(params.size ?? DEFAULT_SIZE),
    sort: "datetime_utc.asc",
  });
  if (city) search.set("venue.city", city);

  const keyword = keywordOf(params.query, params.category);
  if (keyword) search.set("q", keyword);

  if (params.date) {
    search.set("datetime_utc.gte", `${params.date}T00:00:00`);
    search.set("datetime_utc.lte", `${params.date}T23:59:59`);
  } else {
    // No explicit day → only future events (SeatGeek returns past events too).
    search.set("datetime_utc.gte", new Date().toISOString().slice(0, 19));
  }

  const response = await fetch(`${SEATGEEK_ENDPOINT}?${search.toString()}`, {
    next: { revalidate: REVALIDATE_SECONDS },
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("[external-events] SeatGeek error:", data);
    return [];
  }

  const rawEvents: SgEvent[] = data.events || [];
  return rawEvents.map((e) => mapSeatGeek(e, city));
}

// ── Combined ────────────────────────────────────────────────────────────────

const eventKey = (e: { title: string; event_date?: string | null }) =>
  `${e.title.toLowerCase().trim()}-${e.event_date || ""}`;

/**
 * Round-robin merge: take one from each list in turn. Callers cap the combined
 * list (e.g. `.slice(0, 9)`), and a single source returns a full page (~20), so
 * plain concatenation would let the first source fill every capped slot and
 * truncate the second source away entirely. Interleaving keeps both sources
 * represented no matter where the cap lands. `first` is emitted before `second`
 * within each round, preserving its precedence on the dedup below.
 */
function interleave(first: ExternalEvent[], second: ExternalEvent[]): ExternalEvent[] {
  const merged: ExternalEvent[] = [];
  const rounds = Math.max(first.length, second.length);
  for (let i = 0; i < rounds; i++) {
    if (i < first.length) merged.push(first[i]);
    if (i < second.length) merged.push(second[i]);
  }
  return merged;
}

/**
 * Query every source in parallel and return a de-duplicated, unified list.
 * A failing source degrades to `[]` (logged) rather than failing the whole
 * search — a rate-limited or down source must not blank the page. Sources are
 * interleaved so a downstream cap shows a mix of both; Ticketmaster results take
 * precedence over SeatGeek on title+date collisions.
 */
export async function searchExternalEvents(
  params: ExternalSearchParams
): Promise<ExternalEvent[]> {
  const [ticketmaster, seatgeek] = await Promise.all([
    searchTicketmaster(params).catch((error) => {
      console.error("[external-events] Ticketmaster fetch failed:", error);
      return [] as ExternalEvent[];
    }),
    searchSeatGeek(params).catch((error) => {
      console.error("[external-events] SeatGeek fetch failed:", error);
      return [] as ExternalEvent[];
    }),
  ]);

  const seen = new Set<string>();
  const combined: ExternalEvent[] = [];
  for (const event of interleave(ticketmaster, seatgeek)) {
    const key = eventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(event);
  }
  return combined;
}
