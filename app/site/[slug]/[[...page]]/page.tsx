import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { savannahArimoFont } from "@/lib/site-fonts";
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
  getWebsiteBackgroundPattern,
  getV2TemplateForWebsite,
  resolveStorefrontCurrency,
  v2ThemeStyle,
} from "@/lib/website-v2-theme";
import { normalizeContent, type ContentDoc } from "@/lib/website-content";
import { getBusinessOfferings } from "@/lib/business-offerings";
import { buildWebsiteTemplateResolverInputs } from "@/lib/website-template-site-inputs";
import { getWebsiteCatalogAvailability } from "@/lib/website-catalog-adapter";
import { getFoodOrderLocalizedCopy, getStoreLocalizedCopy } from "@/lib/website-v2-template-preview";
import {
  resolveTemplateContent,
  selectTemplateRoutePage,
  type ResolvedTemplate,
} from "@/lib/website-template-resolver";
import { FLAGSHIP_SAMPLES } from "@/lib/website-template-samples";
import type { WebsiteTemplateV2 } from "@/lib/website-template-v2";
import { resolveOrderSchedule } from "@/lib/website-hours";
import type { StorefrontOrderConfig } from "@/components/site/blocks/StorefrontBrowse";
import type { StorefrontReservationConfig } from "@/components/site/blocks/ReservationForm";
import { extractDeliverySettings } from "@/lib/delivery-settings";
import { extractReservationSettings } from "@/lib/reservation-settings";
import { getOrgApproval } from "@/lib/server-approval";
import { canTakeOrders } from "@/lib/business-approval";
import { resolveSiteHref } from "@/lib/site-paths";
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

const tableFlameFont = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: "500",
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
});

interface V2RouteContent {
  template: WebsiteTemplateV2;
  content: ContentDoc;
  samples: ContentDoc;
  resolved: ResolvedTemplate;
  availablePageSlugs: string[];
}

function applyTableFlameSectionBands(
  blocks: unknown[],
  palette: Record<string, string>,
  backgroundPattern: "none" | "dots"
): unknown[] {
  let sectionIndex = 0;
  return blocks.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const block = value as Record<string, unknown>;
    if (block.type === "menu_order" || block.visible === false) return value;
    if (block.type === "cta_banner") {
      return { ...block, variant: "footer", background: { color: palette["--tf-band"] } };
    }
    const isBase = sectionIndex % 2 === 0;
    sectionIndex += 1;
    return {
      ...block,
      background: {
        color: isBase ? palette["--tf-base"] : palette["--tf-subtle"],
        ...(isBase && block.type !== "hero" && backgroundPattern === "dots" ? { pattern: "dots" } : {}),
      },
    };
  });
}

function applySavannahSectionBands(
  blocks: unknown[],
  palette: Record<string, string>
): unknown[] {
  let sectionIndex = 0;
  return blocks.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const block = value as Record<string, unknown>;
    if (block.type === "menu_order" || block.visible === false) return value;
    if (block.type === "cta_banner") {
      if ((block as any).variant === "promo") return value;
      return { ...block, variant: "footer", background: { color: palette["--tf-band"] } };
    }
    if (block.type === "hero") return value;
    const isBase = sectionIndex % 2 === 0;
    sectionIndex += 1;
    return { ...block, background: { color: isBase ? palette["--tf-base"] : palette["--tf-subtle"] } };
  });
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
    .select("id, country, industry, category, business_type, offerings, created_at")
    .eq("organizer_id", website.tenant_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const linkedBusiness = countryRow as {
    id?: string | null;
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
    const publicT = await getTranslations("PublicSite");
    const offeringT = await getTranslations("BusinessOfferings");
    const businessType = linkedBusiness?.business_type ?? null;
    const businessCategory = linkedBusiness?.category ?? "";
    const catalog = getBusinessOfferings(businessType, businessCategory);
    const getOfferingLabel = offeringT as unknown as (key: string) => string;
    const metadata = website.metadata && typeof website.metadata === "object"
      ? website.metadata as Record<string, unknown>
      : {};
    const siteResolverInputs = buildWebsiteTemplateResolverInputs({
      siteSlug: website.slug,
      currency,
      metadata,
      linkedBusiness,
    });
    const catalogAvailability = await getWebsiteCatalogAvailability(
      supabaseAdmin,
      website.tenant_id,
      linkedBusiness?.id
    );
    const reservationsApproved = canTakeOrders(await getOrgApproval(website.tenant_id));
    const resolved = resolveTemplateContent(
      v2Template.id,
      v2Template.version,
      content,
      {
        ...siteResolverInputs,
        catalogAvailability,
        catalogLabels: { products: storeT("products"), featuredProducts: storeT("featuredProducts") },
        includeSamples: false,
        includeSourceMap: false,
        availablePageSlugs: visiblePages.map((page) => page.slug),
        business: {
          ...siteResolverInputs.business,
          offeringLabels: Object.fromEntries(catalog.map((offering) => [offering.key, getOfferingLabel(`labels.${offering.labelKey}`)])),
        },
        reservationsApproved,
        viewMenuLabel: storeT("viewMenu"),
        rentalContactCta: storeT("rentalContactCta"),
        primaryActionLabels: {
          orderNow: storeT("orderNow"),
          reserveTable: storeT("reserveTable"),
          bookNow: storeT("bookNow"),
          viewMenu: storeT("viewMenu"),
          viewProducts: storeT("viewProducts"),
          shopNow: storeT("shopNow"),
          contact: storeT("contact"),
          rentalContactCta: storeT("rentalContactCta"),
        },
        offeringsHeading: storeT("whatWeOffer"),
        restaurantCtaBandHeading: storeT("restaurantBrandMessage"),
        rentalCtaBandHeading: storeT("rentalBrandMessage"),
        foodOrderCopy: v2Template.id === "food-order"
          ? getFoodOrderLocalizedCopy(publicT as unknown as (key: string, values?: Record<string, string>) => string).resolver
          : undefined,
        storeCopy: v2Template.id === "store"
          ? getStoreLocalizedCopy(publicT as unknown as (key: string, values?: Record<string, string>) => string).resolver
          : undefined,
      }
    );
    const requestedPageSlug = pageSlugArr && pageSlugArr.length > 0 ? pageSlugArr[0] : null;
    const routeSelection = selectTemplateRoutePage(resolved.pages, visiblePages, requestedPageSlug);
    const visibleV2Pages = routeSelection.pages;
    const targetPage = routeSelection.target
      ? {
          ...routeSelection.target.row,
          title: routeSelection.target.page.title,
          is_home: routeSelection.target.page.isHome,
          blocks: routeSelection.target.page.blocks,
        } as WebsitePage
      : null;
    const visibleV2Slugs = new Set(visibleV2Pages.map((page) => page.slug));
    const routeNavigation = resolved.navigation
      .filter((item) => !item.pageSlug || visibleV2Slugs.has(item.pageSlug))
      .map((item) => ({
        ...item,
        href: resolveSiteHref(website.slug, item.href),
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
        availablePageSlugs: routeSelection.availablePageSlugs,
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
    ...(v2Template ? v2ThemeStyle(v2Template, website.metadata) : {}),
    ...(v2Template
      ? { backgroundColor: v2Template.palettes?.length
          ? v2ThemeStyle(v2Template, website.metadata)["--tf-base"]
          : v2Template.templateBackground.base }
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

    const deliverySettings = extractDeliverySettings(website.metadata);

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
      deliveryFee: deliverySettings.fee,
      freeDeliveryAbove: deliverySettings.free_above,
    };
  }

  let reservationConfig: StorefrontReservationConfig | undefined;
  if (v2Content?.resolved.storefrontFeatures.reservations) {
    const websiteMeta = (website.metadata && typeof website.metadata === "object" ? website.metadata : {}) as Record<string, unknown>;
    const timeZone = typeof websiteMeta.timezone === "string" && websiteMeta.timezone.trim()
      ? websiteMeta.timezone.trim()
      : "Africa/Abidjan";
    const reservationSettings = extractReservationSettings(website.metadata);
    // Render follows the feature gate (like ordering); the submit action
    // re-checks approval, settings, and slots authoritatively.
    reservationConfig = {
      enabled: true,
      slug: website.slug,
      settings: reservationSettings,
      timeZone,
      hours: v2Content.content.hours ?? null,
    };
  }

  const rawBlocks = (targetPage.blocks as unknown[]) || [];
  const tableFlame = v2Template?.id === "restaurant-table-flame";
  const savannah = v2Template?.id === "restaurant-savannah";
  const backgroundPattern = tableFlame && v2Template
    ? getWebsiteBackgroundPattern(v2Template, website.metadata)
    : "none";
  const blocks = tableFlame && v2Template
    ? applyTableFlameSectionBands(rawBlocks, v2ThemeStyle(v2Template, website.metadata), backgroundPattern)
    : savannah && v2Template
      ? applySavannahSectionBands(rawBlocks, v2ThemeStyle(v2Template, website.metadata))
      : rawBlocks;
  const firstResolvedBlock = rawBlocks.find((value) =>
    value && typeof value === "object" && !Array.isArray(value) &&
    (value as Record<string, unknown>).type !== "menu_order" &&
    (value as Record<string, unknown>).visible !== false
  ) as Record<string, unknown> | undefined;
  const startsWithScrimHero = Boolean(
    (tableFlame || savannah) && firstResolvedBlock?.type === "hero" &&
    firstResolvedBlock.variant === "full-bleed" && firstResolvedBlock.scrim === true
  );

  return (
    <div
      style={themeStyle}
      data-site-template={v2Template?.id}
      data-background-pattern={tableFlame ? backgroundPattern : undefined}
      className={savannah
        ? `public-site min-h-screen flex flex-col bg-[var(--ps-surface)] text-[var(--ps-text)] ${savannahArimoFont.variable} ${website.theme_config?.darkMode ? "dark" : ""}`
        : `public-site min-h-screen flex flex-col bg-[var(--ps-surface)] text-[var(--ps-text)] ${tableFlame ? tableFlameFont.variable : ""} ${website.theme_config?.darkMode ? "dark" : ""}`}
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
          availablePageSlugs={v2Content.availablePageSlugs}
          overHero={startsWithScrimHero}
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
          <div className="mx-auto max-w-4xl px-[var(--ps-space-6)] py-[var(--ps-space-16)] text-center text-[var(--ps-muted)]">
            <h2 className="text-xl font-semibold text-[var(--ps-text)]">
              {targetPage.title}
            </h2>
            <p className="mt-[var(--ps-space-2)] text-sm">
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
              scopeInternalLinks={Boolean(v2Content)}
              sourceMap={v2Content?.resolved.sourceMap}
              currency={currency}
              currencyLocale={currencyLocale}
              orderConfig={orderConfig}
              reservationConfig={reservationConfig}
              siteSlug={website.slug}
              accentColor={v2Template
                ? v2ThemeStyle(v2Template, website.metadata)["--ps-accent"]
                : (typeof website.theme_config?.primaryColor === "string" ? website.theme_config.primaryColor : undefined)}
              siteTemplateId={v2Template?.id}
              sectionAlign={v2Template?.sectionAlign}
              businessName={typeof v2Content?.content.business_name === "string" ? v2Content.content.business_name : website.site_title}
              businessLogo={typeof v2Content?.content.logo_url === "string" ? v2Content.content.logo_url : undefined}
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
          availablePageSlugs={v2Content.availablePageSlugs}
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
