export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
  /** Match only the exact path, not descendant routes — for an item whose
   *  href is itself a path-prefix of sibling items (e.g. a root "Overview"). */
  exact?: boolean;
  /** Optional secondary line, shown under the label (e.g. settings nav). */
  description?: string;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

/**
 * Matches a nav item's href against the current route. Items whose base path
 * is shared with another item in the same nav (e.g. several `?tab=` variants
 * of one page) are disambiguated by the `tab` query param; items with a
 * unique base path match on pathname alone, so an unrelated `?tab=` used by
 * the page itself (e.g. a status filter) never de-activates them.
 */
export function isNavItemActive(
  pathname: string,
  currentTab: string | null,
  item: Pick<NavItem, "href" | "exact">,
  sharedBases: ReadonlySet<string>
): boolean {
  const [base, query] = item.href.split("?");
  const pathMatches = item.exact ? pathname === base : pathname === base || pathname.startsWith(base + "/");
  if (!pathMatches) return false;
  if (!sharedBases.has(base)) return true;
  const itemTab = new URLSearchParams(query ?? "").get("tab");
  return itemTab === currentTab;
}

/** Bases that appear on more than one item across all groups need tab-based disambiguation. */
export function computeSharedBases(groups: NavGroup[]): Set<string> {
  const counts = new Map<string, number>();
  for (const group of groups) {
    for (const item of group.items) {
      const base = item.href.split("?")[0];
      counts.set(base, (counts.get(base) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([base]) => base));
}
