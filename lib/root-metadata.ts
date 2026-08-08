import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { BRAND } from "@/config/branding";

/**
 * Shared base metadata for every root layout — the top-level app/layout.tsx
 * and the (gated) route group's independent root layout both need this
 * (route groups with their own <html>/<body> bypass app/layout.tsx entirely,
 * so anything it exports has to be duplicated somewhere rather than
 * inherited).
 */
export const rootMetadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: BRAND.name,
  title: { default: BRAND.seo.defaultTitle, template: BRAND.seo.titleTemplate },
  description: BRAND.seo.defaultDescription,
  keywords: [...BRAND.seo.keywords],
  verification: {
    google: "po4G29Q4YxDRxL3h7QbPGk_Wz4eYvinBleV7ISM5LBA",
  },
  openGraph: {
    siteName: BRAND.name,
    title: BRAND.seo.defaultTitle,
    description: BRAND.seo.defaultDescription,
    type: "website",
    images: [{ url: BRAND.assets.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.seo.defaultTitle,
    description: BRAND.seo.defaultDescription,
    images: [BRAND.assets.ogImage],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

/** Shared WebSite JSON-LD object for the root <head> script, same reason as above. */
export function getWebsiteJsonLd() {
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND.name,
    url: siteUrl,
    description: BRAND.seo.defaultDescription,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
