import { BRAND } from "../config/branding";

// Safety-net fallback only — BRAND.website (config/branding.ts) is the real
// source of truth and is expected to always be set.
const FALLBACK_DOMAIN = "https://aldriva.com";

export function getSiteUrl() {
  // 1. Explicitly configured site/app URLs (public and server-side)
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.SITE_URL ||
    process.env.APP_URL;

  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  // 2. Vercel Staging / Preview branch URL (when deployed on a non-production branch)
  if (process.env.VERCEL_ENV === "preview") {
    const vercelUrl = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (vercelUrl) {
      const normalized = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
      return normalized.replace(/\/$/, "");
    }
  }

  // 3. Local development
  if (process.env.NODE_ENV === "development" && !process.env.VERCEL_ENV) {
    return "http://localhost:3000";
  }

  // 4. Production fallback domain
  return BRAND.website || FALLBACK_DOMAIN;
}
