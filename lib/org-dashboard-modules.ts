/**
 * lib/org-dashboard-modules.ts
 *
 * Capability-driven navigation for the organization workspace sidebar
 * (`app/dashboard/org/[id]/`, via `org-nav-items.ts`).
 *
 * Reuses the shared vocabulary from `lib/business-taxonomy.ts` (`Capability`,
 * `getCapabilitiesForBusiness`) and mirrors the idea of
 * `lib/business-dashboard-modules.ts` — but that table targets the *business*
 * dashboard (`/dashboard/businesses/[id]/*`), while this one targets the *org*
 * workspace (`/dashboard/org/[id]/*`: overview/website/events/fundraisers
 * plus catalog pages). The BUSINESS_MODULES table itself is NOT duplicated;
 * only the capability names (the shared taxonomy) are referenced.
 *
 * Three gating dimensions:
 * - organizer type flags (events/fundraisers/business) from the shared row
 *   classifier in `layout.tsx`.
 * - count-gated Shop visibility from owner product rows.
 * - capability-gated business modules (services/menu/orders/reservations): shown when the linked business
 *   capabilities include SERVICES/MENU **or** catalog rows already exist.
 *   Links are NEVER hidden while rows exist, so no owner can lose the only
 *   UI that enters dishes/services (the website menu_embed/services_embed
 *   blocks and the v2 dish picker read those same tables).
 *
 * Orders/Reservations/Fleet/Bookings are reserved: defined with their
 * capabilities but `routeExists: false`, so they never render until the
 * pages exist under `app/dashboard/org/[id]/`. (Reservations shipped in
 * Phase 7; fleet/bookings remain reserved.)
 */

import type { Capability } from "./business-taxonomy";
import { getCapabilitiesForBusiness } from "./business-taxonomy";
import type { OrganizerDashboardTypeFlags } from "./organizer-dashboard-classifier";

export type OrgNavVisibility =
  | { kind: "always" }
  | { kind: "count"; flag: "products" }
  | { kind: "organizer-type"; flag: "events" | "fundraisers" | "business" | "any" }
  | { kind: "capability"; capabilities: Capability[]; existence: "menuRows" | "serviceRows" | "reservationRows" };

export interface OrgNavModule {
  /** Stable id; also the `Organizer` i18n key and English fallback lowercased. */
  key: string;
  label: string;
  hrefSuffix: string;
  icon: string;
  visibility: OrgNavVisibility;
  /** False for reserved items whose routes do not exist yet — never rendered. */
  routeExists: boolean;
}

export const ORG_NAV_MODULES: readonly OrgNavModule[] = [
  { key: "overview", label: "Overview", hrefSuffix: "overview", icon: "LayoutDashboard", visibility: { kind: "always" }, routeExists: true },
  { key: "website", label: "Website", hrefSuffix: "website", icon: "Globe", visibility: { kind: "organizer-type", flag: "business" }, routeExists: true },
  { key: "events", label: "Events", hrefSuffix: "events", icon: "Calendar", visibility: { kind: "organizer-type", flag: "events" }, routeExists: true },
  { key: "fundraisers", label: "Fundraisers", hrefSuffix: "fundraisers", icon: "Heart", visibility: { kind: "organizer-type", flag: "fundraisers" }, routeExists: true },
  { key: "shop", label: "Shop", hrefSuffix: "products", icon: "ShoppingBag", visibility: { kind: "count", flag: "products" }, routeExists: true },
  { key: "services", label: "Services", hrefSuffix: "services", icon: "Briefcase", visibility: { kind: "capability", capabilities: ["SERVICES"], existence: "serviceRows" }, routeExists: true },
  { key: "menu", label: "Menu", hrefSuffix: "menu", icon: "Utensils", visibility: { kind: "capability", capabilities: ["MENU"], existence: "menuRows" }, routeExists: true },
  { key: "orders", label: "Orders", hrefSuffix: "orders", icon: "Store", visibility: { kind: "capability", capabilities: ["ORDERS", "ONLINE_ORDERING"], existence: "menuRows" }, routeExists: true },
  { key: "reservations", label: "Reservations", hrefSuffix: "reservations", icon: "CalendarCheck", visibility: { kind: "capability", capabilities: ["RESERVATIONS", "TABLES"], existence: "reservationRows" }, routeExists: true },
  { key: "fleet", label: "Fleet", hrefSuffix: "fleet", icon: "Car", visibility: { kind: "capability", capabilities: ["VEHICLES", "VEHICLE_RENTAL"], existence: "menuRows" }, routeExists: false },
  { key: "bookings", label: "Bookings", hrefSuffix: "bookings", icon: "CalendarDays", visibility: { kind: "capability", capabilities: ["BOOKINGS", "APPOINTMENTS"], existence: "serviceRows" }, routeExists: false },
  { key: "reviews", label: "Reviews", hrefSuffix: "reviews", icon: "Star", visibility: { kind: "always" }, routeExists: true },
  { key: "analytics", label: "Analytics", hrefSuffix: "analytics", icon: "BarChart2", visibility: { kind: "organizer-type", flag: "any" }, routeExists: true },
  { key: "settings", label: "Settings", hrefSuffix: "settings", icon: "Settings", visibility: { kind: "always" }, routeExists: true },
];

export interface OrgNavSignalCounts {
  organizerTypes: OrganizerDashboardTypeFlags;
  hasProducts?: boolean;
  hasMenuRows?: boolean;
  hasServiceRows?: boolean;
  /** True when at least one reservation row exists (never hide data entry UI). */
  hasReservationRows?: boolean;
  /** Union of owner-selected stable offering keys across linked businesses. */
  offerings?: readonly string[] | null;
}

function isModuleVisible(
  module: OrgNavModule,
  capabilities: Set<string>,
  counts: OrgNavSignalCounts
): boolean {
  const visibility = module.visibility;
  if (visibility.kind === "always") return true;
  if (visibility.kind === "count") {
    return counts.hasProducts === true;
  }
  if (visibility.kind === "organizer-type") {
    if (visibility.flag === "events") return counts.organizerTypes.hasEvents;
    if (visibility.flag === "fundraisers") return counts.organizerTypes.hasFundraisers;
    if (visibility.flag === "business") return counts.organizerTypes.hasBusiness;
    return !counts.organizerTypes.isNone;
  }
  if (!counts.organizerTypes.hasBusiness) return false;
  // Orders nav item shows whenever the owner has selected the online_ordering
  // offering — managers need dashboard access to manage orders even before the
  // storefront is fully live (e.g. fulfilment method not yet configured).
  // The storefront fulfilment rule only affects what customers see; nav access
  // is gated on the offering selection alone (capability still required below).
  if (module.key === "orders") {
    const hasOrderingOffering = (counts.offerings ?? []).includes("online_ordering");
    if (!hasOrderingOffering) return false;
  }
  // Reservations shows when the owner ticked table_reservations (capability
  // still required below) — managers need access even before the storefront
  // is fully live. Existing rows always win so owners never lose data access.
  if (module.key === "reservations") {
    if (counts.hasReservationRows === true) return true;
    const hasReservationOffering = (counts.offerings ?? []).includes("table_reservations");
    if (!hasReservationOffering) return false;
  }
  // Capability-gated: capability match OR existing rows (rows always win —
  // hiding the only catalog-entry UI would strand owner data).
  if (visibility.existence === "menuRows" && counts.hasMenuRows === true) return true;
  if (visibility.existence === "serviceRows" && counts.hasServiceRows === true) return true;
  if (visibility.existence === "reservationRows" && counts.hasReservationRows === true) return true;
  return visibility.capabilities.some((capability) => capabilities.has(capability));
}

/** Renderable modules in sidebar order (reserved `routeExists: false` items excluded). */
export function getOrgNavModules(
  capabilities: readonly Capability[],
  counts: OrgNavSignalCounts
): OrgNavModule[] {
  const set = new Set(capabilities as string[]);
  return ORG_NAV_MODULES.filter((module) => module.routeExists && isModuleVisible(module, set, counts));
}

/** Reserved items (fleet/bookings): defined, never rendered yet. */
export function getReservedOrgNavModules(): OrgNavModule[] {
  return ORG_NAV_MODULES.filter((module) => !module.routeExists);
}

export interface LinkedBusinessShape {
  industry?: string | null;
  category?: string | null;
  business_type?: string | null;
}

/**
 * Union capabilities across every linked business row. An org with several
 * businesses gets the union (a restaurant + cleaning company sees both Menu
 * and Services). No linked business → the taxonomy fallback
 * (CONTENT/GALLERY/CUSTOMERS/REVIEWS), which gates nothing catalog-related.
 */
export function getCapabilitiesForBusinesses(rows: LinkedBusinessShape[]): Capability[] {
  const union = new Set<Capability>();
  if (rows.length === 0) {
    for (const capability of getCapabilitiesForBusiness("", "", "")) union.add(capability);
    return [...union];
  }
  for (const row of rows) {
    for (const capability of getCapabilitiesForBusiness(row.industry ?? "", row.category ?? "", row.business_type ?? "")) {
      union.add(capability);
    }
  }
  return [...union];
}
