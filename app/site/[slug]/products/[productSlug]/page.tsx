import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeContent } from "@/lib/website-content";
import { getV2TemplateForWebsite, resolveStorefrontCurrency, v2ThemeStyle } from "@/lib/website-v2-theme";
import { buildWebsiteTemplateResolverInputs } from "@/lib/website-template-site-inputs";
import { resolveTemplateContent } from "@/lib/website-template-resolver";
import { getStoreLocalizedCopy } from "@/lib/website-v2-template-preview";
import { getStoreProductStockState, canBuyStoreProduct } from "@/lib/store-product-detail";
import { resolveShopPrices } from "@/lib/website-embeds";
import { formatMoney } from "@/lib/money";
import { safeImageSrc } from "@/lib/image-url";
import { getSitePageHref } from "@/lib/site-paths";
import { V2SiteHeader } from "@/components/site/v2/V2SiteHeader";
import { V2SiteFooter } from "@/components/site/v2/V2SiteFooter";
import { StoreProductGallery } from "@/components/site/v2/StoreProductGallery";
import { StoreProductPurchaseButton } from "@/components/site/v2/StoreProductPurchaseButton";
import { StoreAddToCartButton, StoreCartWidget } from "@/components/site/v2/StoreCartDrawer";

interface Props {
  params: Promise<{ slug: string; productSlug: string }>;
}

export default async function StoreProductPage({ params }: Props) {
  const { slug, productSlug } = await params;
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

  const { data: product } = await admin
    .from("products")
    .select("id, business_id, name, slug, description, images, status, stock_quantity, stripe_price_id")
    .eq("slug", productSlug)
    .in("business_id", businessIds)
    .in("status", ["active", "out_of_stock"])
    .limit(1)
    .maybeSingle();
  if (!product) notFound();

  const [{ data: contentRow }, { data: pageRows }, activeProducts] = await Promise.all([
    admin.from("website_content").select("content").eq("website_id", website.id).maybeSingle(),
    admin.from("website_pages").select("slug").eq("website_id", website.id).eq("status", "published"),
    admin.from("products").select("id", { count: "exact", head: true }).in("business_id", businessIds).eq("status", "active"),
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
    catalogAvailability: { menuItems: false, products: (activeProducts.count ?? 0) > 0 },
    includeSamples: false,
    includeSourceMap: false,
    availablePageSlugs,
  });

  const priceMap = await resolveShopPrices([{
    id: product.id,
    stripe_price_id: typeof product.stripe_price_id === "string" ? product.stripe_price_id : null,
  }]);
  // Full active catalog for the floating cart widget: cart items resolve
  // against every purchasable product, not just the viewed one. Sold-out or
  // removed products stay out so the drawer marks them unavailable.
  const { data: catalogRows } = await admin
    .from("products")
    .select("id, name, images, stripe_price_id, status, stock_quantity, slug")
    .in("business_id", businessIds)
    .eq("status", "active");
  const catalogPriceMap = await resolveShopPrices(
    (catalogRows ?? []).map((row) => ({
      id: row.id,
      stripe_price_id: typeof row.stripe_price_id === "string" ? row.stripe_price_id : null,
    }))
  );
  const cartCatalog = (catalogRows ?? []).map((row) => {
    const rowPrice = catalogPriceMap.get(row.id) ?? null;
    const rowImage = (Array.isArray(row.images) ? row.images : []).find(
      (entry: unknown): entry is string => typeof entry === "string" && safeImageSrc(entry) !== null
    );
    const rowStock = row.stock_quantity == null ? null : Number(row.stock_quantity);
    return {
      id: row.id,
      name: row.name,
      image: rowImage ? (safeImageSrc(rowImage) as string) : null,
      priceLabel: rowPrice ? formatMoney(rowPrice.amount, rowPrice.currency, locale === "fr" ? "fr-FR" : "en-US") : null,
      numericPrice: rowPrice ? rowPrice.amount : undefined,
      isSoldOut: getStoreProductStockState(row.status, rowStock) === "sold_out",
      href: typeof row.slug === "string" && row.slug
        ? `/site/${encodeURIComponent(slug)}/products/${encodeURIComponent(row.slug)}`
        : null,
    };
  });  const price = priceMap.get(product.id) ?? null;
  const stockQuantity = product.stock_quantity == null ? null : Number(product.stock_quantity);
  const stockState = getStoreProductStockState(product.status, stockQuantity);
  const canBuy = canBuyStoreProduct({
    onlinePayment: resolved.storefrontFeatures.onlinePayment,
    status: product.status,
    stockQuantity,
    siteCurrency: currency,
    stripePriceId: product.stripe_price_id,
    price,
  });
  const stockLabel = stockState === "sold_out"
    ? storeT("storeSoldOut")
    : stockState === "low_stock"
      ? storeT("storeLowStock")
      : storeT("storeInStock");
  const imageList = Array.isArray(product.images) ? product.images : [];
  const safeImages = imageList.filter(
    (entry: unknown): entry is string =>
      typeof entry === "string" && safeImageSrc(entry) !== null
  );
  const extras = content.template_extras && typeof content.template_extras === "object"
    ? content.template_extras as Record<string, unknown>
    : {};
  const fulfilmentNote = typeof extras.storeHowToReceive === "string" ? extras.storeHowToReceive.trim() : "";
  const contactHref = resolved.pages.some((page) => page.slug === "contact") && availablePageSlugs.includes("contact")
    ? getSitePageHref(slug, "contact")
    : getSitePageHref(slug, "home");
  const businessName = typeof content.business_name === "string" && content.business_name.trim()
    ? content.business_name.trim()
    : slug;
  const title = typeof website.site_title === "string" && website.site_title.trim()
    ? website.site_title.trim()
    : businessName;
  const formattedPrice = price ? formatMoney(price.amount, price.currency, locale === "fr" ? "fr-FR" : "en-US") : null;
  const maxQuantity = stockQuantity == null ? 100 : Math.max(1, Math.min(100, stockQuantity));

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
      <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 pt-24 md:grid-cols-2 md:px-8">
        <StoreProductGallery
          images={safeImages}
          name={product.name}
          unavailableLabel={publicT("storeImageUnavailable")}
        />
        <section className="flex flex-col justify-center">
          <Link href={resolved.pages.some((page) => page.slug === "shop") ? getSitePageHref(slug, "shop") : getSitePageHref(slug, "home")} className="mb-6 text-sm font-semibold text-[var(--ps-accent-hover)] hover:underline">
            ← {storeT("storeBackToShop")}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ps-text)] md:text-4xl">{product.name}</h1>
          {formattedPrice ? <p className="mt-4 text-xl font-semibold text-[var(--ps-text)]">{formattedPrice}</p> : null}
          <p className="mt-5 whitespace-pre-line text-base leading-7 text-[var(--ps-muted)]">{product.description || ""}</p>
          <p className="mt-5 inline-flex w-fit rounded-full border border-[var(--ps-border)] px-3 py-1 text-sm font-medium text-[var(--ps-muted)]">{stockLabel}</p>
          {fulfilmentNote ? (
            <div className="mt-6 rounded-xl bg-[var(--ps-neutral)] p-4">
              <h2 className="text-sm font-semibold">{publicT("storeFulfilmentHeading")}</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-[var(--ps-muted)]">{fulfilmentNote}</p>
            </div>
          ) : null}
          <div className="mt-8">
            {canBuy ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <StoreProductPurchaseButton
                  productId={product.id}
                  maxQuantity={maxQuantity}
                  siteSlug={slug}
                  labels={{
                    quantity: publicT("storeQuantity"),
                    buyerName: publicT("storeBuyerName"),
                    buyerEmail: publicT("storeBuyerEmail"),
                    buyNow: publicT("storeBuyNow"),
                    processing: publicT("storeProcessing"),
                    checkoutError: publicT("storeCheckoutError"),
                  }}
                />
                <StoreAddToCartButton
                  slug={slug}
                  productId={product.id}
                  label={storeT("storeAddToCart")}
                />
              </div>
            ) : (
              <Link href={contactHref} className="ps-button ps-button-primary inline-flex min-h-11 items-center justify-center">
                {publicT("storeContactSeller")}
              </Link>
            )}
          </div>
        </section>
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
      <StoreCartWidget
        slug={slug}
        siteCurrency={currency}
        catalog={cartCatalog}
        labels={{
          title: storeT("storeCartTitle"),
          empty: storeT("storeCartEmpty"),
          emptyBody: storeT("storeCartEmptyBody"),
          viewCart: storeT("storeViewCart"),
          added: storeT("storeCartAdded"),
          addToCart: storeT("storeAddToCart"),
          checkout: storeT("storeCartCheckout"),
          pay: storeT("storeCartPay"),
          back: storeT("storeBackToShop"),
          continueShopping: storeT("storeCartContinue"),
          subtotal: storeT("storeCartSubtotal"),
          discount: storeT("storeCartDiscount"),
          total: storeT("storeCartTotal"),
          remove: storeT("storeCartRemove"),
          decrease: storeT("storeCartDecrease"),
          increase: storeT("storeCartIncrease"),
          promo: storeT("storeCartPromo"),
          promoPlaceholder: storeT("storeCartPromoPlaceholder"),
          buyerName: publicT("storeBuyerName"),
          buyerEmail: publicT("storeBuyerEmail"),
          changed: storeT("storeCartChanged"),
          error: publicT("storeCheckoutError"),
          unavailable: storeT("storeCartUnavailable"),
          locale: locale === "fr" ? "fr-FR" : "en-US",
        }}
      />
    </div>
  );
}
