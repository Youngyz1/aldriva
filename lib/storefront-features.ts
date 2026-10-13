import type { WebsiteTemplateV2 } from "./website-template-v2";
import type { Capability } from "./business-taxonomy";

export const STOREFRONT_FEATURES = [
  "ordering",
  "delivery",
  "pickup",
  "reservations",
] as const;

export type StorefrontFeature = (typeof STOREFRONT_FEATURES)[number];
export type StorefrontFeatureState = Record<StorefrontFeature, boolean>;

export interface ResolveStorefrontFeaturesInput {
  capabilities: readonly Capability[] | readonly string[];
  offerings: readonly string[] | null | undefined;
  built: StorefrontFeatureState;
}

/**
 * A feature is exposed only when the business type supports it, the owner
 * selected it, and the active template has a real implementation.
 */
export function resolveStorefrontFeatures({ capabilities, offerings, built }: ResolveStorefrontFeaturesInput): StorefrontFeatureState {
  const caps = new Set(capabilities);
  const selected = new Set(offerings ?? []);
  const ordering = selected.has("online_ordering") && caps.has("ONLINE_ORDERING") && built.ordering;
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
  if (key === "delivery" || key === "delivery_to_customer") return "delivery";
  if (key === "pickup") return "pickup";
  if (key === "table_reservations") return "reservations";
  return undefined;
}
