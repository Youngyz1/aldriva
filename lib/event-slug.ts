/**
 * lib/event-slug.ts
 *
 * Single shared helper for event slugs (Round 3, Commit 3d / Part B).
 *
 * Used by every place that creates an event slug: the public create form,
 * the invitation draft server action, and (via the same primitives) any
 * future importer. Client- and server-safe: pure functions plus
 * caller-supplied database callbacks, no server-only imports.
 *
 * Rules:
 * - slugify: lowercase, trim, strip non [a-z0-9 -], spaces to dashes,
 *   collapse repeats. Empty results fall back to "event".
 * - reserved slugs are never issued bare — they get a random suffix.
 *   The base list is the website reserved set (dashboard, create-event,
 *   api, admin, import, …) plus event-route words (event, events,
 *   invitation, invitations, new, edit, shared, tickets).
 * - collisions get a short random suffix; inserts retry a bounded number
 *   of times on unique violations. Raw database text never reaches the
 *   caller — failures throw EventSlugError with a stable code, and the UI
 *   maps codes to localized copy.
 * - existing slugs never change: this module only mints slugs for new
 *   rows. Title edits must not touch the slug column.
 */

import { RESERVED_WEBSITE_SLUGS } from "@/lib/website-nav";

const EVENT_ROUTE_WORDS = new Set([
  "event",
  "events",
  "invitation",
  "invitations",
  "new",
  "edit",
  "shared",
  "tickets",
  // Route paths missing from the website reserved set (verified): an event
  // titled "Create Event" must never mint the bare "create-event" slug.
  "create-event",
  "create-fundraiser",
  "create-organizer",
]);

export const MAX_SLUG_ATTEMPTS = 5;
const SUFFIX_LENGTH = 4;

export function slugifyEventTitle(title: string): string {
  const slug = (title ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "event";
}

export function isReservedEventSlug(slug: string): boolean {
  const normalized = (slug ?? "").toLowerCase().trim();
  return RESERVED_WEBSITE_SLUGS.has(normalized) || EVENT_ROUTE_WORDS.has(normalized);
}

function randomSuffix(length: number = SUFFIX_LENGTH): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  // crypto.getRandomValues exists in browsers and Node 19+; Math.random is
  // the fallback so unit tests and older runtimes keep working.
  const bytes = new Uint32Array(length);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 0xffffffff);
  }
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function withSlugSuffix(base: string, suffix: string = randomSuffix()): string {
  return `${base}-${suffix}`;
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code === "23505") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /duplicate|unique/i.test(message);
}

/**
 * Mint a slug for a new event: base slug from the title, suffixed when
 * reserved or already taken. `exists` answers "is this slug taken?" for
 * the events table. Bounded attempts; throws EventSlugError("exhausted")
 * instead of looping forever under pathological collision storms.
 */
export async function ensureUniqueEventSlug(
  exists: (slug: string) => Promise<boolean>,
  title: string,
  maxAttempts: number = MAX_SLUG_ATTEMPTS
): Promise<string> {
  const base = slugifyEventTitle(title);
  if (!isReservedEventSlug(base) && !(await exists(base))) return base;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = withSlugSuffix(base);
    if (!isReservedEventSlug(candidate) && !(await exists(candidate))) return candidate;
  }

  throw new EventSlugError("exhausted");
}

export type SlugFailureCode = "exhausted" | "unavailable" | "unknown";

export class EventSlugError extends Error {
  readonly code: SlugFailureCode;

  constructor(code: SlugFailureCode) {
    super(`event slug failure: ${code}`);
    this.name = "EventSlugError";
    this.code = code;
  }
}

export interface SlugInsertResult<T> {
  data: T | null;
  error: unknown;
}

/**
 * Insert with collision retry: runs `insert` with a fresh unique slug,
 * re-minting on unique violations up to `maxAttempts`. Any other database
 * error aborts immediately as EventSlugError("unavailable") — the raw
 * database message is swallowed here so it can never reach the UI.
 */
export async function insertWithUniqueSlug<T>(
  insert: (slug: string) => Promise<SlugInsertResult<T>>,
  exists: (slug: string) => Promise<boolean>,
  title: string,
  maxAttempts: number = MAX_SLUG_ATTEMPTS
): Promise<{ slug: string; data: T }> {
  let slug = await ensureUniqueEventSlug(exists, title, maxAttempts);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await insert(slug);
    if (!error) {
      if (!data) throw new EventSlugError("unknown");
      return { slug, data };
    }
    if (!isUniqueViolation(error)) throw new EventSlugError("unavailable");
    // Lost a race between the availability check and the insert: mint a
    // fresh suffix and retry instead of surfacing events_slug_key.
    slug = withSlugSuffix(slugifyEventTitle(title));
  }

  throw new EventSlugError("exhausted");
}

const PUBLISH_FAILED_EN = "Could not publish your event. Your details are kept — please try again.";
const PUBLISH_FAILED_FR =
  "Impossible de publier votre événement. Vos informations sont conservées — veuillez réessayer.";

/** UI locale without a next-intl provider: document lang, then browser, then EN. */
export function resolveUiLocale(): string {
  if (typeof document !== "undefined") {
    const docLang = document.documentElement?.lang || "";
    if (docLang) return docLang;
  }
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return "en";
}

/** Localized publish-failure copy. Form state is never cleared on failure. */
export function localizedPublishError(locale?: string): string {
  const resolved = (locale ?? resolveUiLocale()).toLowerCase();
  return resolved.startsWith("fr") ? PUBLISH_FAILED_FR : PUBLISH_FAILED_EN;
}
