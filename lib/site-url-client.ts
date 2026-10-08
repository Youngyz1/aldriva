import { BRAND } from "@/config/branding";

const FALLBACK_DOMAIN = "https://aldriva.com";

/**
 * Browser-safe base URL for share links and other client interactions.
 * Server deployment URLs stay in `lib/site-url.ts` and are never bundled.
 */
export function getClientSiteUrl(): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL;

  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return BRAND.website || FALLBACK_DOMAIN;
}
