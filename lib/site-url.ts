import { BRAND } from "@/config/branding";

// Preserved as the working production fallback until BRAND.website is set to
// the real Aldriva domain — see config/branding.ts.
const FALLBACK_DOMAIN = "https://www.fund4agoodcause.com";

export function getSiteUrl() {
  // NEXT_PUBLIC_SITE_URL is the same env var articles/businesses/products
  // pages already build their absolute URLs from — prefer it so every page
  // type resolves to one consistent, intentionally-configured origin.
  // NEXT_PUBLIC_APP_URL is kept as a secondary fallback for any deployment
  // that only has that one set.
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  // Deliberately never falls back to VERCEL_URL: that's the per-deployment
  // preview/production alias (e.g. "event-platform-<hash>-<team>.vercel.app"),
  // not the custom production domain — using it here previously leaked a
  // Vercel preview URL into fundraiser OG/twitter image tags, which sits
  // behind Vercel's deployment auth wall and is unreachable by external
  // scrapers like Facebook/WhatsApp. VERCEL_ENV is injected on every Vercel
  // deployment (production or preview) but never in local dev, so its
  // presence is what actually distinguishes "really running locally" from
  // "deployed somewhere" — falling back to the real production domain
  // there, and only using localhost when neither configured var nor
  // VERCEL_ENV is present.
  if (!process.env.VERCEL_ENV) {
    return "http://localhost:3000";
  }

  return BRAND.website || FALLBACK_DOMAIN;
}
