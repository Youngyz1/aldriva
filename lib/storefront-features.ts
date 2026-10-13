import type { WebsiteTemplateV2 } from "./website-template-v2";
import type { Capability } from "./business-taxonomy";

export const STOREFRONT_FEATURES = [
  "ordering",
  "delivery",
  "pickup",
  "reservations",
  "onlinePayment",
] as const;

export type StorefrontFeature = (typeof STOREFRONT_FEATURES)[number];
export type StorefrontFeatureState = Record<StorefrontFeature, boolean>;

/** Payment-gateway supported currencies for online card payment (Phase 3: USD only). */
export const ONLINE_PAYMENT_CURRENCIES: readonly string[] = ["USD"];

export function isOnlinePaymentCurrencySupported(currency: unknown): boolean {
  if (typeof currency !== "string") return false;
  return ONLINE_PAYMENT_CURRENCIES.includes(currency.trim().toUpperCase());
}

export interface ResolveStorefrontFeaturesInput {
  capabilities: readonly Capability[] | readonly string[];
  offerings: readonly string[] | null | undefined;
  built: StorefrontFeatureState;
  /**
   * Resolved site currency (e.g. "USD"). Online payment additionally
   * requires a gateway-supported currency. Omitted (legacy callers) means
   * no currency gate — unset offerings still change nothing.
   */
  currency?: string | null;
}

/**
 * A feature is exposed only when the business type supports it, the owner
 * selected it, and the active template has a real implementation.
 * Online payment additionally requires a gateway-supported currency.
 */
export function resolveStorefrontFeatures({ capabilities, offerings, built, currency }: ResolveStorefrontFeaturesInput): StorefrontFeatureState {
  const caps = new Set(capabilities);
  const selected = new Set(offerings ?? []);
  const ordering = selected.has("online_ordering") && caps.has("ONLINE_ORDERING") && built.ordering;
  // Online payment rides the ordering flow: it needs the owner tick, the
  // ONLINE_PAYMENT capability (or live ordering as fallback for types whose
  // capability set predates it), a built ordering surface, and USD.
  const currencyOk = currency === undefined || currency === null ? true : isOnlinePaymentCurrencySupported(currency);
  const onlinePayment =
    selected.has("online_payment") &&
    (caps.has("ONLINE_PAYMENT") || ordering) &&
    built.onlinePayment &&
    currencyOk;
  return {
    ordering,
    delivery:
      (selected.has("delivery") || selected.has("delivery_to_customer")) &&
      caps.has("DELIVERY") &&
      built.delivery,
    // Pickup is part of the ordering workflow, so it cannot outlive ordering.
    pickup: ordering && selected.has("pickup") && caps.has("PICKUP") && built.pickup,
    reservations:
      selected.has("table_reservations") &&
      (caps.has("RESERVATIONS") || caps.has("TABLES")) &&
      built.reservations,
    onlinePayment,
  };
}

/** Read readiness from actual emitted manifest block types; pendingBlock does not count. */
export function getBuiltStorefrontFeatures(template: Pick<WebsiteTemplateV2, "sections">): StorefrontFeatureState {
  const blocks = new Set<string>(template.sections.flatMap((section) => section.block ? [section.block] : []));
  const ordering = ["menu_order", "order_summary", "order_checkout"].some((block) => blocks.has(block));
  return {
    ordering,
    pickup: ordering,
    delivery: ["delivery_selector", "delivery_checkout", "menu_order"].some((block) => blocks.has(block)),
    reservations: ["reservation_form", "table_reservations", "reservations"].some((block) => blocks.has(block)),
    // Online payment renders inside the ordering checkout surface, so it is
    // built wherever ordering is built. Currency support is resolved per
    // site at call time, not from the manifest.
    onlinePayment: ordering,
  };
}

export function getBuiltStorefrontFeaturesFromTemplates(
  templates: readonly Pick<WebsiteTemplateV2, "sections">[]
): StorefrontFeatureState {
  const states = templates.map(getBuiltStorefrontFeatures);
  return Object.fromEntries(STOREFRONT_FEATURES.map((feature) => [
    feature,
    states.some((state) => state[feature]),
  ])) as StorefrontFeatureState;
}

export function storefrontFeatureForOffering(key: string): StorefrontFeature | undefined {
  if (key === "online_ordering") return "ordering";
  if (key === "online_payment") return "onlinePayment";
  if (key === "delivery" || key === "delivery_to_customer") return "delivery";
  if (key === "pickup") return "pickup";
  if (key === "table_reservations") return "reservations";
  return undefined;
}
