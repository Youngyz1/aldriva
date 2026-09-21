export type ThemeConfig = {
  theme: "default" | "minimal" | "bold" | "warm" | "forest" | "midnight";
  primaryColor: string;
  fontFamily: "sans" | "serif" | "mono";
  borderRadius: "none" | "sm" | "md" | "lg" | "xl" | "full";
  darkMode: boolean;
};

export type HeaderConfig = {
  showLogo: boolean;
  showNav: boolean;
  showCta: boolean;
  ctaLabel: string;
  ctaHref: string;
  sticky: boolean;
};

export type FooterConfig = {
  showSocials: boolean;
  copyrightText: string;
  showPoweredBy: boolean;
  customLinks: Array<{ label: string; href: string }>;
};

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  page_id?: string | null;
  target?: "_self" | "_blank";
  order: number;
  children?: NavigationItem[];
};

export type WebsiteStatus = "draft" | "published" | "archived";

export type TenantWebsiteInput = {
  site_title: string;
  site_tagline?: string | null;
  slug?: string;
  theme_config?: Partial<ThemeConfig>;
  header_config?: Partial<HeaderConfig>;
  footer_config?: Partial<FooterConfig>;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_og_image?: string | null;
  status?: WebsiteStatus;
};

export type PageInput = {
  title: string;
  slug?: string;
  is_home?: boolean;
  status?: WebsiteStatus;
  blocks?: unknown[];
  sort_order?: number;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_og_image?: string | null;
};

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  theme: "default",
  primaryColor: "#ea580c",
  fontFamily: "sans",
  borderRadius: "xl",
  darkMode: false,
};

export const DEFAULT_HEADER_CONFIG: HeaderConfig = {
  showLogo: true,
  showNav: true,
  showCta: true,
  ctaLabel: "Get in Touch",
  ctaHref: "/contact",
  sticky: true,
};

export const DEFAULT_FOOTER_CONFIG: FooterConfig = {
  showSocials: true,
  copyrightText: "",
  showPoweredBy: true,
  customLinks: [],
};

/**
 * Sanitizes navigation tree by removing items referencing deleted pageId
 */
export function sanitizeNavOnPageDelete(items: NavigationItem[], deletedPageId: string): NavigationItem[] {
  return items
    .filter((item) => item.page_id !== deletedPageId)
    .map((item) => ({
      ...item,
      children: item.children ? sanitizeNavOnPageDelete(item.children, deletedPageId) : undefined,
    }));
}

/**
 * Updates navigation tree hrefs for pages whose slugs changed
 */
export function sanitizeNavOnPageSlugChange(
  items: NavigationItem[],
  pageId: string,
  newSlug: string
): NavigationItem[] {
  return items.map((item) => {
    let updatedHref = item.href;
    if (item.page_id === pageId) {
      updatedHref = newSlug === "home" ? "/" : `/${newSlug}`;
    }
    return {
      ...item,
      href: updatedHref,
      children: item.children
        ? sanitizeNavOnPageSlugChange(item.children, pageId, newSlug)
        : undefined,
    };
  });
}

export const RESERVED_WEBSITE_SLUGS = new Set([
  "api",
  "admin",
  "dashboard",
  "site",
  "sites",
  "products",
  "articles",
  "events",
  "fundraisers",
  "businesses",
  "login",
  "signup",
  "auth",
  "settings",
  "profile",
  "verify",
  "privacy",
  "terms",
  "cookies",
  "about",
  "help",
  "checkout",
  "cart",
  "orders",
  "recover-account",
  "reset-password",
  "search",
  "import",
  "org",
  "organizers",
  "organizations",
  "platform",
  "sponsors",
  "beneficiaries",
  "beneficiary",
  "reviews",
  "find-tickets",
  "my-tickets",
  "things-to-do",
  "external-events",
  "eventbrite-sync",
  "gofundme-sync",
]);

export function isReservedWebsiteSlug(slug: string): boolean {
  return RESERVED_WEBSITE_SLUGS.has(slug.toLowerCase().trim());
}

