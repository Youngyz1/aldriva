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

export type StorefrontFeatureStatus = "live" | "needs_setup" | "off";

export type StorefrontStatusReason =
  | "no_fulfilment"
  | "no_active_dish"
  | "currency_not_supported"
  | "feature_not_built"
  | "not_ticked"
  | "missing_capability";

export const STOREFRONT_STATUS_REASONS: Record<StorefrontStatusReason, string> = {
  no_fulfilment: "no pickup/delivery ticked",
  no_active_dish: "no active dish",
  currency_not_supported: "currency not supported for online payment",
  feature_not_built: "feature not built in this template",
  not_ticked: "not enabled",
  missing_capability: "not supported by business type",
};

export interface FeatureStatusDetail {
  feature: StorefrontFeature;
  status: StorefrontFeatureStatus;
  live: boolean;
  reason?: StorefrontStatusReason;
  reasonText?: string;
  statusLine: string;
}

export interface ResolvedStorefrontFeatures extends StorefrontFeatureState {
  status: Record<StorefrontFeature, FeatureStatusDetail>;
  reasons: Partial<Record<StorefrontFeature, string>>;
}

/** Payment-gateway supported currencies for online card payment (Phase 3: USD only). */
export const ONLINE_PAYMENT_CURRENCIES: readonly string[] = ["USD"];

export function isOnlinePaymentCurrencySupported(currency: unknown): boolean {
  if (typeof currency !== "string") return false;
  return ONLINE_PAYMENT_CURRENCIES.includes(currency.trim().toUpperCase());
}

export function isFulfilmentMissing(offerings: readonly string[] | null | undefined): boolean {
  if (!offerings) return false;
  const set = new Set(offerings);
  if (!set.has("online_ordering")) return false;
  return !set.has("pickup") && !set.has("delivery") && !set.has("delivery_to_customer");
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
  /**
   * Whether the business has at least one active dish/item in its catalog.
   * If false, ordering cannot succeed and needs setup.
   * Omitted or true means dishes are present.
   */
  hasActiveDish?: boolean;
}

export function computeFeatureStatus(
  feature: StorefrontFeature,
  input: ResolveStorefrontFeaturesInput
): FeatureStatusDetail {
  const caps = new Set(input.capabilities);
  const selected = new Set(input.offerings ?? []);
  const built = input.built;
  const currencyOk = input.currency === undefined || input.currency === null ? true : isOnlinePaymentCurrencySupported(input.currency);
  const hasDishes = input.hasActiveDish === undefined || input.hasActiveDish === null ? true : Boolean(input.hasActiveDish);
  const fulfilmentTicked = selected.has("pickup") || selected.has("delivery") || selected.has("delivery_to_customer");

  switch (feature) {
    case "ordering": {
      const ticked = selected.has("online_ordering");
      if (!ticked) {
        return {
          feature,
          status: "off",
          live: false,
          reason: "not_ticked",
          reasonText: STOREFRONT_STATUS_REASONS.not_ticked,
          statusLine: "Off",
        };
      }
      if (!built.ordering) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "feature_not_built",
          reasonText: STOREFRONT_STATUS_REASONS.feature_not_built,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.feature_not_built}`,
        };
      }
      if (!caps.has("ONLINE_ORDERING")) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "missing_capability",
          reasonText: STOREFRONT_STATUS_REASONS.missing_capability,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.missing_capability}`,
        };
      }
      if (!fulfilmentTicked) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "no_fulfilment",
          reasonText: STOREFRONT_STATUS_REASONS.no_fulfilment,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.no_fulfilment}`,
        };
      }
      if (!hasDishes) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "no_active_dish",
          reasonText: STOREFRONT_STATUS_REASONS.no_active_dish,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.no_active_dish}`,
        };
      }
      return {
        feature,
        status: "live",
        live: true,
        statusLine: "Live",
      };
    }
    case "pickup": {
      const ticked = selected.has("pickup");
      if (!ticked) {
        return {
          feature,
          status: "off",
          live: false,
          reason: "not_ticked",
          reasonText: STOREFRONT_STATUS_REASONS.not_ticked,
          statusLine: "Off",
        };
      }
      if (!built.pickup) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "feature_not_built",
          reasonText: STOREFRONT_STATUS_REASONS.feature_not_built,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.feature_not_built}`,
        };
      }
      if (!caps.has("PICKUP")) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "missing_capability",
          reasonText: STOREFRONT_STATUS_REASONS.missing_capability,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.missing_capability}`,
        };
      }
      const orderingStatus = computeFeatureStatus("ordering", input);
      if (!orderingStatus.live) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: orderingStatus.reason,
          reasonText: orderingStatus.reasonText,
          statusLine: orderingStatus.statusLine,
        };
      }
      return {
        feature,
        status: "live",
        live: true,
        statusLine: "Live",
      };
    }
    case "delivery": {
      const ticked = selected.has("delivery") || selected.has("delivery_to_customer");
      if (!ticked) {
        return {
          feature,
          status: "off",
          live: false,
          reason: "not_ticked",
          reasonText: STOREFRONT_STATUS_REASONS.not_ticked,
          statusLine: "Off",
        };
      }
      if (!built.delivery) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "feature_not_built",
          reasonText: STOREFRONT_STATUS_REASONS.feature_not_built,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.feature_not_built}`,
        };
      }
      if (!caps.has("DELIVERY")) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "missing_capability",
          reasonText: STOREFRONT_STATUS_REASONS.missing_capability,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.missing_capability}`,
        };
      }
      return {
        feature,
        status: "live",
        live: true,
        statusLine: "Live",
      };
    }
    case "onlinePayment": {
      const ticked = selected.has("online_payment");
      if (!ticked) {
        return {
          feature,
          status: "off",
          live: false,
          reason: "not_ticked",
          reasonText: STOREFRONT_STATUS_REASONS.not_ticked,
          statusLine: "Off",
        };
      }
      if (!built.onlinePayment) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "feature_not_built",
          reasonText: STOREFRONT_STATUS_REASONS.feature_not_built,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.feature_not_built}`,
        };
      }
      if (!currencyOk) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "currency_not_supported",
          reasonText: STOREFRONT_STATUS_REASONS.currency_not_supported,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.currency_not_supported}`,
        };
      }
      if (selected.has("online_ordering")) {
        const orderingStatus = computeFeatureStatus("ordering", input);
        if (!orderingStatus.live) {
          return {
            feature,
            status: "needs_setup",
            live: false,
            reason: orderingStatus.reason,
            reasonText: orderingStatus.reasonText,
            statusLine: orderingStatus.statusLine,
          };
        }
      } else if (!caps.has("ONLINE_PAYMENT")) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "missing_capability",
          reasonText: STOREFRONT_STATUS_REASONS.missing_capability,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.missing_capability}`,
        };
      }
      return {
        feature,
        status: "live",
        live: true,
        statusLine: "Live",
      };
    }
    case "reservations": {
      const ticked = selected.has("table_reservations");
      if (!ticked) {
        return {
          feature,
          status: "off",
          live: false,
          reason: "not_ticked",
          reasonText: STOREFRONT_STATUS_REASONS.not_ticked,
          statusLine: "Off",
        };
      }
      if (!built.reservations) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "feature_not_built",
          reasonText: STOREFRONT_STATUS_REASONS.feature_not_built,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.feature_not_built}`,
        };
      }
      if (!caps.has("RESERVATIONS") && !caps.has("TABLES")) {
        return {
          feature,
          status: "needs_setup",
          live: false,
          reason: "missing_capability",
          reasonText: STOREFRONT_STATUS_REASONS.missing_capability,
          statusLine: `Needs setup — ${STOREFRONT_STATUS_REASONS.missing_capability}`,
        };
      }
      return {
        feature,
        status: "live",
        live: true,
        statusLine: "Live",
      };
    }
  }
}

export function getStorefrontFeatureStatus(
  feature: StorefrontFeature,
  input: ResolveStorefrontFeaturesInput
): FeatureStatusDetail {
  return computeFeatureStatus(feature, input);
}

/**
 * A feature is exposed only when the business type supports it, the owner
 * selected it, and the active template has a real implementation.
 * Online payment additionally requires a gateway-supported currency.
 */
export function resolveStorefrontFeatures(
  input: ResolveStorefrontFeaturesInput
): ResolvedStorefrontFeatures {
  const statusDetails = Object.fromEntries(
    STOREFRONT_FEATURES.map((feature) => [feature, computeFeatureStatus(feature, input)])
  ) as Record<StorefrontFeature, FeatureStatusDetail>;

  const reasons = Object.fromEntries(
    STOREFRONT_FEATURES.flatMap((feature) => {
      const reason = statusDetails[feature].reasonText;
      return reason ? [[feature, reason]] : [];
    })
  ) as Partial<Record<StorefrontFeature, string>>;

  return {
    ordering: statusDetails.ordering.live,
    delivery: statusDetails.delivery.live,
    pickup: statusDetails.pickup.live,
    reservations: statusDetails.reservations.live,
    onlinePayment: statusDetails.onlinePayment.live,
    status: statusDetails,
    reasons,
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
