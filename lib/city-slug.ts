// Pure string transform only — no server-only imports here. This must stay
// safe to import from client components (TopDestinations, EventsLocationDateBar)
// as well as server code (lib/resolve-city-slug.ts). Resolving a slug back to
// an exact city name (which needs a DB lookup) lives in resolve-city-slug.ts.
import { slugify } from "./slug";

export function slugifyCity(name: string): string {
  return slugify(name ?? "");
}
