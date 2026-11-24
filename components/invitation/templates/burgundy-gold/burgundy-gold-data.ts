/**
 * components/invitation/templates/burgundy-gold/burgundy-gold-data.ts
 *
 * Pure data mapping for the Burgundy Gold post-ceremony sections. Kept free of
 * React so the mapping and the empty-state rules are unit-testable.
 *
 * DUPLICATION NOTE (stage 2B): these helpers mirror logic that lives inline in
 * MinimalismDarkBluePageTemplate.tsx (useCountdown ~L109, buildMonthCalendar
 * ~L136, weekdayHeaders ~L149, the schedule filter ~L838, the dress-code
 * swatch list ~L806). That file is not refactored — the minimalism renderer is
 * frozen — so the logic is copied here and scoped to burgundy-gold.
 */

import type {
  InvitationGalleryItem,
  InvitationPageData,
  InvitationScheduleItem,
} from "@/types/invitation-template";
import { buildVenueMapEmbedUrl, buildVenueMapSearchUrl } from "@/lib/evergreen-map";

/** Reference page shows a 2 × 2 mosaic; the last tile carries the "+N" badge. */
export const BURGUNDY_GALLERY_TILES = 4;
/** Reference page caps the day programme; longer schedules are truncated. */
export const BURGUNDY_SCHEDULE_MAX = 15;

export interface BurgundyGalleryTile {
  url: string;
  alt: string;
  /** Extra photos beyond the visible mosaic, shown on the last tile. Only set on the last tile. */
  remaining: number;
  /** Index of this tile inside the full gallery, used to open the viewer at the tapped photo. */
  index: number;
}

/** First four usable photos, with the overflow count on the last tile. Returns null when nothing is renderable. */
export function burgundyGalleryTiles(
  gallery: InvitationGalleryItem[] | null | undefined
): BurgundyGalleryTile[] | null {
  const usable = (gallery ?? []).filter((item) => typeof item?.url === "string" && item.url.trim().length > 0);
  if (!usable.length) return null;
  const tiles = usable.slice(0, BURGUNDY_GALLERY_TILES);
  const remaining = usable.length - tiles.length;
  return tiles.map((item, index) => ({
    url: item.url,
    alt: item.alt?.trim() ?? "",
    remaining: index === tiles.length - 1 ? remaining : 0,
    index,
  }));
}

export interface BurgundyScheduleEntry {
  time: string;
  title: string;
  /** Optional context line (e.g. venue), null when absent. */
  description: string | null;
  /** True for ceremony/reception-type entries, highlighted more strongly in the timeline. */
  isKeyMoment: boolean;
}

/** Ceremony/reception read as the key moments of the day, in either language. */
const KEY_MOMENT_PATTERN = /ceremony|reception|c[ée]r[ée]monie|r[ée]ception/i;

/** Valid programme entries (time + title/label), capped at 15. Null when the section must hide. */
export function burgundyScheduleEntries(
  schedule: InvitationScheduleItem[] | null | undefined
): BurgundyScheduleEntry[] | null {
  const entries = (schedule ?? [])
    .map((item) => ({
      time: item?.time?.trim() ?? "",
      title: (item?.title ?? item?.label ?? "").trim(),
      description: item?.description?.trim() || null,
    }))
    .filter((item) => item.time.length > 0 && item.title.length > 0)
    .slice(0, BURGUNDY_SCHEDULE_MAX)
    .map((item) => ({ ...item, isKeyMoment: KEY_MOMENT_PATTERN.test(item.title) }));
  return entries.length ? entries : null;
}

export interface BurgundyCalendarCell {
  date: number | null;
  isEventDay: boolean;
}

export interface BurgundyMonthCalendar {
  year: number;
  /** 0-based, as returned by Intl's month numbering minus one. */
  monthIndex: number;
  eventDay: number;
  weeks: BurgundyCalendarCell[][];
}

/**
 * The event's calendar day in the event timezone. `new Date(iso).getDate()`
 * would drift across midnight for non-host zones, so the day/month/year are
 * read through Intl instead.
 */
export function burgundyEventDayParts(
  iso: string | null | undefined,
  timezone?: string | null
): { year: number; monthIndex: number; day: number } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const read = (tz: string | null) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      ...(tz ? { timeZone: tz } : {}),
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get("year"), monthIndex: get("month") - 1, day: get("day") };
  };

  if (timezone?.trim()) {
    try {
      return read(timezone.trim());
    } catch {
      // fall through to the host zone
    }
  }
  try {
    return read(null);
  } catch {
    return null;
  }
}

/** Sunday-first month grid with the event day flagged for the heart marker. Null when the section must hide. */
export function burgundyMonthCalendar(
  iso: string | null | undefined,
  timezone?: string | null
): BurgundyMonthCalendar | null {
  const parts = burgundyEventDayParts(iso, timezone);
  if (!parts) return null;
  const { year, monthIndex, day } = parts;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: BurgundyCalendarCell[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push({ date: null, isEventDay: false });
  for (let date = 1; date <= daysInMonth; date += 1) cells.push({ date, isEventDay: date === day });
  while (cells.length % 7 !== 0) cells.push({ date: null, isEventDay: false });
  const weeks: BurgundyCalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { year, monthIndex, eventDay: day, weeks };
}

/** Narrow weekday headers from Intl for the active locale (never hand-truncated). */
export function burgundyWeekdayHeaders(localeCode: string): string[] {
  const reference = new Date(2023, 0, 1); // a Sunday
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(reference);
    date.setDate(reference.getDate() + index);
    return new Intl.DateTimeFormat(localeCode, { weekday: "short" }).format(date);
  });
}

/** Epoch milliseconds the countdown counts down to, or null when there is no usable date. */
export function burgundyCountdownTarget(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  return Number.isNaN(target) ? null : target;
}

export interface BurgundyTimedVenue {
  label?: string | null;
  name?: string | null;
  address?: string | null;
  time?: string | null;
}

export interface BurgundyReceptionTimes {
  welcome: string | null;
  reception: string | null;
}

const WELCOME_LABEL = /(welcome|accueil|guest|invit)/i;
const RECEPTION_LABEL = /(reception|réception|salle|dinner|dîner|banquet)/i;
const WELCOME_TITLE = /(welcome|accueil)/i;

/**
 * Guest-welcome time from the day programme. In the reference the welcome is
 * its own moment before the ceremony, not a venue, so it is read from the
 * schedule and then shown only inside the reception info block.
 */
export function burgundyWelcomeTime(
  schedule: InvitationScheduleItem[] | null | undefined
): string | null {
  const entry = (schedule ?? []).find(
    (item) => item?.time?.trim() && WELCOME_TITLE.test(item.title ?? item.label ?? "")
  );
  return entry?.time?.trim() || null;
}

/**
 * Guest-welcome and reception times. Labels are matched first (a three-venue
 * wedding may list the welcome party first), then the venue order is used.
 */
export function burgundyReceptionTimes(
  venues: BurgundyTimedVenue[] | null | undefined,
  fallbackWelcome?: string | null
): BurgundyReceptionTimes | null {
  const timed = (venues ?? []).filter((venue) => venue?.time?.trim());
  const welcomeVenue = timed.find((venue) => WELCOME_LABEL.test(venue.label ?? ""));
  const receptionVenue = timed.find((venue) => RECEPTION_LABEL.test(venue.label ?? ""));
  // A labelled welcome venue wins, then the programme's welcome moment, then
  // whatever is listed first. The first venue is usually the ceremony, so it
  // is the last resort rather than the default.
  const welcome = welcomeVenue?.time?.trim() || fallbackWelcome?.trim() || timed[0]?.time?.trim() || null;
  const reception =
    receptionVenue?.time?.trim()
    || timed[1]?.time?.trim()
    || (welcomeVenue || timed.length <= 1 ? null : timed[0]?.time?.trim() ?? null);
  if (!welcome && !reception) return null;
  return { welcome, reception };
}

const FIRST_NAME_SPLIT = /\s*(?:&|\bet\b|\band\b)\s*/i;

function firstWord(value?: string | null): string {
  return value?.trim().split(/\s+/)[0] ?? "";
}

/**
 * Hero names: first names only, stacked under the eyebrow. Derived from the
 * partner names; falls back to the host names when partners are unset. Full
 * names stay available for the ceremony panel.
 */
export function burgundyHeroNames(data: InvitationPageData): string[] {
  const first = firstWord(data.partner1Name);
  const second = firstWord(data.partner2Name);
  if (first && second) return [first, second];
  if (first || second) return [first || second];

  const hosts = data.hostNames?.trim() ?? "";
  if (!hosts) return [];
  const parts = hosts.split(FIRST_NAME_SPLIT).map(firstWord).filter(Boolean);
  return parts.length > 1 ? parts : [firstWord(hosts)];
}

/**
 * "No real, specific guest" sentinels, reused rather than invented: every
 * current render path that isn't a live, token-resolved guest page already
 * funnels through one of these two exact strings —
 * "Honored Guest" is assembleInvitationPageData's own fallback when no guest
 * record is passed at all (lib/types/invitation-page-snapshot.ts), and
 * "Sample Guest" is SAMPLE_PREVIEW_GUEST (lib/invitation-preview-channel.ts),
 * used by the demo route, the gallery-card preview, and the builder preview.
 * Checking against these avoids adding a new field to the guest/seat/ticket
 * contract just to say "this one isn't real".
 */
const NO_REAL_GUEST_NAMES = new Set(["Honored Guest", "Sample Guest", "Preview Guest"]);

/**
 * The guest's display name for a "Dear {name}," greeting, or null when there
 * is no real, specific guest (demo, preview, public template card, or the
 * read-only /invitation/shared/[token] route, which never carries a guest
 * name) — so the caller renders nothing and the hero layout never shifts.
 */
export function burgundyGuestGreetingName(guest: { name?: string | null; isPlaceholder?: boolean; isSample?: boolean } | null | undefined): string | null {
  if (!guest) return null;
  if (guest.isPlaceholder || guest.isSample) return null;
  const name = guest?.name?.trim();
  if (!name || NO_REAL_GUEST_NAMES.has(name)) return null;
  return name;
}

export interface BurgundySwatch {
  name?: string | null;
  hex: string;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Usable dress-code swatches; invalid hex values are dropped rather than rendered as empty circles. */
export function burgundyDressSwatches(
  swatches: { name?: string | null; hex: string }[] | null | undefined
): BurgundySwatch[] | null {
  const usable = (swatches ?? [])
    .filter((swatch) => typeof swatch?.hex === "string" && HEX_COLOR.test(swatch.hex.trim()))
    .map((swatch) => ({ name: swatch.name?.trim() || undefined, hex: swatch.hex.trim() }));
  return usable.length ? usable : null;
}

export interface BurgundyVenue {
  name: string | null;
  address: string | null;
  embedUrl: string | null;
  mapUrl: string | null;
  directionsUrl: string | null;
}

function coordinate(value: unknown, min: number, max: number): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : null;
}

/**
 * Venue block inputs: map embed + "View on map" + "Itinerary". Null when there
 * is neither a location nor a name, so the section can hide itself.
 */
export function burgundyVenue(data: InvitationPageData): BurgundyVenue | null {
  const lat = coordinate(data.latitude, -90, 90);
  const lng = coordinate(data.longitude, -180, 180);
  const name = data.venue?.trim() || data.venues?.find((venue) => venue.name?.trim())?.name?.trim() || null;
  const address = [data.address, data.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ") || null;
  const query = [name, address].filter(Boolean).join(", ");
  const hasCoordinates = lat !== null && lng !== null;
  if (!hasCoordinates && !query) return null;

  // Reuse the shared map helpers; coordinates are passed as the query so an
  // exact pin still wins over a free-text address search.
  const mapQuery = hasCoordinates ? `${lat},${lng}` : query;
  const embedUrl = buildVenueMapEmbedUrl(mapQuery);
  const mapUrl = buildVenueMapSearchUrl(mapQuery, null);
  // No exported directions helper exists, so the itinerary link is built here.
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}`;

  return { name, address, embedUrl, mapUrl, directionsUrl };
}

/**
 * Memories gallery gate, mirroring minimalism's rule: the layout switch must be
 * on, and there must either be a real approved-photo token/count or the demo
 * sample set. Never shows an empty gallery.
 */
export function burgundyShowMemories(
  sectionSettings: { mf_show_memories?: boolean } | null | undefined,
  data: InvitationPageData
): boolean {
  if (sectionSettings?.mf_show_memories !== true) return false;
  return data.memoriesSample === true || ((data.memoriesCount ?? 0) > 0 && Boolean(data.memoriesToken));
}

/** Music control gate: a configured audio URL or provider links. */
export function burgundyHasMusic(data: InvitationPageData): boolean {
  return Boolean(data.musicAudioUrl || data.musicLinks?.length);
}

/** Guestbook is shown unless the layout switches it off. */
export function burgundyShowGuestbook(sectionSettings: { show_guestbook?: boolean } | null | undefined): boolean {
  return sectionSettings?.show_guestbook !== false;
}
