/**
 * lib/business-dashboard-modules.ts
 * Capability-driven dashboard module registry.
 * Single source: lib/business-taxonomy.ts CAPABILITIES.
 * Business -> BusinessType -> Capabilities -> Visible modules.
 */

import type { Capability } from "./business-taxonomy";
import { getCapabilitiesForBusiness } from "./business-taxonomy";
import { FLAGSHIP_TEMPLATES } from "./website-template-v2";
import { getBuiltStorefrontFeaturesFromTemplates, resolveStorefrontFeatures } from "./storefront-features";

export type BusinessModule = {
  key: string;
  label: string;
  hrefSuffix: string;
  icon: string;
  requiredCapabilities: Capability[];
  description: string;
  routeExists?: boolean;
};

// Capability to module mapping — one dashboard, filtered by capabilities.
// Modules not listed here are either universal (overview/settings) or future.
export const BUSINESS_MODULES: readonly BusinessModule[] = [
  {
    key: "products",
    label: "Products",
    hrefSuffix: "products",
    icon: "ShoppingBag",
    requiredCapabilities: ["PRODUCTS"],
    description: "Catalog, inventory and variants",
  },
  {
    key: "orders",
    label: "Orders",
    hrefSuffix: "orders",
    icon: "Store",
    requiredCapabilities: ["ORDERS", "ONLINE_ORDERING"],
    description: "Orders and fulfillment",
    routeExists: false,
  },
  {
    key: "reservations",
    label: "Reservations",
    hrefSuffix: "reservations",
    icon: "CalendarCheck",
    requiredCapabilities: ["RESERVATIONS", "TABLES"],
    description: "Tables and reservations",
    routeExists: false,
  },
  {
    key: "bookings",
    label: "Bookings",
    hrefSuffix: "bookings",
    icon: "CalendarDays",
    requiredCapabilities: ["BOOKINGS", "APPOINTMENTS"],
    description: "Services and appointments",
  },
  {
    key: "services",
    label: "Services",
    hrefSuffix: "services",
    icon: "Briefcase",
    requiredCapabilities: ["SERVICES"],
    description: "Service catalog",
  },
  {
    key: "vehicles",
    label: "Vehicles",
    hrefSuffix: "vehicles",
    icon: "Car",
    requiredCapabilities: ["VEHICLES", "VEHICLE_RENTAL"],
    description: "Fleet and rentals",
  },
  {
    key: "rooms",
    label: "Rooms",
    hrefSuffix: "rooms",
    icon: "BedDouble",
    requiredCapabilities: ["ROOMS"],
    description: "Rooms and availability",
  },
  {
    key: "menu",
    label: "Menu",
    hrefSuffix: "menu",
    icon: "Utensils",
    requiredCapabilities: ["MENU"],
    description: "Menu and ordering",
  },
  {
    key: "branches",
    label: "Branches",
    hrefSuffix: "branches",
    icon: "MapPin",
    requiredCapabilities: ["BRANCHES"],
    description: "Locations and branches",
  },
  {
    key: "customers",
    label: "Customers",
    hrefSuffix: "customers",
    icon: "Users",
    requiredCapabilities: ["CUSTOMERS"],
    description: "Customer directory",
  },
  {
    key: "staff",
    label: "Staff",
    hrefSuffix: "staff",
    icon: "UserCog",
    requiredCapabilities: ["STAFF"],
    description: "Team and staff",
  },
  {
    key: "inventory",
    label: "Inventory",
    hrefSuffix: "inventory",
    icon: "Boxes",
    requiredCapabilities: ["INVENTORY", "POS"],
    description: "Stock and POS",
  },
  {
    key: "reviews",
    label: "Reviews",
    hrefSuffix: "reviews",
    icon: "Star",
    requiredCapabilities: ["REVIEWS"],
    description: "Customer reviews",
  },
  {
    key: "analytics",
    label: "Analytics",
    hrefSuffix: "analytics",
    icon: "BarChart2",
    requiredCapabilities: ["ANALYTICS"],
    description: "Insights and reports",
  },
] as const;

export function getModulesForCapabilities(caps: readonly Capability[]): BusinessModule[] {
  const set = new Set(caps as string[]);
  return BUSINESS_MODULES.filter((m) => m.routeExists !== false && m.requiredCapabilities.some((c) => set.has(c)));
}

export function getModulesForBusiness(
  industry: string,
  category: string,
  businessType: string | null | undefined,
  offerings: readonly string[] | null | undefined = []
): BusinessModule[] {
  const caps = getCapabilitiesForBusiness(industry, category, businessType ?? "");
  const storefront = resolveStorefrontFeatures({
    capabilities: caps,
    offerings,
    built: getBuiltStorefrontFeaturesFromTemplates(FLAGSHIP_TEMPLATES),
  });
  return getModulesForCapabilities(caps).filter((module) => module.key !== "reservations" || storefront.reservations);
}

export function hasModuleCapability(caps: readonly Capability[], moduleKey: string): boolean {
  const mod = BUSINESS_MODULES.find((m) => m.key === moduleKey);
  if (!mod) return false;
  const set = new Set(caps as string[]);
  return mod.requiredCapabilities.some((c) => set.has(c));
}
