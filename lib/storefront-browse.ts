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

import type { MenuPromotion } from "./menu-promotions";

export const BROWSE_ALL_GROUP = "all";

export interface BrowseDetailRow {
  label: string;
  value: string;
}

export interface BrowseOption {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  allergens?: string[];
  priceDeltaLabel?: string | null;
  priceDelta?: number;
  price?: number;
  isDefault?: boolean;
  isAvailable?: boolean;
  maxQty?: number;
}

export interface BrowseOptionGroup {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  kind?: "variant" | "addon";
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
  /** Raw base price and promotion data for the shared menu pricing preview. */
  rawPrice?: number;
  promoPrice?: number | null;
  organizerId?: string;
  sectionId?: string | null;
  isActive?: boolean;
  promotions?: MenuPromotion[];
  /** Discount badge copied from the server's shared price resolution. */
  discountLabel?: string | null;
  /** End time of the applied public menu promotion. */
  promotionEndsAt?: string | null;
  /** Separate delivery badge; it never changes the displayed item price. */
  freeDeliveryLabel?: string | null;
  /** ISO timestamp for newest-first sorting. Absent sorts last. */
  createdAt?: string | null;
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

export function defaultBrowseOptionSelections(
  groups: readonly BrowseOptionGroup[]
): Record<string, string[]> {
  const selected: Record<string, string[]> = {};
  for (const group of groups) {
    const availableOptions = group.options.filter((candidate) => candidate.isAvailable !== false);
    if (group.kind === "variant") {
      const option = availableOptions.find((candidate) => candidate.isDefault) ?? availableOptions[0];
      if (option) selected[group.id] = [option.id];
      continue;
    }
    const freeDefaults = availableOptions
      .filter((option) => option.isDefault && Number(option.priceDelta ?? option.price) === 0)
      .slice(0, Math.max(0, group.max))
      .map((option) => option.id);
    if (freeDefaults.length > 0) selected[group.id] = freeDefaults;
  }
  return selected;
}

/** Keep only groups and options that can be presented to a customer. */
export function availableBrowseOptionGroups(
  groups: readonly BrowseOptionGroup[]
): BrowseOptionGroup[] {
  return groups
    .map((group) => ({ ...group, options: group.options.filter((option) => option.isAvailable !== false) }))
    .filter((group) => group.options.length > 0);
}

/** Customer-facing summary of the actual selection bounds shared by the server. */
export function describeBrowseOptionGroupRules(
  group: Pick<BrowseOptionGroup, "required" | "min" | "max" | "kind">,
  labels?: { required?: string; optional?: string }
): string {
  const required = group.kind === "variant" || group.required;
  const minimum = group.kind === "variant" ? 1 : group.required ? Math.max(1, group.min) : group.min;
  let rule: string;
  if (group.kind === "variant" || (minimum === 1 && group.max === 1)) {
    rule = "Choose 1";
  } else if (minimum > 0) {
    rule = `Choose ${minimum}–${group.max}`;
  } else {
    rule = `up to ${group.max}`;
  }
  return `${required ? labels?.required || "Required" : labels?.optional || "Optional"} · ${rule}`;
}

export function hasAvailableBrowseOptionGroups(
  groups: readonly BrowseOptionGroup[] | null | undefined
): boolean {
  return availableBrowseOptionGroups(groups || []).length > 0;
}

/** Sort orders for storefront browse grids. `featured` keeps server order. */
export type BrowseSortKey = "featured" | "newest" | "priceAsc" | "priceDesc";

/**
 * Pure sort for one browse group. Items without a price/timestamp sort last
 * (stable by original index) so sort controls never hide products.
 */
export function sortBrowseItems(
  items: readonly BrowseItem[],
  sortKey: BrowseSortKey
): BrowseItem[] {
  if (sortKey === "featured") return [...items];
  const ranked = items.map((item, index) => ({ item, index }));
  const timeOf = (candidate: BrowseItem): number => {
    if (!candidate.createdAt) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(candidate.createdAt);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  };
  const priceOf = (candidate: BrowseItem): number | null =>
    typeof candidate.numericPrice === "number" &&
    Number.isFinite(candidate.numericPrice)
      ? candidate.numericPrice
      : null;
  ranked.sort((a, b) => {
    if (sortKey === "newest") {
      return timeOf(b.item) - timeOf(a.item) || a.index - b.index;
    }
    const priceA = priceOf(a.item);
    const priceB = priceOf(b.item);
    if (priceA === null && priceB === null) return a.index - b.index;
    if (priceA === null) return 1;
    if (priceB === null) return -1;
    const delta = sortKey === "priceAsc" ? priceA - priceB : priceB - priceA;
    return delta || a.index - b.index;
  });
  return ranked.map((entry) => entry.item);
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
