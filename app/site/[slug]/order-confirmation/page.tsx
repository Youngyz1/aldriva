import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeContent } from "@/lib/website-content";
import { getV2TemplateForWebsite, resolveStorefrontCurrency, v2ThemeStyle } from "@/lib/website-v2-theme";
import { buildWebsiteTemplateResolverInputs } from "@/lib/website-template-site-inputs";
import { resolveTemplateContent } from "@/lib/website-template-resolver";
import { getStoreLocalizedCopy } from "@/lib/website-v2-template-preview";
import { getSitePageHref } from "@/lib/site-paths";
import { V2SiteHeader } from "@/components/site/v2/V2SiteHeader";
import { V2SiteFooter } from "@/components/site/v2/V2SiteFooter";
import { StoreOrderConfirmationView } from "@/components/site/v2/StoreOrderConfirmationView";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ orderId?: string; session_id?: string; cartSession?: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Site-local order confirmation for Store checkouts. Tenancy is verified
 * server-side before anything renders: the site must be a published Store
 * site and the order's product must belong to one of the site's businesses.
 * Payment state itself is proven buyer-side through the existing
 * `/api/products/order-lookup` session proof — no new order system.
 */
export default async function StoreOrderConfirmationPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { orderId, session_id: sessionId, cartSession } = await searchParams;
  const cartSessionId =
    typeof cartSession === "string" && cartSession.startsWith("cs_") ? cartSession : null;
  if (!cartSessionId && (!orderId || !UUID_REGEX.test(orderId))) notFound();

  const admin = createSupabaseAdmin();
  const { data: website } = await admin
    .from("tenant_websites")
    .select("id, tenant_id, slug, site_title, metadata, status")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!website || website.status !== "published") notFound();

  const template = getV2TemplateForWebsite(website.metadata);
  if (!template || template.id !== "store") notFound();

  const { data: businessRows } = await admin
    .from("businesses")
    .select("id, country, industry, category, business_type, offerings, created_at")
    .eq("organizer_id", website.tenant_id)
    .order("created_at", { ascending: true })
    .limit(25);
  const businesses = (businessRows ?? []) as Array<{
    id: string;
    country?: string | null;
    industry?: string | null;
    category?: string | null;
    business_type?: string | null;
    offerings?: unknown;
  }>;
  const businessIds = businesses.map((business) => business.id).filter(Boolean);
  if (businessIds.length === 0) notFound();

  // The order(s) must belong to this site: single orders join through
  // their product; cart sessions resolve through stripe_session_id and every
  // row's product must belong here. Buyer proof (session/email/owner) stays
  // inside the lookup endpoint; this gate only binds orders to the site.
  if (cartSessionId) {
    const { data: cartRows } = await admin
      .from("product_orders")
      .select("id, product_id")
      .eq("stripe_session_id", cartSessionId)
      .limit(12);
    if (!cartRows || cartRows.length === 0) notFound();
    const cartProductIds = [...new Set(cartRows.map((row) => row.product_id))];
    const { data: cartProducts } = await admin
      .from("products")
      .select("id, business_id")
      .in("id", cartProductIds);
    if (
      !cartProducts ||
      cartProducts.length !== cartProductIds.length ||
      cartProducts.some((item) => !businessIds.includes(item.business_id))
    ) {
      notFound();
    }
  } else {
    const { data: order } = await admin
      .from("product_orders")
      .select("id, product_id")
      .eq("id", orderId as string)
      .maybeSingle();
    if (!order) notFound();
    const { data: orderProduct } = await admin
      .from("products")
      .select("id, business_id")
      .eq("id", order.product_id)
      .maybeSingle();
    if (!orderProduct || !businessIds.includes(orderProduct.business_id)) notFound();
  }

  const [{ data: contentRow }, { data: pageRows }] = await Promise.all([
    admin.from("website_content").select("content").eq("website_id", website.id).maybeSingle(),
    admin.from("website_pages").select("slug").eq("website_id", website.id).eq("status", "published"),
  ]);
  const content = normalizeContent(contentRow?.content ?? {});
  const linkedBusiness = businesses[0];
  const currency = resolveStorefrontCurrency(website.metadata, linkedBusiness?.country ?? null);
  const storeT = await getTranslations("Storefront");
  const publicT = await getTranslations("PublicSite");
  const locale = await getLocale();
  const storeCopy = getStoreLocalizedCopy(publicT as unknown as (key: string, values?: Record<string, string>) => string);
  const resolverInputs = buildWebsiteTemplateResolverInputs({
    siteSlug: slug,
    currency,
    metadata: website.metadata,
    linkedBusiness,
  });
  const availablePageSlugs = (pageRows ?? []).map((page) => page.slug);
  const resolved = resolveTemplateContent(template.id, template.version, content, {
    ...resolverInputs,
    storeCopy: storeCopy.resolver,
    includeSamples: false,
    includeSourceMap: false,
    availablePageSlugs,
  });

  const businessName = typeof content.business_name === "string" && content.business_name.trim()
    ? content.business_name.trim()
    : slug;
  const title = typeof website.site_title === "string" && website.site_title.trim()
    ? website.site_title.trim()
    : businessName;
  const shopHref = resolved.pages.some((page) => page.slug === "shop") && availablePageSlugs.includes("shop")
    ? getSitePageHref(slug, "shop")
    : getSitePageHref(slug, "home");

  return (
    <div style={v2ThemeStyle(template, website.metadata)} className="public-site min-h-screen bg-[var(--ps-surface)] font-sans text-[var(--ps-text)]">
      <V2SiteHeader
        template={template}
        content={content}
        navigation={resolved.navigation}
        siteTitle={title}
        siteSlug={slug}
        storefrontFeatures={resolved.storefrontFeatures}
        primaryAction={resolved.primaryAction.primary}
        availablePageSlugs={availablePageSlugs}
      />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 md:px-8">
        <StoreOrderConfirmationView
          orderId={cartSessionId ? null : (orderId as string)}
          sessionId={typeof sessionId === "string" ? sessionId : null}
          cartSessionId={cartSessionId}
          shopHref={shopHref}
          labels={{
            pendingTitle: storeT("storeOrderPendingTitle"),
            pendingBody: storeT("storeOrderPendingBody"),
            confirmedTitle: storeT("storeOrderConfirmedTitle"),
            confirmedBody: storeT("storeOrderConfirmedBody"),
            failedTitle: storeT("storeOrderFailedTitle"),
            failedBody: storeT("storeOrderFailedBody"),
            reference: storeT("storeOrderReference"),
            backToShop: storeT("storeBackToShop"),
            locale: locale === "fr" ? "fr-FR" : "en-US",
          }}
        />
      </main>
      <V2SiteFooter
        template={template}
        content={content}
        navigation={resolved.navigation}
        siteTitle={title}
        siteSlug={slug}
        storefrontFeatures={resolved.storefrontFeatures}
        todayHours={resolved.todayHours}
        availablePageSlugs={availablePageSlugs}
      />
    </div>
  );
}
