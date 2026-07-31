import { headers } from "next/headers";

const DEFAULT_COUNTRY = "US";
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

/**
 * Best-effort visitor country, derived server-side from the platform's own
 * edge geolocation of the real incoming request IP — not the country a
 * payment provider's client-side widget guesses from the browser's own
 * network path, which can be wrong behind VPNs/proxies/unusual egress routes.
 * (Confirmed empirically: this project's dev sandbox egress IP itself
 * geolocates to Cote d'Ivoire, which is exactly the class of failure this
 * guards against — see the Stripe country-default bug fix.)
 *
 * Vercel injects `x-vercel-ip-country` at the edge for every request; when
 * that header is absent (local dev, or hosting elsewhere) this falls back to
 * "US" rather than leaving the caller to show whatever a less trustworthy
 * signal produces.
 */
export async function getVisitorCountry(): Promise<string> {
  const headerList = await headers();
  const vercelCountry = headerList.get("x-vercel-ip-country");
  if (vercelCountry && COUNTRY_CODE_PATTERN.test(vercelCountry)) {
    return vercelCountry;
  }
  return DEFAULT_COUNTRY;
}

/**
 * Best-effort visitor city, from the same Vercel edge geolocation as
 * `getVisitorCountry` — Vercel injects `x-vercel-ip-city` (URL-encoded, e.g.
 * "New%20York") at the edge for every request. Returns `null` when the header
 * is absent (local dev, or hosting elsewhere) so callers can fall back to a
 * non-personalized label rather than guessing.
 */
export async function getVisitorCity(): Promise<string | null> {
  const headerList = await headers();
  const raw = headerList.get("x-vercel-ip-city");
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
