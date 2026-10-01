import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { hasEntityAccess, ENTITY_ROLES_ALL } from "@/lib/entity-auth";
import { isAdmin } from "@/lib/auth";
import {
  TenantWebsite,
  WebsitePage,
  WebsiteNavigation,
  getTenantSiteBaseUrl,
  getWebsiteJsonLd,
  getPageJsonLd,
  themeConfigToStyle,
  filterPublishedNavItems,
} from "@/lib/website-structured-data";
import { resolveThemeTokens, themeTokensToStyle } from "@/lib/website-blocks";
import { BlockRenderer } from "@/components/site/blocks/BlockRenderer";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { DraftPreviewBanner } from "@/components/site/DraftPreviewBanner";

interface Props {
  params: Promise<{
    slug: string;
    page?: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Data resolution helper
// ---------------------------------------------------------------------------
export async function resolveWebsiteAndPage(
  slug: string,
  pageSlugArr?: string[]
): Promise<{
  website: TenantWebsite | null;
  targetPage: WebsitePage | null;
  navItems: WebsiteNavigation["items"];
  isTeamMember: boolean;
}> {
  const supabaseAdmin = createSupabaseAdmin();

  // 1. Fetch website by slug
  const { data: websiteRow } = await supabaseAdmin
    .from("tenant_websites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!websiteRow) {
    return { website: null, targetPage: null, navItems: [], isTeamMember: false };
  }

  const website = websiteRow as TenantWebsite;

  // 2. Determine auth & team membership for draft preview
  let isTeamMember = false;
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const [memberCheck, adminCheck] = await Promise.all([
        hasEntityAccess(
          user.id,
          website.tenant_id,
          ENTITY_ROLES_ALL
        ),
        isAdmin(),
      ]);
      isTeamMember = memberCheck || adminCheck;
    }
  } catch {
    isTeamMember = false;
  }


  // 3. Access gate for website
  if (website.status !== "published" && !isTeamMember) {
    return { website: null, targetPage: null, navItems: [], isTeamMember: false };
  }

  // 4. Fetch pages — public visitors and team members fetch from website_pages
  const { data: pageRows } = await supabaseAdmin
    .from("website_pages")
    .select("*")
    .eq("website_id", website.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const allPages = (pageRows || []) as unknown as WebsitePage[];
  const publishedPages = allPages.filter((p) => p.status === "published");
  const visiblePages = isTeamMember ? allPages : publishedPages;

  // 5. Determine target page
  let targetPage: WebsitePage | null = null;
  const requestedPageSlug = pageSlugArr && pageSlugArr.length > 0 ? pageSlugArr[0] : null;

  if (!requestedPageSlug) {
    // Deterministic Homepage resolution hierarchy:
    // 1. is_home = true
    // 2. slug = 'home'
    // 3. First page ordered by sort_order ASC, created_at ASC, id ASC
    targetPage =
      visiblePages.find((p) => p.is_home) ||
      visiblePages.find((p) => p.slug === "home") ||
      visiblePages[0] ||
      null;
  } else {
    targetPage = visiblePages.find((p) => p.slug === requestedPageSlug) || null;
  }

  // If team member is previewing, overlay working draft blocks from website_page_drafts if present
  if (targetPage && isTeamMember) {
    const { data: draftRow } = await supabaseAdmin
      .from("website_page_drafts")
      .select("blocks")
      .eq("page_id", targetPage.id)
      .maybeSingle();

    if (draftRow?.blocks && Array.isArray(draftRow.blocks)) {
      targetPage = {
        ...targetPage,
        blocks: draftRow.blocks,
      };
    }
  }

  // 6. Fetch navigation and sanitize staleness
  const { data: navRow } = await supabaseAdmin
    .from("website_navigation")
    .select("*")
    .eq("website_id", website.id)
    .maybeSingle();

  const rawNavItems = (navRow?.items as WebsiteNavigation["items"]) || [];
  const publishedPageIds = new Set(publishedPages.map((p) => p.id));
  
  // Prune nav links to unpublished pages unless user is team member previewing
  const filteredNavItems = isTeamMember
    ? rawNavItems
    : filterPublishedNavItems(rawNavItems, publishedPageIds);

  // Normalize nav hrefs to point to /site/[slug]/[pageSlug] or /site/[slug]
  const normalizedNavItems = filteredNavItems.map((item) => {
    let href = item.href;
    if (href === "/" || href === "") {
      href = `/site/${website.slug}`;
    } else if (href.startsWith("/")) {
      href = `/site/${website.slug}${href}`;
    }
    return {
      ...item,
      href,
      children: item.children?.map((child) => {
        let childHref = child.href;
        if (childHref === "/" || childHref === "") {
          childHref = `/site/${website.slug}`;
        } else if (childHref.startsWith("/")) {
          childHref = `/site/${website.slug}${childHref}`;
        }
        return { ...child, href: childHref };
      }),
    };
  });

  return {
    website,
    targetPage,
    navItems: normalizedNavItems,
    isTeamMember,
  };
}

// ---------------------------------------------------------------------------
// Dynamic SEO Metadata Generation
// ---------------------------------------------------------------------------
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, page: pageSlugArr } = await params;
  const { website, targetPage } = await resolveWebsiteAndPage(slug, pageSlugArr);

  if (!website || !targetPage) {
    return {
      title: "Page Not Found",
      robots: { index: false, follow: false },
    };
  }

  const baseUrl = getTenantSiteBaseUrl(website.slug);
  const canonicalUrl = targetPage.is_home
    ? baseUrl
    : `${baseUrl}/${targetPage.slug}`;

  const title =
    targetPage.seo_title ||
    `${targetPage.title} | ${website.site_title}`;
  const description =
    targetPage.seo_description ||
    website.seo_description ||
    website.site_tagline ||
    "";
  const ogImage =
    targetPage.seo_og_image || website.seo_og_image || undefined;

  const isNoIndex = website.status !== "published" || targetPage.status !== "published";

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: isNoIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: website.site_title,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Public Tenant Website Page Component
// ---------------------------------------------------------------------------
export default async function TenantWebsitePublicPage({ params }: Props) {
  const { slug, page: pageSlugArr } = await params;
  const { website, targetPage, navItems, isTeamMember } =
    await resolveWebsiteAndPage(slug, pageSlugArr);

  if (!website || !targetPage) {
    notFound();
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://aldriva.com";
  const websiteStructuredData = getWebsiteJsonLd(website, appUrl);
  const pageStructuredData = getPageJsonLd(website, targetPage, appUrl);
  
  const tokens = resolveThemeTokens(
    website.theme_config?.theme,
    website.theme_config?.primaryColor,
    website.theme_config?.darkMode
  );
  const themeStyle = {
    ...themeTokensToStyle(tokens),
    ...themeConfigToStyle(website.theme_config),
  };

  const blocks = (targetPage.blocks as unknown[]) || [];

  return (
    <div
      style={themeStyle}
      className={`min-h-screen flex flex-col bg-white text-zinc-900 ${
        website.theme_config?.darkMode ? "dark" : ""
      }`}
    >
      {/* Injected JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteStructuredData).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(pageStructuredData).replace(/</g, "\\u003c"),
        }}
      />

      {/* Preview Mode Banner for Authenticated Team Members */}
      {isTeamMember && (
        <DraftPreviewBanner
          status={website.status}
          isPageDraft={targetPage.status !== "published"}
        />
      )}

      {/* Branded Site Header */}
      <SiteHeader
        siteTitle={website.site_title}
        siteSlug={website.slug}
        headerConfig={website.header_config}
        navItems={navItems}
        primaryColor={website.theme_config.primaryColor}
      />

      {/* Page Body / Block Renderer */}
      <main className="flex-1">
        {blocks.length === 0 ? (
          <div className="mx-auto max-w-4xl px-6 py-20 text-center text-zinc-500">
            <h2 className="text-xl font-semibold text-zinc-800">
              {targetPage.title}
            </h2>
            <p className="mt-2 text-sm">
              This page has no content blocks yet. Add blocks in the Organization Dashboard.
            </p>
          </div>
        ) : (
          blocks.map((block, idx) => (
            <BlockRenderer
              key={idx}
              block={block}
              tenantId={website.tenant_id}
              isTeamMember={isTeamMember}
            />
          ))
        )}
      </main>

      {/* Branded Site Footer */}
      <SiteFooter
        siteTitle={website.site_title}
        footerConfig={website.footer_config}
        primaryColor={website.theme_config.primaryColor}
      />
    </div>
  );
}
