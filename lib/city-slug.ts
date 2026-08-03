// Pure string transform only — no server-only imports here. This must stay
// safe to import from client components (TopDestinations, EventsLocationDateBar)
// as well as server code (lib/resolve-city-slug.ts). Resolving a slug back to
// an exact city name (which needs a DB lookup) lives in resolve-city-slug.ts.
const COMBINING_DIACRITICAL_MARKS = /[̀-ͯ]/g;

export function slugifyCity(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICAL_MARKS, "") // strip accents (e.g. "e" + combining acute -> "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
