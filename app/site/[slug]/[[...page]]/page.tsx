import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { hasEntityAccess, ENTITY_ROLES_ALL } from "@/lib/entity-auth";
import { isAdmin } from "@/lib/auth";
import {
  isValidLocale,
  getLocaleFromAcceptLanguage,
  type Locale,
} from "@/i18n/routing";
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
import {
  getV2TemplateForWebsite,
  resolveStorefrontCurrency,
  v2ThemeStyle,
} from "@/lib/website-v2-theme";
import { normalizeContent, type ContentDoc } from "@/lib/website-content";
import { getBusinessOfferings } from "@/lib/business-offerings";
import {
  resolveTemplateContent,
  type ResolvedTemplate,
} from "@/lib/website-template-resolver";
import { FLAGSHIP_SAMPLES } from "@/lib/website-template-samples";
import type { WebsiteTemplateV2 } from "@/lib/website-template-v2";
import { resolveOrderSchedule } from "@/lib/website-hours";
import type { StorefrontOrderConfig } from "@/components/site/blocks/StorefrontBrowse";
import { BlockRenderer } from "@/components/site/blocks/BlockRenderer";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { V2SiteHeader } from "@/components/site/v2/V2SiteHeader";
import { V2SiteFooter } from "@/components/site/v2/V2SiteFooter";
import { DraftPreviewBanner } from "@/components/site/DraftPreviewBanner";

interface Props {
  params: Promise<{
    slug: string;
    page?: string[];
  }>;
}

interface V2RouteContent {
  template: WebsiteTemplateV2;
  content: ContentDoc;
  samples: ContentDoc;
  resolved: ResolvedTemplate;
}

function templateNavigationHref(href: string, siteSlug: string): string {
  if (href === "/" || href === "") return "/site/" + siteSlug;
  if (href.startsWith("/")) return "/site/" + siteSlug + href;
  return href;
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
  v2Content?: V2RouteContent;
  currency: string;
  currencyLocale: Locale;
}> {
  const supabaseAdmin = createSupabaseAdmin();

  // 1. Fetch website by slug
  const { data: websiteRow } = await supabaseAdmin
    .from("tenant_websites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!websiteRow) {
    return { website: null, targetPage: null, navItems: [], isTeamMember: false, currency: "USD", currencyLocale: "en" };
  }

  const website = websiteRow as TenantWebsite;

  // Request locale mirrors i18n/request.ts (cookie → Accept-Language → en).
  // Guarded: unit tests call this resolver outside a request scope.
  let currencyLocale: Locale = "en";
  try {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
    currencyLocale =
      cookieLocale && isValidLocale(cookieLocale)
        ? cookieLocale
        : getLocaleFromAcceptLanguage(headerStore.get("accept-language"));
  } catch {
    currencyLocale = "en";
  }

  // Storefront currency: explicit metadata value wins, else the first linked
  // business's country (CI → XOF), else USD so legacy sites never change.
  const { data: countryRow } = await supabaseAdmin
    .from("businesses")
    .select("country, industry, category, business_type, offerings, created_at")
    .eq("organizer_id", website.tenant_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const linkedBusiness = countryRow as {
    country?: string | null;
    industry?: string | null;
    category?: string | null;
    business_type?: string | null;
    offerings?: unknown;
  } | null;
  const currency = resolveStorefrontCurrency(
    (website as { metadata?: unknown }).metadata,
    linkedBusiness?.country ?? null
  );

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
    return { website: null, targetPage: null, navItems: [], isTeamMember: false, currency, currencyLocale };
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

  const v2Template = getV2TemplateForWebsite(website.metadata);
  if (v2Template) {
    const { data: liveContentRow } = await supabaseAdmin
      .from("website_content")
      .select("content")
      .eq("website_id", website.id)
      .maybeSingle();
    let rawContent = liveContentRow?.content ?? {};
    if (isTeamMember) {
      const { data: draftContentRow } = await supabaseAdmin
        .from("website_content_drafts")
        .select("content")
        .eq("website_id", website.id)
        .maybeSingle();
      if (draftContentRow) rawContent = draftContentRow.content ?? {};
    }
    const content = normalizeContent(rawContent);
    const storeT = await getTranslations("Storefront");
    const offeringT = await getTranslations("BusinessOfferings");
    const businessType = linkedBusiness?.business_type ?? null;
    const businessCategory = linkedBusiness?.category ?? "";
    const catalog = getBusinessOfferings(businessType, businessCategory);
    const getOfferingLabel = offeringT as unknown as (key: string) => string;
    const metadata = website.metadata && typeof website.metadata === "object"
      ? website.metadata as Record<string, unknown>
      : {};
    const businessOfferings = Array.isArray(linkedBusiness?.offerings)
      ? linkedBusiness.offerings.filter((key): key is string => typeof key === "string")
      : [];
    const resolved = resolveTemplateContent(
      v2Template.id,
      v2Template.version,
      content,
      {
        includeSamples: false,
        includeSourceMap: false,
        currency,
        business: {
          industry: linkedBusiness?.industry ?? "",
          category: businessCategory,
          businessType,
          offerings: businessOfferings,
          offeringLabels: Object.fromEntries(catalog.map((offering) => [offering.key, getOfferingLabel(`labels.${offering.labelKey}`)])),
        },
        viewMenuLabel: storeT("viewMenu"),
        rentalContactCta: storeT("rentalContactCta"),
        primaryActionLabels: {
          orderNow: storeT("orderNow"),
          reserveTable: storeT("reserveTable"),
          bookNow: storeT("bookNow"),
          viewMenu: storeT("viewMenu"),
          contact: storeT("contact"),
          rentalContactCta: storeT("rentalContactCta"),
        },
        offeringsHeading: storeT("whatWeOffer"),
        restaurantCtaBandHeading: storeT("restaurantBrandMessage"),
        rentalCtaBandHeading: storeT("rentalBrandMessage"),
        timeZone: typeof metadata.timezone === "string" ? metadata.timezone : undefined,
      }
    );
    const emittedBySlug = new Map(resolved.pages.map((page) => [page.slug, page]));
    const visibleV2Pages = visiblePages.filter((page) => emittedBySlug.has(page.slug));
    const requestedPageSlug = pageSlugArr && pageSlugArr.length > 0 ? pageSlugArr[0] : null;
    const resolvedTarget = requestedPageSlug
      ? emittedBySlug.get(requestedPageSlug)
      : resolved.pages.find((page) => page.isHome) ?? resolved.pages[0];
    const pageRow = resolvedTarget
      ? visibleV2Pages.find((page) => page.slug === resolvedTarget.slug)
      : undefined;
    const targetPage = pageRow && resolvedTarget
      ? {
          ...pageRow,
          title: resolvedTarget.title,
          is_home: resolvedTarget.isHome,
          blocks: resolvedTarget.blocks,
        } as WebsitePage
      : null;
    const visibleV2Slugs = new Set(visibleV2Pages.map((page) => page.slug));
    const routeNavigation = resolved.navigation
      .filter((item) => !item.pageSlug || visibleV2Slugs.has(item.pageSlug))
      .map((item) => ({
        ...item,
        href: templateNavigationHref(item.href, website.slug),
        page_id: item.pageSlug
          ? visibleV2Pages.find((page) => page.slug === item.pageSlug)?.id ?? null
          : null,
      }));
    const routeResolved = { ...resolved, navigation: routeNavigation };

    return {
      website,
      targetPage,
      navItems: routeNavigation,
      isTeamMember,
      currency,
      currencyLocale,
      v2Content: {
        template: v2Template,
        content,
        samples: FLAGSHIP_SAMPLES[v2Template.id] ?? {},
        resolved: routeResolved,
      },
    };
  }

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
    currency,
    currencyLocale,
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
  const { website, targetPage, navItems, isTeamMember, v2Content, currency, currencyLocale } =
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
  // Template-first sites use locked tokens and v2 chrome. Legacy sites retain
  // their existing SiteHeader/SiteFooter components.
  const v2Template = v2Content?.template;
  const themeStyle = {
    ...themeTokensToStyle(tokens),
    ...themeConfigToStyle(website.theme_config),
    ...(v2Template ? v2ThemeStyle(v2Template) : {}),
    ...(v2Template
      ? { backgroundColor: v2Template.templateBackground.base }
      : {}),
  };

  let orderConfig: StorefrontOrderConfig | undefined;
  if (v2Content?.resolved.storefrontFeatures.ordering) {
    const websiteMeta = (website.metadata && typeof website.metadata === "object" ? website.metadata : {}) as Record<string, unknown>;
    const timeZone = typeof websiteMeta.timezone === "string" ? websiteMeta.timezone : undefined;
    const schedule = resolveOrderSchedule(v2Content.content.hours, timeZone);
    const offerings: string[] = [];
    if (v2Content.resolved.storefrontFeatures.pickup) offerings.push("pickup");
    if (v2Content.resolved.storefrontFeatures.delivery) offerings.push("delivery");

    orderConfig = {
      enabled: true,
      slug: website.slug,
      currency: currency || "USD",
      offerings,
      onlinePayment: v2Content.resolved.storefrontFeatures.onlinePayment === true,
      isClosed: !schedule.isOpen,
      scheduledFor: schedule.scheduledFor,
      blocked: schedule.blocked,
      blockReason: schedule.message,
    };
  }

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
      {v2Content && v2Template ? (
        <V2SiteHeader
          template={v2Template}
          content={v2Content.content}
          sampleContent={v2Content.samples}
          navigation={v2Content.resolved.navigation}
          siteTitle={website.site_title}
          siteSlug={website.slug}
          previewMode={isTeamMember}
          editMode={isTeamMember}
          sourceMap={v2Content.resolved.chromeSourceMap.menuBar}
          storefrontFeatures={v2Content.resolved.storefrontFeatures}
          primaryAction={v2Content.resolved.primaryAction.primary}
        />
      ) : (
        <SiteHeader
          siteTitle={website.site_title}
          siteSlug={website.slug}
          headerConfig={website.header_config}
          navItems={navItems}
          primaryColor={website.theme_config.primaryColor}
        />
      )}

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
              key={typeof block === "object" && block !== null && "id" in block ? String(block.id) : idx}
              block={block}
              tenantId={website.tenant_id}
              isTeamMember={isTeamMember}
              editMode={Boolean(v2Content && isTeamMember)}
              sourceMap={v2Content?.resolved.sourceMap}
              currency={currency}
              currencyLocale={currencyLocale}
              orderConfig={orderConfig}
            />
          ))
        )}
      </main>

      {/* Branded Site Footer */}
      {v2Content && v2Template ? (
        <V2SiteFooter
          template={v2Template}
          content={v2Content.content}
          sampleContent={v2Content.samples}
          navigation={v2Content.resolved.navigation}
          siteTitle={website.site_title}
          siteSlug={website.slug}
          previewMode={isTeamMember}
          editMode={isTeamMember}
          sourceMap={v2Content.resolved.chromeSourceMap.footer}
          storefrontFeatures={v2Content.resolved.storefrontFeatures}
          todayHours={v2Content.resolved.todayHours}
        />
      ) : (
        <SiteFooter
          siteTitle={website.site_title}
          footerConfig={website.footer_config}
          primaryColor={website.theme_config.primaryColor}
        />
      )}
    </div>
  );
}
