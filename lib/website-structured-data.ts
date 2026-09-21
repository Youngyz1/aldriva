/**
 * lib/website-structured-data.ts
 *
 * JSON-LD and OpenGraph metadata generators for public tenant websites.
 * Used by app/site/[slug]/[[...page]]/page.tsx generateMetadata().
 */

import type { ThemeConfig, HeaderConfig, FooterConfig, NavigationItem } from "@/lib/website-nav";

export interface TenantWebsite {
  id: string;
  tenant_id: string;
  slug: string;
  site_title: string;
  site_tagline: string | null;
  theme_config: ThemeConfig;
  header_config: HeaderConfig;
  footer_config: FooterConfig;
  seo_title: string | null;
  seo_description: string | null;
  seo_og_image: string | null;
  status: string;
}


export interface WebsitePage {
  id: string;
  website_id: string;
  title: string;
  slug: string;
  is_home: boolean;
  status: string;
  blocks: unknown[];
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  seo_og_image: string | null;
}

export interface WebsiteNavigation {
  id: string;
  website_id: string;
  items: NavigationItem[];
}

/**
 * Returns the canonical public base URL for a tenant site.
 * Phase 12 (Custom Domains) will extend this to support apex/CNAME domains.
 */
export function getTenantSiteBaseUrl(slug: string): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://aldriva.com";
  return `${appUrl}/site/${slug}`;
}

/**
 * Generates JSON-LD structured data for a tenant website (WebSite + LocalBusiness).
 * Injected into <head> as application/ld+json on every page of the site.
 */
export function getWebsiteJsonLd(
  website: TenantWebsite,
  appUrl: string
): object[] {
  const baseUrl = `${appUrl}/site/${website.slug}`;

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: website.site_title,
    description: website.site_tagline ?? undefined,
    url: baseUrl,
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: website.site_title,
    url: baseUrl,
    ...(website.seo_og_image
      ? { image: website.seo_og_image }
      : {}),
  };

  return [websiteSchema, organizationSchema];
}

/**
 * Generates JSON-LD for an individual page (WebPage schema).
 */
export function getPageJsonLd(
  website: TenantWebsite,
  page: WebsitePage,
  appUrl: string
): object {
  const baseUrl = `${appUrl}/site/${website.slug}`;
  const pageUrl = page.is_home ? baseUrl : `${baseUrl}/${page.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.seo_title || page.title,
    description: page.seo_description ?? website.seo_description ?? undefined,
    url: pageUrl,
    isPartOf: {
      "@type": "WebSite",
      name: website.site_title,
      url: baseUrl,
    },
  };
}

/**
 * Converts a ThemeConfig into an inline CSS variables string for server-side
 * injection, preventing theme flash on first render.
 */
export function themeConfigToStyle(theme: ThemeConfig): React.CSSProperties {
  const radiusMap: Record<ThemeConfig["borderRadius"], string> = {
    none: "0px",
    sm: "0.25rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.75rem",
    full: "9999px",
  };

  const fontMap: Record<ThemeConfig["fontFamily"], string> = {
    sans: "ui-sans-serif, system-ui, sans-serif",
    serif: "ui-serif, Georgia, serif",
    mono: "ui-monospace, 'Courier New', monospace",
  };

  return {
    "--site-primary": theme.primaryColor,
    "--site-radius": radiusMap[theme.borderRadius] ?? "0.75rem",
    "--site-font": fontMap[theme.fontFamily] ?? "ui-sans-serif, system-ui, sans-serif",
    fontFamily: "var(--site-font)",
  } as React.CSSProperties;
}

/**
 * Filters navigation items to only include items whose page_id references
 * a currently-published page (or has no page_id — i.e. external/custom URL).
 * Runs recursively through child items.
 */
export function filterPublishedNavItems(
  items: NavigationItem[],
  publishedPageIds: Set<string>
): NavigationItem[] {
  return items
    .filter((item) => !item.page_id || publishedPageIds.has(item.page_id))
    .map((item) => ({
      ...item,
      children: item.children
        ? filterPublishedNavItems(item.children, publishedPageIds)
        : undefined,
    }));
}

export {
  RESERVED_WEBSITE_SLUGS,
  isReservedWebsiteSlug,
} from "@/lib/website-nav";

