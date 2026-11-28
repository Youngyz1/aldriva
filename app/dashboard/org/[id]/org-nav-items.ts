import type { NavItem } from "@/components/nav/nav-active";
import type { Capability } from "@/lib/business-taxonomy";
import {
  getOrgNavModules,
  type OrgNavSignalCounts,
} from "@/lib/org-dashboard-modules";

/**
 * The org-workspace destinations — single source of truth shared by the
 * desktop OrgDashboardSidebar, the mobile OrgMobileNav pill strip, and the
 * OrgMobileHeader drawer, so all three always expose the same links.
 *
 * Base always uses the immutable org UUID — never the slug (public profile
 * URLs use the slug, workspace URLs use the id).
 *
 * Visibility uses the shared organizer-type classification plus capability
 * and catalog signals (`lib/org-dashboard-modules.ts`). All nav surfaces must
 * provide the same raw-row flags used by the overview resolver.
 */
export interface OrgNavOpts extends OrgNavSignalCounts {
  capabilities: Capability[];
  pendingRentalsCount?: number;
}

export function getOrgNavItems(base: string, opts: OrgNavOpts): NavItem[] {
  const modules = getOrgNavModules(opts.capabilities, opts);

  // Modules with `nav.parent` set (e.g. Branches/Staff under Workforce)
  // become children of the matching parent module's NavItem instead of
  // their own top-level item. A module whose parent isn't itself visible
  // (shouldn't happen today -- same visibility rule on both) is simply
  // dropped rather than rendered orphaned at the top level.
  const childrenByParent = new Map<string, NavItem[]>();
  for (const mod of modules) {
    if (!mod.parent) continue;
    const list = childrenByParent.get(mod.parent) ?? [];
    list.push({ label: mod.label, href: `${base}/${mod.hrefSuffix}`, icon: mod.icon });
    childrenByParent.set(mod.parent, list);
  }

  const items: NavItem[] = modules
    .filter((mod) => !mod.parent)
    .map((mod) => {
      const isRentals = mod.key === "rentals";
      const children = childrenByParent.get(mod.key);
      return {
        label: mod.label,
        href: `${base}/${mod.hrefSuffix}`,
        icon: mod.icon,
        badge: isRentals && opts.pendingRentalsCount && opts.pendingRentalsCount > 0 ? opts.pendingRentalsCount : undefined,
        settingsHref: isRentals ? `${base}/rentals/settings` : undefined,
        ...(children ? { children } : {}),
      };
    });
  if (opts.hasMenuRows || opts.capabilities.includes("MENU")) {
    items.push({ label: "Kitchen", href: `${base}/kitchen`, icon: "ChefHat" });
  }
  return items;
}

/**
 * getOrgNavItems() plus the one extra item OrgDashboardSidebar.tsx adds by
 * hand ("Tables & QR", same hasMenuRows/MENU gate as Kitchen above) — the
 * full item list the desktop sidebar actually renders. Exported so every
 * nav surface (desktop sidebar, mobile DashboardMoreSheet) calls this one
 * function instead of each re-deriving its own capability checks, which is
 * how the two surfaces drifted out of sync before.
 */
export function getFullOrgNavItems(base: string, opts: OrgNavOpts): NavItem[] {
  const items = getOrgNavItems(base, opts);
  if (opts.hasMenuRows || opts.capabilities.includes("MENU")) {
    items.push({ label: "Tables & QR", href: `${base}/tables`, icon: "Qrcode" });
  }
  return items;
}
