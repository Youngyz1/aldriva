/**
 * lib/dashboard/modules.ts
 *
 * Unified Module Registry for navigation, shell, and overview surfaces.
 * Implements docs/design/dashboard-overview/02-module-contract.md §1.
 */

import type { Capability } from "../business-taxonomy";
import type {
  DashboardSurface,
  ModuleContext,
  ModuleId,
  ModuleResult,
} from "./types";

export type { DashboardSurface, ModuleContext, ModuleId, ModuleResult };

export type OrgNavVisibility =
  | { kind: "always" }
  | { kind: "count"; flag: "products" }
  | { kind: "organizer-type"; flag: "events" | "fundraisers" | "business" | "any" }
  | { kind: "capability"; capabilities: Capability[]; existence?: "menuRows" | "serviceRows" | "reservationRows" | "activeServiceRows" | "fleetRows" };

export interface ModuleNavConfig {
  hrefSuffix: string;
  icon: string;
  group: "primary" | "manage" | "more";
  label: string;
  visibility?: OrgNavVisibility;
  /** When set, this module renders as a child in another module's
   *  collapsible nav submenu (matched by that module's `id`) instead of
   *  as its own top-level sidebar item. Adding a new child later is one
   *  line: a new module entry with this field set to the same parent id. */
  parent?: ModuleId;
}

export interface ModuleDefinition {
  id: ModuleId;
  capabilities: Capability[];
  anyOfOfferings?: string[];
  permission: "view" | "manage";
  surfaces: DashboardSurface[];
  period: "none" | "range";
  nav?: ModuleNavConfig;
  i18n: { title: string; empty: string; error: string };
  href: (ctx: ModuleContext) => string;
  load: (ctx: ModuleContext) => Promise<ModuleResult<unknown>>;
  emptyWhen: (data: unknown) => boolean;
  routeExists?: boolean;
}

const stubLoad = async (): Promise<ModuleResult<null>> => ({ status: "ok", data: null });
const defaultEmptyWhen = (data: unknown) => data === null || data === undefined;

export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  // ── Nav & Workspace Modules ────────────────────────────────────────────────
  {
    id: "overview",
    capabilities: [],
    permission: "view",
    surfaces: ["nav", "shell"],
    period: "none",
    nav: {
      hrefSuffix: "overview",
      icon: "LayoutDashboard",
      group: "primary",
      label: "Overview",
      visibility: { kind: "always" },
    },
    i18n: { title: "Organizer.overview", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/overview`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "website",
    capabilities: [],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "website",
      icon: "Globe",
      group: "primary",
      label: "Website",
      visibility: { kind: "organizer-type", flag: "business" },
    },
    i18n: { title: "Organizer.website", empty: "Website.empty", error: "Website.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/website`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "events",
    capabilities: [],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "events",
      icon: "Calendar",
      group: "primary",
      label: "Events",
      visibility: { kind: "organizer-type", flag: "events" },
    },
    i18n: { title: "Organizer.events", empty: "Events.empty", error: "Events.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/events`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "fundraisers",
    capabilities: [],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "fundraisers",
      icon: "Heart",
      group: "primary",
      label: "Fundraisers",
      visibility: { kind: "organizer-type", flag: "fundraisers" },
    },
    i18n: { title: "Organizer.fundraisers", empty: "Fundraisers.empty", error: "Fundraisers.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/fundraisers`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "shop",
    capabilities: ["PRODUCTS"],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "products",
      icon: "ShoppingBag",
      group: "manage",
      label: "Shop",
      visibility: { kind: "count", flag: "products" },
    },
    i18n: { title: "Organizer.shop", empty: "Shop.empty", error: "Shop.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/products`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "services",
    capabilities: ["SERVICES"],
    permission: "manage",
    surfaces: ["nav", "overview"],
    period: "none",
    nav: {
      hrefSuffix: "services",
      icon: "Briefcase",
      group: "manage",
      label: "Services",
      visibility: { kind: "capability", capabilities: ["SERVICES"], existence: "serviceRows" },
    },
    i18n: { title: "Organizer.services", empty: "Services.empty", error: "Services.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/services`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
    routeExists: true,
  },
  {
    id: "menu",
    capabilities: ["MENU"],
    permission: "manage",
    surfaces: ["nav", "overview"],
    period: "none",
    nav: {
      hrefSuffix: "menu",
      icon: "Utensils",
      group: "manage",
      label: "Menu",
      visibility: { kind: "capability", capabilities: ["MENU"], existence: "menuRows" },
    },
    i18n: { title: "Organizer.menu", empty: "Menu.empty", error: "Menu.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/menu`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
    routeExists: true,
  },
  {
    id: "promotions",
    capabilities: ["MENU"],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "promotions",
      icon: "Tag",
      group: "more",
      label: "Promotions",
      visibility: { kind: "capability", capabilities: ["MENU"], existence: "menuRows" },
    },
    i18n: { title: "Organizer.promotions", empty: "Promotions.empty", error: "Promotions.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/promotions`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "orders",
    capabilities: ["ORDERS", "ONLINE_ORDERING"],
    anyOfOfferings: ["online_ordering"],
    permission: "manage",
    surfaces: ["nav", "overview"],
    period: "range",
    nav: {
      hrefSuffix: "orders",
      icon: "Store",
      group: "primary",
      label: "Orders",
      visibility: { kind: "capability", capabilities: ["ORDERS", "ONLINE_ORDERING"], existence: "menuRows" },
    },
    i18n: { title: "Organizer.orders", empty: "Orders.empty", error: "Orders.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/orders`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
    routeExists: true,
  },
  {
    id: "reservations",
    capabilities: ["RESERVATIONS", "TABLES"],
    anyOfOfferings: ["table_reservations"],
    permission: "manage",
    surfaces: ["nav", "overview"],
    period: "range",
    nav: {
      hrefSuffix: "reservations",
      icon: "CalendarCheck",
      group: "primary",
      label: "Reservations",
      visibility: { kind: "capability", capabilities: ["RESERVATIONS", "TABLES"], existence: "reservationRows" },
    },
    i18n: { title: "Organizer.reservations", empty: "Reservations.empty", error: "Reservations.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/reservations`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
    routeExists: true,
  },
  {
    id: "rentals",
    capabilities: ["VEHICLES", "VEHICLE_RENTAL"],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "rentals",
      icon: "CalendarClock",
      group: "manage",
      label: "Rentals",
      visibility: { kind: "capability", capabilities: ["VEHICLES", "VEHICLE_RENTAL"], existence: "fleetRows" },
    },
    i18n: { title: "Organizer.rentals", empty: "Rentals.empty", error: "Rentals.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/rentals`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "fleet",
    capabilities: ["VEHICLES", "VEHICLE_RENTAL"],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "fleet",
      icon: "Car",
      group: "manage",
      label: "Fleet",
      visibility: { kind: "capability", capabilities: ["VEHICLES", "VEHICLE_RENTAL"], existence: "fleetRows" },
    },
    i18n: { title: "Organizer.fleet", empty: "Fleet.empty", error: "Fleet.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/fleet`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "workforce",
    // Parent group for Branches/Staff (and whatever a later slice adds --
    // Roles, Schedules, Assignments, Skills -- each just needs nav.parent:
    // "workforce" set, no renderer changes). Same organizer-type visibility
    // Branches/Staff already used individually: confirmed with the owner
    // that there's no reliable "single-person business" signal anywhere in
    // the taxonomy data (only 25 of ~130 business types have ANY explicit
    // capability list, and only 6 of those include STAFF), so this stays
    // unconditional on business type, same as before.
    capabilities: [],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "workforce",
      icon: "Briefcase",
      group: "manage",
      label: "Workforce",
      visibility: { kind: "organizer-type", flag: "business" },
    },
    i18n: { title: "Organizer.workforce", empty: "Workforce.empty", error: "Workforce.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/workforce`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "branches",
    // Same reasoning as "staff" below: organizer-type visibility, not
    // capability-gated, so it shows for any business regardless of
    // capabilities (branches/business_branches is not itself a capability).
    capabilities: [],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "branches",
      icon: "MapPin",
      group: "manage",
      label: "Branches",
      visibility: { kind: "organizer-type", flag: "business" },
      parent: "workforce",
    },
    i18n: { title: "Organizer.branches", empty: "Branches.empty", error: "Branches.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/branches`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "staff",
    // Visibility below is organizer-type ("business"), not capability-gated --
    // shown to every organizer-level user with at least one business row,
    // regardless of that business's capabilities (e.g. Apex Car Rental has
    // no STAFF capability). capabilities: [] matches the same choice made
    // for "website" above, which uses the same visibility kind.
    capabilities: [],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "staff",
      icon: "UserCog",
      group: "manage",
      label: "Staff",
      visibility: { kind: "organizer-type", flag: "business" },
      parent: "workforce",
    },
    i18n: { title: "Organizer.staff", empty: "Staff.empty", error: "Staff.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/staff`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "bookings",
    capabilities: ["BOOKINGS", "APPOINTMENTS"],
    permission: "manage",
    surfaces: ["nav", "overview"],
    period: "range",
    nav: {
      hrefSuffix: "bookings",
      icon: "CalendarClock",
      group: "primary",
      label: "Bookings",
      // Visible on capability OR at least one active service, regardless of
      // whether the owner has switched booking acceptance on - the page itself
      // carries the on/off state and its own setup checklist.
      visibility: { kind: "capability", capabilities: ["BOOKINGS", "APPOINTMENTS"], existence: "activeServiceRows" },
    },
    i18n: { title: "Organizer.bookings", empty: "Bookings.empty", error: "Bookings.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/bookings`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
    routeExists: true,
  },
  {
    id: "reviews",
    capabilities: ["REVIEWS"],
    permission: "view",
    surfaces: ["nav", "overview"],
    period: "range",
    nav: {
      hrefSuffix: "reviews",
      icon: "Star",
      group: "more",
      label: "Reviews",
      visibility: { kind: "always" },
    },
    i18n: { title: "Organizer.reviews", empty: "Reviews.empty", error: "Reviews.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/reviews`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
    routeExists: true,
  },
  {
    id: "analytics",
    capabilities: ["ANALYTICS"],
    permission: "view",
    surfaces: ["nav"],
    period: "range",
    nav: {
      hrefSuffix: "analytics",
      icon: "BarChart2",
      group: "more",
      label: "Analytics",
      visibility: { kind: "organizer-type", flag: "any" },
    },
    i18n: { title: "Organizer.analytics", empty: "Analytics.empty", error: "Analytics.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/analytics`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "settings",
    capabilities: [],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "settings",
      icon: "Settings",
      group: "more",
      label: "Settings",
      visibility: { kind: "always" },
    },
    i18n: { title: "Organizer.settings", empty: "Settings.empty", error: "Settings.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/settings`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },
  {
    id: "kitchen",
    capabilities: ["MENU"],
    permission: "manage",
    surfaces: ["nav"],
    period: "none",
    nav: {
      hrefSuffix: "kitchen",
      icon: "ChefHat",
      group: "more",
      label: "Kitchen",
    },
    i18n: { title: "Organizer.kitchen", empty: "Kitchen.empty", error: "Kitchen.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/kitchen`,
    load: stubLoad,
    emptyWhen: () => false,
    routeExists: true,
  },

  // ── Overview-Only Aggregate & Metric Modules ───────────────────────────────
  {
    id: "kpi_sales",
    capabilities: ["ORDERS", "ONLINE_ORDERING"],
    permission: "view",
    surfaces: ["overview"],
    period: "range",
    i18n: { title: "Overview.kpi_sales", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/orders`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "trend_sales",
    capabilities: ["ORDERS", "ONLINE_ORDERING"],
    permission: "view",
    surfaces: ["overview"],
    period: "range",
    i18n: { title: "Overview.trend_sales", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/orders`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "live_orders",
    capabilities: ["ORDERS", "ONLINE_ORDERING"],
    permission: "view",
    surfaces: ["overview"],
    period: "none",
    i18n: { title: "Overview.live_orders", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/orders`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "kpi_reservations",
    capabilities: ["RESERVATIONS", "TABLES"],
    permission: "view",
    surfaces: ["overview"],
    period: "range",
    i18n: { title: "Overview.kpi_reservations", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/reservations`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "live_reservations",
    capabilities: ["RESERVATIONS", "TABLES"],
    permission: "view",
    surfaces: ["overview"],
    period: "none",
    i18n: { title: "Overview.live_reservations", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/reservations`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "kpi_bookings",
    capabilities: ["BOOKINGS", "APPOINTMENTS"],
    permission: "view",
    surfaces: ["overview"],
    period: "range",
    i18n: { title: "Overview.kpi_bookings", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/bookings`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "live_bookings",
    capabilities: ["BOOKINGS", "APPOINTMENTS"],
    permission: "view",
    surfaces: ["overview"],
    period: "none",
    i18n: { title: "Overview.live_bookings", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/bookings`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "event_metrics",
    capabilities: [],
    permission: "view",
    surfaces: ["overview"],
    period: "range",
    i18n: { title: "Overview.event_metrics", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/events`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "live_events",
    capabilities: [],
    permission: "view",
    surfaces: ["overview"],
    period: "none",
    i18n: { title: "Overview.live_events", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/events`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "fundraiser_metrics",
    capabilities: [],
    permission: "view",
    surfaces: ["overview"],
    period: "range",
    i18n: { title: "Overview.fundraiser_metrics", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/fundraisers`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "live_donations",
    capabilities: [],
    permission: "view",
    surfaces: ["overview"],
    period: "none",
    i18n: { title: "Overview.live_donations", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/fundraisers`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "catalog_menu",
    capabilities: ["MENU"],
    permission: "view",
    surfaces: ["overview"],
    period: "none",
    i18n: { title: "Overview.catalog_menu", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/menu`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "catalog_services",
    capabilities: ["SERVICES"],
    permission: "view",
    surfaces: ["overview"],
    period: "none",
    i18n: { title: "Overview.catalog_services", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/services`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "catalog_products",
    capabilities: ["PRODUCTS"],
    permission: "view",
    surfaces: ["overview"],
    period: "none",
    i18n: { title: "Overview.catalog_products", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/products`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "recent_activity",
    capabilities: [],
    permission: "view",
    surfaces: ["overview"],
    period: "range",
    i18n: { title: "Overview.recent_activity", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/overview`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
  {
    id: "attention",
    capabilities: [],
    permission: "view",
    surfaces: ["overview"],
    period: "none",
    i18n: { title: "Overview.attention", empty: "Overview.empty", error: "Overview.error" },
    href: (ctx) => `/dashboard/org/${ctx.organizerId}/overview`,
    load: stubLoad,
    emptyWhen: defaultEmptyWhen,
  },
] as const;

/**
 * Get module by ID from the registry.
 */
export function getModuleDefinition(id: ModuleId): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id);
}

/**
 * Filter modules for a specific surface.
 */
export function getModulesForSurface(surface: DashboardSurface): readonly ModuleDefinition[] {
  return MODULE_REGISTRY.filter((m) => m.surfaces.includes(surface));
}

/**
 * Return all capabilities recognized across commerce modules in the registry.
 */
export function getCommerceCapabilities(): readonly Capability[] {
  const caps = new Set<Capability>();
  for (const mod of MODULE_REGISTRY) {
    if (["orders", "reservations", "menu", "services", "shop"].includes(mod.id)) {
      for (const cap of mod.capabilities) caps.add(cap);
    }
  }
  return [...caps];
}
