/**
 * lib/slug.ts
 *
 * Single shared slug helper for every entity-slug generator (Phase 3, Step 0).
 *
 * Rules (all entity slugs: organizers, businesses, websites, events,
 * fundraisers, articles, products, services, cities):
 * - lowercase FIRST (stripping before lowercasing drops capitals — the
 *   "Sams Abidjan" -> "ams-bidjan" production bug from the SQL trigger in
 *   migrations 58/127, fixed for future rows in migration 173),
 * - NFKD accent strip ("Café Étoile" -> "cafe-etoile"),
 * - runs of non [a-z0-9] become one "-",
 * - trim leading/trailing dashes, cap length, empty -> caller fallback.
 *
 * Reserved-slug and uniqueness handling stay at the call sites (they need
 * database access); this module is pure and client-safe.
 */

export const MAX_SLUG_LENGTH = 80;

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug;
}

export function createSlug(value: string, fallback = "item") {
  return slugify(value) || fallback;
}

export function appendSlugSuffix(slug: string, suffix: string | number) {
  const cleanSuffix = slugify(String(suffix));
  return cleanSuffix ? `${createSlug(slug)}-${cleanSuffix}` : createSlug(slug);
}
