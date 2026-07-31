/**
 * Organization profile module registry — maps `org_type` to the set of
 * profile modules/tabs that organization gets. This is the one place that
 * decision is made; adding a new org type or module later is a config
 * change here plus a new module component, not a page rewrite.
 *
 * IMPORTANT: only modules with real backend support are listed. Restaurant
 * (Menu/Reservations), car dealer (Vehicle Inventory), dentist (Booking),
 * etc. have no data model yet (no menu_items/reservations/vehicles/services
 * tables) — do not add them here until that backend work exists. The
 * `events` and `fundraisers` tables have no org_type restriction today (any
 * organizer row can have either regardless of type), so every type below
 * currently gets the same base module set — the per-type structure exists
 * so that changes only ever a matter of editing this map.
 */

export type OrgType =
  | "nonprofit"
  | "business"
  | "church"
  | "school"
  | "creator"
  | "community"
  | "government"
  | "restaurant"
  | "sports_club"
  | "other";

export type ProfileModuleId = "overview" | "campaigns" | "events" | "about";

const BASE_MODULES: ProfileModuleId[] = ["overview", "events", "campaigns", "about"];

export const MODULES_BY_ORG_TYPE: Record<OrgType, ProfileModuleId[]> = {
  nonprofit: BASE_MODULES,
  business: BASE_MODULES,
  church: BASE_MODULES,
  school: BASE_MODULES,
  creator: BASE_MODULES,
  community: BASE_MODULES,
  government: BASE_MODULES,
  restaurant: BASE_MODULES,
  sports_club: BASE_MODULES,
  other: BASE_MODULES,
};

/** Resolves the module list for a given org_type, defaulting to "other" for unrecognized/null values. */
export function getEnabledModules(orgType: string | null | undefined): ProfileModuleId[] {
  const key = (orgType ?? "other") as OrgType;
  return MODULES_BY_ORG_TYPE[key] ?? MODULES_BY_ORG_TYPE.other;
}
