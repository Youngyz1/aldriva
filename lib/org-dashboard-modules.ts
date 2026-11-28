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
 * Phase 7; Bookings shipped in Run 2C; fleet remains reserved.)
 */

import type { Capability } from "./business-taxonomy";
import { getCapabilitiesForBusiness } from "./business-taxonomy";
import type { OrganizerDashboardTypeFlags } from "./organizer-dashboard-classifier";
import {
  MODULE_REGISTRY,
  type OrgNavVisibility,
} from "./dashboard/modules";

export type { OrgNavVisibility };

export interface OrgNavModule {
  /** Stable id; also the `Organizer` i18n key and English fallback lowercased. */
  key: string;
  label: string;
  hrefSuffix: string;
  icon: string;
  visibility: OrgNavVisibility;
  /** False for reserved items whose routes do not exist yet — never rendered. */
  routeExists: boolean;
  /** When set, this module is nested as a child under the module with this
   *  key, instead of rendered as its own top-level nav item. */
  parent?: string;
}

/**
 * Adapter over MODULE_REGISTRY (docs/design/dashboard-overview/02-module-contract.md §1).
 * Preserves byte-identical navigation structures and ordering.
 * The bookings entry in MODULE_REGISTRY (routeExists: true, existence: "activeServiceRows")
 * flows through automatically and gates on ≥1 active service or BOOKINGS/APPOINTMENTS capability.
 */
export const ORG_NAV_MODULES: readonly OrgNavModule[] = MODULE_REGISTRY
  .filter((m): m is typeof m & { nav: { visibility: OrgNavVisibility } } => Boolean(m.nav?.visibility))
  .map((m) => ({
    key: m.id,
    label: m.nav.label,
    hrefSuffix: m.nav.hrefSuffix,
    icon: m.nav.icon,
    visibility: m.nav.visibility,
    routeExists: m.routeExists ?? true,
    parent: m.nav.parent,
  }));

export interface OrgNavSignalCounts {
  organizerTypes: OrganizerDashboardTypeFlags;
  hasProducts?: boolean;
  hasMenuRows?: boolean;
  hasServiceRows?: boolean;
  /** True when at least one ACTIVE service row exists (gates Bookings only — "services" keeps the any-row rule above). */
  hasActiveServiceRows?: boolean;
  /** True when at least one reservation row exists (never hide data entry UI). */
  hasReservationRows?: boolean;
  /** True when at least one fleet/vehicle row exists (never hide data entry UI). */
  hasFleetRows?: boolean;
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
  if (visibility.existence === "activeServiceRows" && counts.hasActiveServiceRows === true) return true;
  if (visibility.existence === "fleetRows" && counts.hasFleetRows === true) return true;
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
