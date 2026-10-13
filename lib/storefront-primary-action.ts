import { getCapabilitiesForBusiness } from "./business-taxonomy";
import {
  resolveStorefrontFeatures,
  type StorefrontFeatureState,
} from "./storefront-features";

export type PrimaryActionLabelKey =
  | "orderNow"
  | "reserveTable"
  | "bookNow"
  | "viewMenu"
  | "contact"
  | "rentalContactCta";

export interface StorefrontAction {
  labelKey: PrimaryActionLabelKey;
  href: string;
}

export interface ResolvePrimaryActionInput {
  industry?: string | null;
  category?: string | null;
  businessType?: string | null;
  features: {
    offerings?: readonly string[] | null;
    built: StorefrontFeatureState;
    /** Booking support is reserved for a future, independently gated flow. */
    bookings?: { selected: boolean; built: boolean };
  };
  builtPages: readonly string[] | ReadonlySet<string>;
}

export interface ResolvedPrimaryActions {
  primary?: StorefrontAction;
  secondary?: StorefrontAction;
}

type BusinessKind = "restaurant" | "rental" | "general";

/** Category defaults are data, so each added category needs one entry here. */
export const PRIMARY_ACTION_KIND_BY_CATEGORY: Readonly<Record<string, BusinessKind>> = {
  Restaurant: "restaurant",
  "Vehicle Rental": "rental",
};

const PRIMARY_ACTION_KIND_BY_TYPE: Readonly<Record<string, BusinessKind>> = {
  "Full-Service Restaurant": "restaurant",
  "Fast Food / Quick Service": "restaurant",
  "Specialty Restaurant": "restaurant",
  "Fine Dining": "restaurant",
  "Coffee Shop": "restaurant",
  "Bakery Café": "restaurant",
  "Car Rental": "rental",
  "Motorcycle Rental": "rental",
  "Van Rental": "rental",
  "Truck Rental": "rental",
  "Custom Business": "general",
};

function getBusinessKind(businessType?: string | null, category?: string | null): BusinessKind {
  if (businessType && PRIMARY_ACTION_KIND_BY_TYPE[businessType]) {
    return PRIMARY_ACTION_KIND_BY_TYPE[businessType];
  }
  return category ? PRIMARY_ACTION_KIND_BY_CATEGORY[category] ?? "general" : "general";
}

function getPageHref(slugs: Set<string>, slug: string): string | undefined {
  return slugs.has(slug) ? `/${slug}` : undefined;
}

/**
 * Choose the single safest primary action from gated, built features and the
 * pages the active resolver actually emitted. Never return a dead page link.
 */
export function resolvePrimaryAction({
  industry,
  category,
  businessType,
  features,
  builtPages,
}: ResolvePrimaryActionInput): ResolvedPrimaryActions {
  const capabilities = getCapabilitiesForBusiness(industry ?? "", category ?? "", businessType ?? "");
  const storefront = resolveStorefrontFeatures({
    capabilities,
    offerings: features.offerings,
    built: features.built,
  });
  const pages = new Set(builtPages);
  const kind = getBusinessKind(businessType, category);
  const contact = getPageHref(pages, "contact");
  const contactAction = contact
    ? { labelKey: kind === "rental" ? "rentalContactCta" as const : "contact" as const, href: contact }
    : undefined;

  const bookingsLive = Boolean(
    features.bookings?.selected &&
    features.bookings.built &&
    (capabilities.includes("BOOKINGS") || capabilities.includes("RESERVATIONS"))
  );
  const candidates: Array<{ live: boolean; page: string; action: PrimaryActionLabelKey }> = [
    { live: storefront.ordering, page: "menu", action: "orderNow" },
    { live: storefront.reservations, page: "reservations", action: "reserveTable" },
    { live: bookingsLive, page: "booking", action: "bookNow" },
  ];
  const liveCandidates = candidates.filter((candidate) => candidate.live);

  const preferred = liveCandidates[0];
  if (preferred) {
    const href = getPageHref(pages, preferred.page);
    if (!href) return { ...(contactAction ? { primary: contactAction } : {}) };
    const primary = { labelKey: preferred.action, href };
    const secondaryCandidate = liveCandidates
      .slice(1)
      .map((candidate) => ({
        labelKey: candidate.action,
        href: getPageHref(pages, candidate.page),
      }))
      .find((candidate) => candidate.href && candidate.href !== primary.href);
    return {
      primary,
      ...(secondaryCandidate?.href
        ? { secondary: { labelKey: secondaryCandidate.labelKey, href: secondaryCandidate.href } }
        : {}),
    };
  }

  const menu = getPageHref(pages, "menu");
  if (menu) return { primary: { labelKey: "viewMenu", href: menu } };
  return contactAction ? { primary: contactAction } : {};
}
