import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { savannahArimoFont } from "@/lib/site-fonts";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { cacheLife } from "next/cache";
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
import { normalizeContent, resolveBookingHours, type ContentDoc } from "@/lib/website-content";
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
import { resolveWebsiteTimezone } from "@/lib/date-timezone";
import { resolveAcceptOrdersWhenClosed } from "@/lib/storefront-settings";
import { isGeneralBookingsLive } from "@/lib/storefront-features";
import { getCapabilitiesForBusiness } from "@/lib/business-taxonomy";
import type { StorefrontOrderConfig } from "@/components/site/blocks/StorefrontBrowse";
import type { StorefrontGeneralBookingConfig } from "@/components/site/reservations/GeneralBookingForm";
import { extractDeliverySettings } from "@/lib/delivery-settings";
import { isOnlinePaymentCurrencySupported } from "@/lib/storefront-features";
import { extractReservationSettings } from "@/lib/reservation-settings";
import { getOrgApproval } from "@/lib/server-approval";
import { canTakeOrders } from "@/lib/business-approval";
import { resolveSiteHref, resolveServiceDetailBookHref } from "@/lib/site-paths";
import { BlockRenderer } from "@/components/site/blocks/BlockRenderer";
import type { CtaBannerBlock } from "@/lib/website-blocks";
import { getPublicServicesCatalog, validatePublicServiceId, type PublicServicesCatalog } from "@/lib/services-public-data";
import { resolveServicesVirtualRoute, getCachedServicesVirtualRouteSeo, type ServicesVirtualRoute } from "@/lib/services-virtual-route";
import { ServiceCategoryPage } from "@/components/site/services/ServiceCategoryPage";
import { ServiceDetailPage } from "@/components/site/services/ServiceDetailPage";
import { ServicesIndexSection } from "@/components/site/services/ServicesIndexSection";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { V2SiteHeader } from "@/components/site/v2/V2SiteHeader";
import { V2SiteFooter } from "@/components/site/v2/V2SiteFooter";
import { DraftPreviewBanner } from "@/components/site/DraftPreviewBanner";
import type { StorefrontRentalConfig } from "@/components/site/blocks/rental/types";
import { listPublicRentalCategories, listPublicRentalBranches } from "@/lib/actions/rental-public";
import { getRentalSettings } from "@/lib/actions/rental-settings";
import { TABLE_CONTEXT_COOKIE, type TableContextPayload } from "@/lib/table-qr";
import { safeImageSrc } from "@/lib/image-url";

interface Props {
  params: Promise<{
    slug: string;
    page?: string[];
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  servicesRoute?: ServicesVirtualRoute;
  servicesCatalog: PublicServicesCatalog | null;
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

interface LinkedBusinessRecord {
  id?: string | null;
  country?: string | null;
  industry?: string | null;
  category?: string | null;
  business_type?: string | null;
  offerings?: unknown;
  table_ordering_mode?: string | null;
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
  hasPublishedMenuPage: boolean;
  linkedBusiness?: LinkedBusinessRecord | null;
}> {
  const supabaseAdmin = createSupabaseAdmin();

  // 1. Fetch website by slug
  const { data: websiteRow } = await supabaseAdmin
    .from("tenant_websites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!websiteRow) {
    return { website: null, targetPage: null, navItems: [], isTeamMember: false, currency: "USD", currencyLocale: "en", hasPublishedMenuPage: false, linkedBusiness: null };
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
    .select("id, country, industry, category, business_type, offerings, table_ordering_mode, created_at")
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
    table_ordering_mode?: string | null;
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
    return { website: null, targetPage: null, navItems: [], isTeamMember: false, currency, currencyLocale, hasPublishedMenuPage: false };
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

    // Public /services virtual route tree (categories + service detail
    // pages): only fetched when the real Services page is visible to this
    // viewer — if they can't see /services, they can't see its children.
    const servicesCatalog = visibleV2Slugs.has("services")
      ? await getPublicServicesCatalog(website.tenant_id, isTeamMember)
      : null;
    const servicesRoute = resolveServicesVirtualRoute(pageSlugArr, servicesCatalog);

    return {
      website,
      targetPage,
      navItems: routeNavigation,
      isTeamMember,
      currency,
      currencyLocale,
      hasPublishedMenuPage: routeSelection.pages.some((page) => page.slug === "menu" && page.status === "published"),
      v2Content: {
        template: v2Template,
        content,
        samples: FLAGSHIP_SAMPLES[v2Template.id] ?? {},
        resolved: routeResolved,
        availablePageSlugs: routeSelection.availablePageSlugs,
        servicesRoute,
        servicesCatalog,
      },
      linkedBusiness,
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
    hasPublishedMenuPage: publishedPages.some((page) => page.slug === "menu"),
    linkedBusiness,
  };
}

// ---------------------------------------------------------------------------
// Dynamic SEO Metadata Generation
// ---------------------------------------------------------------------------
async function getCachedPublicPageSeo(slug: string, requestedPageSlug: string | null) {
  "use cache";
  cacheLife({ revalidate: 60 });

  const admin = createSupabaseAdmin();
  const { data: website } = await admin
    .from("tenant_websites")
    .select("id, slug, status, site_title, seo_description, site_tagline, seo_og_image")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!website) return null;

  let pagesQuery = admin
    .from("website_pages")
    .select("title, slug, seo_title, seo_description, seo_og_image, is_home, status")
    .eq("website_id", website.id)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (requestedPageSlug) pagesQuery = pagesQuery.eq("slug", requestedPageSlug);

  const { data: pageRows } = await pagesQuery;
  const pages = pageRows ?? [];
  const targetPage = requestedPageSlug
    ? pages[0]
    : pages.find((page) => page.is_home) ??
      pages.find((page) => page.slug === "home") ??
      pages[0];

  if (!targetPage) return null;
  return { website, targetPage };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, page: pageSlugArr } = await params;
  const requestedPageSlug = pageSlugArr?.[0] ?? null;

  if (requestedPageSlug === "services" && pageSlugArr && pageSlugArr.length > 1) {
    const virtualSeo = await getCachedServicesVirtualRouteSeo(slug, pageSlugArr.slice(1));
    if (!virtualSeo) {
      return { title: "Page Not Found", robots: { index: false, follow: false } };
    }
    const servicesSeo = await getCachedPublicPageSeo(slug, "services");
    const siteTitle = servicesSeo?.website.site_title ?? slug;
    const title = `${virtualSeo.title} | ${siteTitle}`;
    const description = virtualSeo.description ?? undefined;
    return {
      title,
      description,
      robots: { index: true, follow: true },
      openGraph: { title, description, siteName: siteTitle, type: "website" },
      twitter: { card: "summary_large_image", title, description },
    };
  }

  const seo = await getCachedPublicPageSeo(slug, requestedPageSlug);

  if (!seo) {
    return {
      title: "Page Not Found",
      robots: { index: false, follow: false },
    };
  }

  const { website, targetPage } = seo;

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
export default async function TenantWebsitePublicPage({ params, searchParams }: Props) {
  const { slug, page: pageSlugArr } = await params;
  const sp = searchParams ? await searchParams : {};
  const { website, targetPage, navItems, isTeamMember, v2Content, currency, currencyLocale, hasPublishedMenuPage, linkedBusiness } =
    await resolveWebsiteAndPage(slug, pageSlugArr);

  if (!website) {
    notFound();
  }
  const servicesRoute = v2Content?.servicesRoute;
  if (servicesRoute?.kind === "notFound") {
    notFound();
  }
  if (!targetPage) {
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
    const timeZone = resolveWebsiteTimezone(website.metadata);
    const acceptOrdersWhenClosed = resolveAcceptOrdersWhenClosed(website.metadata);
    const schedule = resolveOrderSchedule(v2Content.content.hours, timeZone, new Date(), {
      acceptOrdersWhenClosed,
    });
    const offerings: string[] = [];
    if (v2Content.resolved.storefrontFeatures.pickup) offerings.push("pickup");
    if (v2Content.resolved.storefrontFeatures.delivery) offerings.push("delivery");

    const deliverySettings = extractDeliverySettings(website.metadata);

    // Read Table / QR context from cookie or query params
    const cookieStore = await cookies();
    const tableCtxCookie = cookieStore.get(TABLE_CONTEXT_COOKIE)?.value;
    let tableId: string | null = null;
    let tableLabel: string | null = null;
    let qrCode: string | null = null;
    let tableOrderingMode: string | null = linkedBusiness?.table_ordering_mode || null;

    if (tableCtxCookie) {
      try {
        const parsed = JSON.parse(tableCtxCookie) as TableContextPayload;
        // Verify tenant or business isolation: match organizerId or businessId
        if (
          parsed &&
          (parsed.organizerId === website.tenant_id ||
            parsed.businessId === linkedBusiness?.id ||
            parsed.businessId === website.tenant_id)
        ) {
          tableId = parsed.tableId;
          tableLabel = parsed.tableLabel;
          qrCode = parsed.qrCode;
          if (parsed.tableOrderingMode) {
            tableOrderingMode = parsed.tableOrderingMode;
          }
        }
      } catch {
        // ignore malformed cookie
      }
    }

    if (sp.qr_code && typeof sp.qr_code === "string") {
      qrCode = sp.qr_code;
    } else if (sp.qr && typeof sp.qr === "string") {
      qrCode = sp.qr;
    }

    if (sp.table && typeof sp.table === "string") {
      tableId = sp.table;
    }
    if (sp.table_label && typeof sp.table_label === "string") {
      tableLabel = sp.table_label;
    }

    if (tableId && linkedBusiness?.id) {
      const supabaseAdmin = createSupabaseAdmin();
      const { data: tableRow } = await supabaseAdmin
        .from("business_tables")
        .select("id, label, is_active")
        .eq("id", tableId)
        .eq("business_id", linkedBusiness.id)
        .maybeSingle();

      if (tableRow && tableRow.is_active) {
        tableLabel = tableRow.label;
        tableOrderingMode = linkedBusiness.table_ordering_mode || "order_pay_later";
        if (!offerings.includes("dine_in")) {
          offerings.push("dine_in");
        }
      } else {
        tableId = null;
        tableLabel = null;
        tableOrderingMode = null;
      }
    }

    orderConfig = {
      enabled: true,
      slug: website.slug,
      currency: currency || "USD",
      offerings,
      onlinePayment: v2Content.resolved.storefrontFeatures.onlinePayment === true && Boolean(process.env.STRIPE_SECRET_KEY),
      onlinePaymentUnavailableReason: !isOnlinePaymentCurrencySupported(currency)
        ? "unsupported_currency"
        : v2Content.resolved.storefrontFeatures.onlinePayment && !process.env.STRIPE_SECRET_KEY
          ? "stripe_not_configured"
          : undefined,
      isClosed: !schedule.isOpen,
      scheduledFor: schedule.scheduledFor,
      acceptOrdersWhenClosed,
      nextOpenTime: schedule.nextOpenTime ?? null,
      blocked: schedule.blocked,
      blockReason: schedule.message,
      deliveryFee: deliverySettings.fee,
      freeDeliveryAbove: deliverySettings.free_above,
      tableId,
      tableLabel,
      tableOrderingMode,
      qrCode,
      businessId: linkedBusiness?.id || null,
    };
  }

  let reservationConfig: StorefrontGeneralBookingConfig | undefined;
  const bookingCaps = getCapabilitiesForBusiness(
    linkedBusiness?.industry ?? "",
    linkedBusiness?.category ?? "",
    linkedBusiness?.business_type ?? ""
  );
  const reservationSettings = extractReservationSettings(website.metadata);
  const pageReservationsApproved = canTakeOrders(await getOrgApproval(website.tenant_id));
  const generalBookingsLive = isGeneralBookingsLive(
    bookingCaps,
    reservationSettings.enabled,
    pageReservationsApproved
  );
  if (
    (v2Content && v2Content.resolved.storefrontFeatures.reservations) ||
    generalBookingsLive
  ) {
    const timeZone = resolveWebsiteTimezone(website.metadata);
    // Render follows the feature gate (like ordering); the submit action
    // re-checks approval, settings, and slots authoritatively.
    reservationConfig = {
      enabled: true,
      slug: website.slug,
      settings: reservationSettings,
      timeZone,
      hours: resolveBookingHours(v2Content?.content.hours),
      phone:
        typeof v2Content?.content?.phone === "string" ? v2Content.content.phone : null,
      email:
        typeof v2Content?.content?.email === "string" ? v2Content.content.email : null,
    };
  }

  let rentalConfig: StorefrontRentalConfig | undefined;
  const isRentalBusiness = bookingCaps.includes("VEHICLES") || bookingCaps.includes("VEHICLE_RENTAL");
  if (isRentalBusiness && linkedBusiness?.id && website.tenant_id) {
    const orgId = website.tenant_id;
    const bizId = linkedBusiness.id;
    const [rentalCategories, rentalBranches, { settings: rentalSettings }] = await Promise.all([
      listPublicRentalCategories(orgId, bizId),
      listPublicRentalBranches(bizId),
      getRentalSettings(orgId, bizId),
    ]);

    rentalConfig = {
      enabled: true,
      organizerId: orgId,
      businessId: bizId,
      businessName:
        typeof v2Content?.content.business_name === "string"
          ? v2Content.content.business_name
          : website.site_title,
      siteSlug: website.slug,
      currency: currency || "USD",
      settings: rentalSettings,
      categories: rentalCategories,
      branches: rentalBranches,
    };
  }

  const rawBlocks = (targetPage.blocks as unknown[]) || [];
  const hasMenuEmbedOnPage = rawBlocks.some((value) =>
    Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).type === "menu_embed")
  );
  const hasGeneralBookingFormOnPage = rawBlocks.some((value) =>
    Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).type === "general_booking_form")
  );
  const requestedServiceId = typeof sp.service === "string" ? sp.service.trim() : "";
  const preselectedService =
    hasGeneralBookingFormOnPage && requestedServiceId && website.tenant_id
      ? await validatePublicServiceId(website.tenant_id, requestedServiceId)
      : null;
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

  // Virtual /services/<category|service> pages reuse the real Services
  // page's cta_banner block (same resolved content, no separate CMS field).
  const servicesCtaBlock = (v2Content?.resolved.pages
    .find((p) => p.slug === "services")
    ?.blocks.find((b) => (b as { type?: string }).type === "cta_banner") as CtaBannerBlock | undefined) ?? null;

  let bookHref: string | null = null;
  let bookLabel = "";
  if (servicesRoute?.kind === "service") {
    const storeT = await getTranslations("Storefront");
    const primary = v2Content?.resolved.primaryAction.primary;
    bookHref = resolveServiceDetailBookHref(website.slug, servicesRoute.service.id, primary);
    bookLabel = primary ? storeT(primary.labelKey) : storeT("contact");
  }

  const isServicesIndexPage = Boolean(v2Content?.servicesCatalog) && targetPage.slug === "services" && !servicesRoute;

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
        {servicesRoute?.kind === "category" ? (
          <ServiceCategoryPage
            category={servicesRoute.category}
            services={servicesRoute.services}
            ctaBlock={servicesCtaBlock}
            siteSlug={website.slug}
            currency={currency}
            currencyLocale={currencyLocale}
          />
        ) : servicesRoute?.kind === "service" ? (
          <ServiceDetailPage
            service={servicesRoute.service}
            related={servicesRoute.related}
            relatedCategoriesById={servicesRoute.categoriesById}
            bookHref={bookHref}
            bookLabel={bookLabel}
            siteSlug={website.slug}
            currency={currency}
            currencyLocale={currencyLocale}
          />
        ) : blocks.length === 0 ? (
          <div className="mx-auto max-w-4xl px-[var(--ps-space-6)] py-[var(--ps-space-16)] text-center text-[var(--ps-muted)]">
            <h2 className="text-xl font-semibold text-[var(--ps-text)]">
              {targetPage.title}
            </h2>
            <p className="mt-[var(--ps-space-2)] text-sm">
              This page has no content blocks yet. Add blocks in the Organization Dashboard.
            </p>
          </div>
        ) : (
          blocks.map((block, idx) => {
            const key = typeof block === "object" && block !== null && "id" in block ? String(block.id) : idx;
            const isServicesEmbed = typeof block === "object" && block !== null && (block as { type?: string }).type === "services_embed";
            if (isServicesIndexPage && isServicesEmbed && v2Content?.servicesCatalog) {
              const b = block as { heading?: string; subheading?: string };
              return (
                <ServicesIndexSection
                  key={key}
                  heading={b.heading}
                  subheading={b.subheading}
                  siteSlug={website.slug}
                  categories={v2Content.servicesCatalog.categories}
                  uncategorizedServices={v2Content.servicesCatalog.services.filter((s) => s.category_id === null)}
                  currency={currency}
                  currencyLocale={currencyLocale}
                />
              );
            }
            return (
              <BlockRenderer
                key={key}
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
                rentalConfig={rentalConfig}
                preselectedService={preselectedService}
                siteSlug={website.slug}
                hasPublishedMenuPage={hasPublishedMenuPage}
                hasMenuEmbedOnPage={hasMenuEmbedOnPage}
                accentColor={v2Template
                  ? v2ThemeStyle(v2Template, website.metadata)["--ps-accent"]
                  : (typeof website.theme_config?.primaryColor === "string" ? website.theme_config.primaryColor : undefined)}
                siteTemplateId={v2Template?.id}
                sectionAlign={v2Template?.sectionAlign}
                businessName={typeof v2Content?.content.business_name === "string" ? v2Content.content.business_name : website.site_title}
                businessLogo={typeof v2Content?.content.logo_url === "string" ? v2Content.content.logo_url : undefined}
                coverImageUrl={safeImageSrc(website.seo_og_image)}
              />
            );
          })
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
