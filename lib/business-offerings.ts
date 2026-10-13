/**
 * Stable, code-owned offering choices for business listings.
 * Persist only these keys; labels are translated from messages/*.
 */

import {
  getCapabilitiesForBusiness,
  type Capability,
} from "./business-taxonomy";

export type BusinessOfferingKind = "fact" | "feature";

export interface BusinessOffering {
  key: string;
  labelKey: string;
  kind: BusinessOfferingKind;
  requiresCapability?: Capability;
}

const restaurantFacts: BusinessOffering[] = [
  { key: "dine_in", labelKey: "dine_in", kind: "fact" },
  { key: "catering", labelKey: "catering", kind: "fact" },
  { key: "outdoor_seating", labelKey: "outdoor_seating", kind: "fact" },
  { key: "parking", labelKey: "parking", kind: "fact" },
  { key: "wifi", labelKey: "wifi", kind: "fact" },
  { key: "live_music", labelKey: "live_music", kind: "fact" },
];

const restaurantFeatures: BusinessOffering[] = [
  { key: "pickup", labelKey: "pickup", kind: "feature", requiresCapability: "PICKUP" },
  { key: "delivery", labelKey: "delivery", kind: "feature", requiresCapability: "DELIVERY" },
  { key: "online_ordering", labelKey: "online_ordering", kind: "feature", requiresCapability: "ONLINE_ORDERING" },
  { key: "online_payment", labelKey: "online_payment", kind: "feature", requiresCapability: "ONLINE_PAYMENT" },
  { key: "table_reservations", labelKey: "table_reservations", kind: "feature", requiresCapability: "RESERVATIONS" },
];

const carRentalOfferings: BusinessOffering[] = [
  { key: "daily_rental", labelKey: "daily_rental", kind: "fact" },
  { key: "weekly_rental", labelKey: "weekly_rental", kind: "fact" },
  { key: "airport_pickup", labelKey: "airport_pickup", kind: "fact" },
  { key: "chauffeur", labelKey: "chauffeur", kind: "fact" },
  { key: "delivery_to_customer", labelKey: "delivery_to_customer", kind: "feature", requiresCapability: "DELIVERY" },
];

const genericOfferings: BusinessOffering[] = [
  { key: "online_ordering", labelKey: "online_ordering", kind: "feature", requiresCapability: "ONLINE_ORDERING" },
  { key: "parking", labelKey: "parking", kind: "fact" },
  { key: "wifi", labelKey: "wifi", kind: "fact" },
];

/** Adding a business type or category is a single entry in these registries. */
export const BUSINESS_OFFERINGS_BY_TYPE: Readonly<Record<string, readonly BusinessOffering[]>> = {
  "Custom Business": genericOfferings,
  "Full-Service Restaurant": [...restaurantFacts, ...restaurantFeatures],
  "Fast Food / Quick Service": [
    ...restaurantFacts,
    ...restaurantFeatures.filter((offering) => offering.key !== "table_reservations"),
  ],
  "Specialty Restaurant": [...restaurantFacts, ...restaurantFeatures],
  "Fine Dining": [...restaurantFacts, ...restaurantFeatures],
  "Car Rental": carRentalOfferings,
  "Motorcycle Rental": carRentalOfferings,
  "Van Rental": carRentalOfferings,
};

export const BUSINESS_OFFERINGS_BY_CATEGORY: Readonly<Record<string, readonly BusinessOffering[]>> = {
  Restaurant: [...restaurantFacts, ...restaurantFeatures],
  "Vehicle Rental": carRentalOfferings,
};

export const GENERIC_BUSINESS_OFFERINGS = genericOfferings;
export const MAX_BUSINESS_OFFERINGS = 20;
export const BUSINESS_OFFERING_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

export function getBusinessOfferings(
  businessType?: string | null,
  category?: string | null
): readonly BusinessOffering[] {
  if (businessType && BUSINESS_OFFERINGS_BY_TYPE[businessType]) {
    return BUSINESS_OFFERINGS_BY_TYPE[businessType];
  }
  if (category && BUSINESS_OFFERINGS_BY_CATEGORY[category]) {
    return BUSINESS_OFFERINGS_BY_CATEGORY[category];
  }
  return GENERIC_BUSINESS_OFFERINGS;
}

export function getDefaultBusinessOfferings(
  industry: string,
  category: string,
  businessType?: string | null
): string[] {
  const capabilities = new Set(getCapabilitiesForBusiness(industry, category, businessType ?? ""));
  return getBusinessOfferings(businessType, category)
    .filter((offering) => offering.kind === "feature" && offering.requiresCapability && capabilities.has(offering.requiresCapability))
    .map((offering) => offering.key);
}

export interface BusinessOfferingsValidation {
  valid: boolean;
  offerings: string[];
  error?: string;
}

export function validateBusinessOfferings(
  value: unknown,
  businessType?: string | null,
  category?: string | null
): BusinessOfferingsValidation {
  if (!Array.isArray(value) || value.length > MAX_BUSINESS_OFFERINGS) {
    return { valid: false, offerings: [], error: `Offerings must be an array of at most ${MAX_BUSINESS_OFFERINGS} keys.` };
  }

  const catalogKeys = new Set(getBusinessOfferings(businessType, category).map((offering) => offering.key));
  const seen = new Set<string>();
  const offerings: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !BUSINESS_OFFERING_KEY_PATTERN.test(entry)) {
      return { valid: false, offerings: [], error: "Offerings must use valid stable keys." };
    }
    if (!catalogKeys.has(entry)) {
      return { valid: false, offerings: [], error: `Unknown offering: ${entry}` };
    }
    if (seen.has(entry)) {
      return { valid: false, offerings: [], error: `Duplicate offering: ${entry}` };
    }
    seen.add(entry);
    offerings.push(entry);
  }
  return { valid: true, offerings };
}

export function getSelectedFactOfferings(
  selectedKeys: readonly string[] | null | undefined,
  businessType?: string | null,
  category?: string | null
): BusinessOffering[] {
  const selected = new Set(selectedKeys ?? []);
  return getBusinessOfferings(businessType, category)
    .filter((offering) => offering.kind === "fact" && selected.has(offering.key));
}
