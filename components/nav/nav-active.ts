export type NavItem = {
  label: string;
  href: string;
  /** Icon name key resolved client-side — avoids passing component functions server→client */
  icon: string;
  comingSoon?: boolean;
  /** Match only the exact path, not descendant routes — for an item whose
   *  href is itself a path-prefix of sibling items (e.g. a root "Overview"). */
  exact?: boolean;
  /** Optional secondary line, shown under the label (e.g. settings nav). */
  description?: string;
  badge?: number | string;
  settingsHref?: string;
  /** Child items rendered as a collapsible submenu under this one (e.g.
   *  Workforce -> Branches, Staff). The parent's own href still points at
   *  its own page (an "Overview" for the group). A later slice adds a
   *  sibling here with one more entry -- no renderer changes needed. */
  children?: NavItem[];
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
      for (const child of item.children ?? []) {
        const childBase = child.href.split("?")[0];
        counts.set(childBase, (counts.get(childBase) ?? 0) + 1);
      }
    }
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([base]) => base));
}

/** True if the item itself or any of its children match the current route. */
export function isNavItemOrChildActive(
  pathname: string,
  currentTab: string | null,
  item: NavItem,
  sharedBases: ReadonlySet<string>
): boolean {
  if (isNavItemActive(pathname, currentTab, item, sharedBases)) return true;
  return (item.children ?? []).some((child) => isNavItemActive(pathname, currentTab, child, sharedBases));
}
