/**
 * lib/validation/service-catalog.ts
 *
 * Pure, DB-free helpers for the service categories + richer service fields
 * feature (migration 220). No imports beyond lib/slug.ts, so these are safe
 * to unit-test without a database and to call from both server actions and
 * client components.
 *
 * Convention for these specific fields (per owner direction): empty or
 * invalid optional values mean "use default" (clamp/drop), never reject a
 * save. Required fields (title) are validated elsewhere with the existing
 * reject-on-invalid pattern in lib/actions/services.ts — unchanged here.
 */

import { createSlug, slugify } from "@/lib/slug";

export const SUMMARY_MAX = 160;
export const INCLUDES_MAX_ITEMS = 12;
export const INCLUDE_ITEM_MAX = 80;
export const CATEGORY_TITLE_MAX = 100;
export const CATEGORY_TAGLINE_MAX = 160;
export const CATEGORY_DESCRIPTION_MAX = 2000;
export const CATEGORY_SLUG_MAX = 120;

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Clamp a free-typed slug to a valid, bounded candidate. Never throws. */
export function normalizeSlugCandidate(
  input: unknown,
  fallback = "category",
  maxLen: number = CATEGORY_SLUG_MAX
): string {
  const raw = typeof input === "string" ? input : "";
  let candidate = raw.trim() ? slugify(raw) : createSlug(fallback, fallback);
  if (!SLUG_REGEX.test(candidate)) candidate = createSlug(fallback, fallback);
  candidate = candidate.slice(0, maxLen).replace(/-+$/, "");
  return candidate || fallback;
}

/**
 * Deterministic slug-collision candidate for a given retry attempt, mirroring
 * the retry shape used by createService (lib/actions/services.ts): attempt 0
 * is the bare base, attempts 1-8 append "-2".."-9", attempt >= 9 appends a
 * short random suffix reserved for by the caller via maxLen headroom.
 */
export function slugCandidateForAttempt(base: string, attempt: number, maxLen: number): string {
  const safeBase = base.slice(0, Math.max(1, maxLen - 6)).replace(/-+$/, "") || "category";
  if (attempt <= 0) return safeBase.slice(0, maxLen);
  if (attempt < 9) return `${safeBase}-${attempt + 1}`.slice(0, maxLen);
  return safeBase; // caller appends its own random suffix for attempt >= 9
}

/** Empty/too-long summary means "use default" (null) — never rejected. */
export function clampSummary(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.length > SUMMARY_MAX ? trimmed.slice(0, SUMMARY_MAX).trimEnd() : trimmed;
}

/**
 * Sanitize a free-form "includes" bullet list: drops non-strings and blanks,
 * trims, clamps each item to INCLUDE_ITEM_MAX chars, caps the list at
 * INCLUDES_MAX_ITEMS. Invalid input (not an array) becomes an empty list
 * rather than a rejected save.
 */
export function sanitizeIncludes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    cleaned.push(trimmed.length > INCLUDE_ITEM_MAX ? trimmed.slice(0, INCLUDE_ITEM_MAX).trimEnd() : trimmed);
    if (cleaned.length >= INCLUDES_MAX_ITEMS) break;
  }
  return cleaned;
}

/** Category title is required-ish at the UI layer but this module stays pure: returns a bounded, trimmed string or null for blank input. */
export function clampCategoryTitle(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.length > CATEGORY_TITLE_MAX ? trimmed.slice(0, CATEGORY_TITLE_MAX).trimEnd() : trimmed;
}

export function clampCategoryTagline(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.length > CATEGORY_TAGLINE_MAX ? trimmed.slice(0, CATEGORY_TAGLINE_MAX).trimEnd() : trimmed;
}

export function clampCategoryDescription(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.length > CATEGORY_DESCRIPTION_MAX ? trimmed.slice(0, CATEGORY_DESCRIPTION_MAX).trimEnd() : trimmed;
}
