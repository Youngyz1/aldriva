/**
 * Pure restaurant-menu promotion eligibility and price resolution.
 * Promotion rows passed here must already be scoped to the current organizer;
 * organizer checks remain explicit as a second guard against cross-tenant rows.
 */

import { isZeroDecimalCurrency, normalizeMoneyCurrency } from "./money";

export type MenuPromotionOfferType = "percent_off" | "special_price" | "free_delivery";
export type MenuPromotionSource = "promo_price" | "promotion" | "none";

export interface MenuPromotionTarget {
  item_id?: string | null;
  section_id?: string | null;
}

export interface MenuPromotion {
  id: string;
  organizer_id: string;
  name: string;
  offer_type: MenuPromotionOfferType;
  percent_off?: number | null;
  special_price?: number | null;
  apply_to_variants?: boolean | null;
  code?: string | null;
  min_order_amount?: number | null;
  status: "draft" | "active" | "paused";
  starts_at?: string | null;
  ends_at?: string | null;
  priority?: number | null;
  created_at?: string | null;
  targets?: readonly MenuPromotionTarget[];
  target_item_ids?: readonly string[];
  target_section_ids?: readonly string[];
}

export interface PromotionPricedItem {
  id?: string;
  organizer_id?: string;
  section_id?: string | null;
  price: number;
  promo_price?: number | null;
  created_at?: string | null;
  is_active?: boolean;
  is_sold_out?: boolean;
  option_groups?: readonly { id?: string; kind?: string; options?: readonly { id?: string; price?: number }[] }[] | null;
}

export interface PromotionEligibilityOptions {
  organizerId?: string;
  subtotal?: number;
  code?: string | null;
  now?: Date;
}

export interface ResolveBasePriceOptions extends PromotionEligibilityOptions {
  variantPrice?: number | null;
  currency?: string;
}

export interface ResolvedBasePrice {
  basePrice: number;
  appliedPromotion: MenuPromotion | null;
  source: MenuPromotionSource;
  originalPrice: number;
  discountPerUnit: number;
}

export type MenuPromotionDisplayStatus = "draft" | "scheduled" | "active" | "expired" | "paused";

export function getMenuPromotionDisplayStatus(promo: MenuPromotion, now = new Date()): MenuPromotionDisplayStatus {
  if (promo.status === "draft") return "draft";
  if (promo.status === "paused") return "paused";
  const starts = safeDate(promo.starts_at);
  const ends = safeDate(promo.ends_at);
  if (ends !== null && (!Number.isFinite(ends) || ends < now.getTime())) return "expired";
  if (starts !== null && (!Number.isFinite(starts) || starts > now.getTime())) return "scheduled";
  return "active";
}

function safeDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Round a major-unit amount to the currency's supported minor unit. */
export function roundToCurrencyMinorUnit(amount: number, currency = "USD"): number {
  if (!Number.isFinite(amount)) return 0;
  const code = normalizeMoneyCurrency(currency) ?? "USD";
  const scale = isZeroDecimalCurrency(code) ? 1 : 100;
  return Math.round((amount + Math.sign(amount) * Number.EPSILON) * scale) / scale;
}

export function isPromotionActive(promo: MenuPromotion, now = new Date()): boolean {
  if (!promo || promo.status !== "active") return false;
  const nowTime = now.getTime();
  const starts = safeDate(promo.starts_at);
  const ends = safeDate(promo.ends_at);
  if (starts !== null && (!Number.isFinite(starts) || starts > nowTime)) return false;
  if (ends !== null && (!Number.isFinite(ends) || ends < nowTime)) return false;
  return true;
}

function hasTarget(promo: MenuPromotion, item: PromotionPricedItem): boolean {
  const itemIds = new Set([...(promo.target_item_ids || []), ...(promo.targets || []).map((target) => target.item_id).filter((id): id is string => Boolean(id))]);
  const sectionIds = new Set([...(promo.target_section_ids || []), ...(promo.targets || []).map((target) => target.section_id).filter((id): id is string => Boolean(id))]);
  return Boolean((item.id && itemIds.has(item.id)) || (item.section_id && sectionIds.has(item.section_id)));
}

/**
 * Filters promotions that may be considered for this menu item. Code-based
 * offers are excluded unless the customer supplied that exact code.
 */
export function eligiblePromotionsForItem(
  item: PromotionPricedItem,
  promotions: readonly MenuPromotion[],
  options: PromotionEligibilityOptions = {}
): MenuPromotion[] {
  const now = options.now ?? new Date();
  const code = options.code?.trim().toLocaleUpperCase("en-US") ?? "";
  const organizerId = options.organizerId ?? item.organizer_id;
  const hasVariant = Boolean(item.option_groups?.some((group) => group.kind === "variant"));
  if (item.is_active === false || item.is_sold_out === true) return [];

  return promotions.filter((promo) => {
    if (!isPromotionActive(promo, now)) return false;
    if (!organizerId || promo.organizer_id !== organizerId) return false;
    if (!hasTarget(promo, item)) return false;
    const promoCode = promo.code?.trim().toLocaleUpperCase("en-US") ?? "";
    if (promoCode && (!code || promoCode !== code)) return false;
    if (promo.min_order_amount != null && (options.subtotal ?? 0) < Number(promo.min_order_amount)) return false;
    if (hasVariant) {
      if (promo.offer_type === "special_price") return false;
      if (promo.offer_type === "percent_off" && promo.apply_to_variants !== true) return false;
    }
    return true;
  });
}

/** A generic, non-enumerating validity check for a supplied code. */
export function findEligibleCodePromotion(
  code: string,
  promotions: readonly MenuPromotion[],
  options: Omit<PromotionEligibilityOptions, "code"> = {}
): MenuPromotion | null {
  const normalized = code.trim().toLocaleUpperCase("en-US");
  if (!normalized) return null;
  return promotions.find((promo) =>
    Boolean(promo.code) &&
    promo.code!.trim().toLocaleUpperCase("en-US") === normalized &&
    (!options.organizerId || promo.organizer_id === options.organizerId) &&
    isPromotionActive(promo, options.now ?? new Date()) &&
    (promo.min_order_amount == null || (options.subtotal ?? 0) >= Number(promo.min_order_amount))
  ) ?? null;
}

interface PriceCandidate {
  basePrice: number;
  source: MenuPromotionSource;
  promo: MenuPromotion | null;
  createdAt: number;
  id: string;
  priority: number;
}

/**
 * Selects exactly one base-price candidate: item promo_price, one eligible
 * automatic/code promotion, or the normal item/variant price. Add-on deltas
 * are deliberately handled afterwards by menu-pricing.ts.
 */
export function resolveBasePrice(
  item: PromotionPricedItem,
  promotions: readonly MenuPromotion[],
  options: ResolveBasePriceOptions = {}
): ResolvedBasePrice {
  const currency = normalizeMoneyCurrency(options.currency) ?? "USD";
  const hasVariant = Boolean(item.option_groups?.some((group) => group.kind === "variant"));
  const rawVariantPrice = Number(options.variantPrice);
  const originalPrice = roundToCurrencyMinorUnit(
    hasVariant && Number.isFinite(rawVariantPrice) && rawVariantPrice >= 0 ? rawVariantPrice : Number(item.price),
    currency
  );
  const candidates: PriceCandidate[] = [{
    basePrice: originalPrice,
    source: "none",
    promo: null,
    createdAt: Number.POSITIVE_INFINITY,
    id: "~base",
    priority: Number.NEGATIVE_INFINITY,
  }];

  const manualPromoPrice = Number(item.promo_price);
  if (!hasVariant && item.promo_price != null && Number.isFinite(manualPromoPrice) && manualPromoPrice >= 0 && manualPromoPrice < originalPrice) {
    candidates.push({ basePrice: roundToCurrencyMinorUnit(manualPromoPrice, currency), source: "promo_price", promo: null, createdAt: safeDate(item.created_at) ?? Number.NEGATIVE_INFINITY, id: "", priority: 0 });
  }

  const eligible = eligiblePromotionsForItem(item, promotions, options);
  for (const promo of eligible) {
    let candidatePrice = originalPrice;
    if (promo.offer_type === "percent_off") {
      const percent = Number(promo.percent_off);
      if (!Number.isInteger(percent) || percent < 1 || percent > 90) continue;
      const perUnitDiscount = roundToCurrencyMinorUnit((originalPrice * percent) / 100, currency);
      candidatePrice = Math.max(0, roundToCurrencyMinorUnit(originalPrice - perUnitDiscount, currency));
    } else if (promo.offer_type === "special_price") {
      const specialPrice = Number(promo.special_price);
      if (!Number.isFinite(specialPrice) || specialPrice < 0 || specialPrice > 999999.99 || hasVariant) continue;
      candidatePrice = roundToCurrencyMinorUnit(specialPrice, currency);
    }
    const createdAt = safeDate(promo.created_at) ?? Number.POSITIVE_INFINITY;
    candidates.push({
      basePrice: candidatePrice,
      source: "promotion",
      promo,
      createdAt,
      id: promo.id,
      priority: Number.isFinite(Number(promo.priority)) ? Number(promo.priority) : 0,
    });
  }

  candidates.sort((left, right) =>
    left.basePrice - right.basePrice ||
    right.priority - left.priority ||
    left.createdAt - right.createdAt ||
    left.id.localeCompare(right.id)
  );
  const winner = candidates[0];
  return {
    basePrice: winner.basePrice,
    appliedPromotion: winner.promo,
    source: winner.source,
    originalPrice,
    discountPerUnit: Math.max(0, roundToCurrencyMinorUnit(originalPrice - winner.basePrice, currency)),
  };
}
