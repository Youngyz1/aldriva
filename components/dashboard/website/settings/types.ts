import type { ThemeConfig, HeaderConfig, FooterConfig, NavigationItem, WebsiteStatus } from "@/lib/website-nav";

export type WebsiteData = {
  website: {
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
    status: WebsiteStatus;
    created_at: string;
    updated_at: string;
  };
  pages: Array<{
    id: string;
    website_id: string;
    title: string;
    slug: string;
    is_home: boolean;
    status: WebsiteStatus;
    sort_order: number;
    blocks: unknown[];
    seo_title: string | null;
    seo_description: string | null;
    seo_og_image: string | null;
    created_at: string;
    updated_at: string;
  }>;
  navigation: NavigationItem[];
};
