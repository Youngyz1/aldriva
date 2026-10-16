/**
 * lib/storefront-browse.ts
 *
 * Pure data + filtering layer for the shared storefront browse experience
 * (menu dishes and shop items). No React, no DB — unit-tested in
 * lib/__tests__/storefront-browse.test.cjs.
 *
 * The client component (`components/site/blocks/StorefrontBrowse.tsx`)
 * renders chips + search + detail sheet on top of server-rendered section
 * HTML; everything it needs arrives pre-serialized (prices pre-formatted by
 * the server, which owns currency + locale).
 */

export const BROWSE_ALL_GROUP = "all";

export interface BrowseDetailRow {
  label: string;
  value: string;
}

export interface BrowseOption {
  id: string;
  name: string;
  priceDeltaLabel?: string | null;
  priceDelta?: number;
}

export interface BrowseOptionGroup {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: BrowseOption[];
}

export interface BrowseItem {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  /** Pre-formatted display price (server owns currency + locale). Null hides it. */
  priceLabel: string | null;
  /** Numeric price value for client total calculations. */
  numericPrice?: number;
  /** Regular price crossed out when promo price is active. */
  originalPriceLabel?: string | null;
  /** Sold-out flag for dishes/items. */
  isSoldOut?: boolean;
  /**
   * Pre-computed availability badge text (e.g. low/sold-out), derived
   * server-side from real stock. Absent hides the badge.
   */
  badge?: string | null;
  /** Visual tone for `badge`. Defaults to muted. */
  badgeTone?: "muted" | "alert";
  tags: string[];
  detailRows: BrowseDetailRow[];
  optionGroups?: BrowseOptionGroup[];
  /** Real destination (e.g. product detail page). No dead buttons: omit when none. */
  action?: { label: string; href: string };
}

export interface BrowseGroup {
  id: string;
  title: string;
  items: BrowseItem[];
}

/** True only when a storefront catalog has at least one real, renderable item. */
export function hasBrowseableItems(groups: readonly Pick<BrowseGroup, "items">[]): boolean {
  return groups.some((group) => group.items.length > 0);
}

/** Accent/case-insensitive normalization (EN/FR search: "cafe" matches "Café"). */
export function normalizeSearchQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function itemMatches(item: BrowseItem, query: string): boolean {
  if (query === "") return true;
  const haystack = normalizeSearchQuery(`${item.name ?? ""} ${item.description ?? ""}`);
  return query.split(/\s+/).every((token) => token !== "" && haystack.includes(token));
}

/**
 * Filters groups by active chip + search query. Groups left with zero items
 * are dropped so chips never point at empty categories.
 */
export function filterBrowseGroups(
  groups: BrowseGroup[],
  query: string,
  activeGroupId: string
): BrowseGroup[] {
  const normalized = normalizeSearchQuery(query);
  const out: BrowseGroup[] = [];
  for (const group of groups) {
    if (activeGroupId !== BROWSE_ALL_GROUP && group.id !== activeGroupId) continue;
    const items = group.items.filter((item) => itemMatches(item, normalized));
    if (items.length > 0) out.push({ ...group, items });
  }
  return out;
}
