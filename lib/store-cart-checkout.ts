import "server-only";

/**
 * lib/store-cart-checkout.ts
 *
 * Shared server-side cart validation + pricing for the Store multi-item
 * checkout. Used by POST /api/checkout/cart (creates rows + session) and
 * POST /api/checkout/cart/validate (review summary, writes nothing).
 *
 * Every rule is re-checked here from live data: tenant scope, product
 * status, stock, Stripe price + currency, online-payment gate, promo code.
 * Client totals are never trusted.
 */

import Stripe from "stripe";
import { normalizeContent } from "@/lib/website-content";
import { getV2TemplateForWebsite, resolveStorefrontCurrency } from "@/lib/website-v2-theme";
import { buildWebsiteTemplateResolverInputs } from "@/lib/website-template-site-inputs";
import { resolveTemplateContent } from "@/lib/website-template-resolver";
import { toMinorUnits } from "@/lib/money";
import { isDigitalProductType } from "@/lib/digital-products";
import {
  fetchTenantPromoCode,
  normalizePromoCode,
  validatePromoRow,
  applyPromoToSubtotal,
  type ValidatedPromo,
} from "@/lib/promo-codes";
import { normalizeCartItems, STORE_CART_MAX_ITEMS } from "@/lib/store-cart";

export interface CartIssue {
  productId: string;
  error: string;
}

export interface ValidatedCartLine {
  productId: string;
  name: string;
  quantity: number;
  unitMajor: number;
  unitMinor: number;
  lineMinor: number;
  isDigital: boolean;
}

export interface ValidatedCart {
  siteSlug: string;
  tenantId: string;
  currency: string;
  buyerEmail: string;
  buyerName: string | null;
  lines: ValidatedCartLine[];
  subtotalMinor: number;
  promo: ValidatedPromo | null;
  discountMinor: number;
  totalMinor: number;
}

interface SupabaseLike {
  from(table: string): any;
}

function isSiteSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

/**
 * Distribute a minor-unit discount across per-unit amounts (largest
 * remainder): every amount stays >= 0 and the distributed parts sum exactly
 * to the requested discount.
 */
export function distributeDiscount(
  unitMinors: number[],
  discountMinor: number
): number[] {
  const total = unitMinors.reduce((sum, amount) => sum + amount, 0);
  const capped = Math.max(0, Math.min(discountMinor, total));
  if (capped === 0 || total === 0) return [...unitMinors];
  const exact = unitMinors.map((amount) => (amount * capped) / total);
  const floors = exact.map((value, index) =>
    Math.min(unitMinors[index] ?? 0, Math.floor(value))
  );
  let remainder = capped - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ frac: value - Math.floor(value), index }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  const parts = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    const headroom = unitMinors[index] - parts[index];
    if (headroom <= 0) continue;
    const take = Math.min(headroom, remainder);
    parts[index] += take;
    remainder -= take;
  }
  return unitMinors.map((amount, index) => amount - parts[index]);
}

export async function validateCartCheckout(input: {
  supabaseAdmin: SupabaseLike;
  stripeSecretKey: string | undefined;
  siteSlug: unknown;
  items: unknown;
  buyerEmail: unknown;
  buyerName: unknown;
  promoCode: unknown;
  viewerId: string | null;
  /**
   * Injected Stripe client for hermetic tests (shape: prices.retrieve).
   * Routes omit it and get a live client from stripeSecretKey.
   */
  stripeClient?: {
    prices: {
      retrieve(id: string): Promise<{ unit_amount: number | null; currency: string }>;
    };
  };
}): Promise<
  | { ok: true; cart: ValidatedCart }
  | { ok: false; status: number; error: string; issues?: CartIssue[] }
> {
  const { supabaseAdmin, stripeSecretKey, viewerId } = input;

  if (!isSiteSlug(input.siteSlug)) {
    return { ok: false, status: 400, error: "Missing store reference." };
  }
  const siteSlug = input.siteSlug;
  const items = normalizeCartItems(input.items);
  if (items.length === 0) {
    return { ok: false, status: 400, error: "Your cart is empty." };
  }
  if (items.length > STORE_CART_MAX_ITEMS) {
    return {
      ok: false,
      status: 400,
      error: `Carts hold at most ${STORE_CART_MAX_ITEMS} different products.`,
    };
  }

  const buyerEmail =
    (typeof input.buyerEmail === "string" && input.buyerEmail.trim()) || null;
  const resolvedBuyerEmail = buyerEmail;
  if (!resolvedBuyerEmail) {
    return { ok: false, status: 400, error: "Email is required for guest checkout." };
  }
  const buyerName =
    typeof input.buyerName === "string" && input.buyerName.trim()
      ? input.buyerName.trim()
      : null;
  void viewerId;

  const { data: website } = await supabaseAdmin
    .from("tenant_websites")
    .select("id, tenant_id, slug, site_title, metadata, status")
    .eq("slug", siteSlug)
    .eq("status", "published")
    .maybeSingle();
  if (!website) {
    return { ok: false, status: 404, error: "Store not found." };
  }
  const template = getV2TemplateForWebsite(website.metadata);
  if (!template || template.id !== "store") {
    return { ok: false, status: 404, error: "Store not found." };
  }
  const { data: businessRows } = await supabaseAdmin
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
  const businessIds = new Set(businesses.map((b) => b.id).filter(Boolean));
  if (businessIds.size === 0) {
    return { ok: false, status: 404, error: "Store not found." };
  }

  const [{ data: contentRow }, { data: pageRows }] = await Promise.all([
    supabaseAdmin.from("website_content").select("content").eq("website_id", website.id).maybeSingle(),
    supabaseAdmin.from("website_pages").select("slug").eq("website_id", website.id).eq("status", "published"),
  ]);
  const content = normalizeContent(contentRow?.content ?? {});
  const currency = resolveStorefrontCurrency(website.metadata, businesses[0]?.country ?? null);
  const resolved = resolveTemplateContent(template.id, template.version, content, {
    ...buildWebsiteTemplateResolverInputs({
      siteSlug,
      currency,
      metadata: website.metadata,
      linkedBusiness: businesses[0],
    }),
    includeSamples: false,
    includeSourceMap: false,
    availablePageSlugs: (pageRows ?? []).map((page: { slug: string }) => page.slug),
  });
  if (!resolved.storefrontFeatures.onlinePayment) {
    return {
      ok: false,
      status: 400,
      error: "Online checkout is not available for this store right now.",
    };
  }

  if (!stripeSecretKey) {
    return { ok: false, status: 500, error: "Stripe secret key not configured." };
  }

  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id, business_id, name, slug, status, price_type, product_type, stripe_price_id, stock_quantity")
    .in("id", items.map((item) => item.productId));
  const byId = new Map(((products ?? []) as Array<Record<string, any>>).map((p) => [p.id, p]));
  const issues: CartIssue[] = [];
  const pending: Array<{
    productId: string;
    name: string;
    quantity: number;
    isDigital: boolean;
    stripePriceId: string;
  }> = [];

  for (const item of items) {
    const product = byId.get(item.productId) as
      | {
          id: string;
          business_id: string;
          name: string;
          status: string;
          price_type: string;
          product_type?: string | null;
          stripe_price_id?: string | null;
          stock_quantity?: number | null;
        }
      | undefined;
    if (!product || !businessIds.has(product.business_id)) {
      issues.push({ productId: item.productId, error: "This product is no longer available." });
      continue;
    }
    if (product.status !== "active") {
      issues.push({ productId: item.productId, error: `${product.name} is no longer available.` });
      continue;
    }
    if (product.price_type === "subscription") {
      issues.push({
        productId: item.productId,
        error: `${product.name} is a subscription and checks out separately.`,
      });
      continue;
    }
    const isDigital = isDigitalProductType(product.product_type ?? "other");
    const quantity = isDigital ? 1 : item.quantity;
    if (product.stock_quantity !== null && Number(product.stock_quantity) < quantity) {
      issues.push({
        productId: item.productId,
        error: `Only ${product.stock_quantity} of ${product.name} left in stock.`,
      });
      continue;
    }
    if (!product.stripe_price_id) {
      issues.push({
        productId: item.productId,
        error: `${product.name} cannot be purchased online right now.`,
      });
      continue;
    }
    pending.push({
      productId: product.id,
      name: product.name,
      quantity,
      isDigital,
      stripePriceId: product.stripe_price_id,
    });
  }
  if (issues.length > 0) {
    return { ok: false, status: 409, error: "Some items in your cart changed.", issues };
  }

  const stripe = input.stripeClient ?? new Stripe(stripeSecretKey);
  const siteCurrency = currency.trim().toUpperCase();
  const lines: ValidatedCartLine[] = [];
  for (const entry of pending) {
    const price = await stripe.prices.retrieve(entry.stripePriceId);
    const priceCurrency = (price.currency || "usd").toUpperCase();
    if (priceCurrency !== siteCurrency) {
      return {
        ok: false,
        status: 409,
        error: `${entry.name} is priced in ${priceCurrency} and cannot be checked out with this store's ${siteCurrency} cart.`,
      };
    }
    const unitMajor = (price.unit_amount ?? 0) / 100;
    const unitMinor = toMinorUnits(unitMajor, siteCurrency);
    lines.push({
      productId: entry.productId,
      name: entry.name,
      quantity: entry.quantity,
      unitMajor,
      unitMinor,
      lineMinor: unitMinor * entry.quantity,
      isDigital: entry.isDigital,
    });
  }

  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineMinor, 0);

  let promo: ValidatedPromo | null = null;
  let discountMinor = 0;
  const promoInput = normalizePromoCode(input.promoCode);
  if (promoInput) {
    const row = await fetchTenantPromoCode(
      supabaseAdmin as unknown as Parameters<typeof fetchTenantPromoCode>[0],
      website.tenant_id,
      promoInput
    );
    if (!row) {
      return { ok: false, status: 409, error: "That code is not valid for this store." };
    }
    const checked = validatePromoRow(row, website.tenant_id);
    if (!checked.ok) {
      return { ok: false, status: 409, error: checked.error };
    }
    promo = checked.promo;
    const applied = applyPromoToSubtotal(subtotalMinor, promo, siteCurrency);
    if (applied.belowMinimum) {
      return { ok: false, status: 409, error: "That code needs a larger cart subtotal." };
    }
    discountMinor = applied.discountMinor;
  }

  return {
    ok: true,
    cart: {
      siteSlug,
      tenantId: website.tenant_id,
      currency: siteCurrency,
      buyerEmail: resolvedBuyerEmail,
      buyerName,
      lines,
      subtotalMinor,
      promo,
      discountMinor,
      totalMinor: subtotalMinor - discountMinor,
    },
  };
}
