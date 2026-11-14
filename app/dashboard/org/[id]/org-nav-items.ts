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
  const items: NavItem[] = getOrgNavModules(opts.capabilities, opts).map((module) => {
    const isRentals = module.key === "rentals";
    return {
      label: module.label,
      href: `${base}/${module.hrefSuffix}`,
      icon: module.icon,
      badge: isRentals && opts.pendingRentalsCount && opts.pendingRentalsCount > 0 ? opts.pendingRentalsCount : undefined,
      settingsHref: isRentals ? `${base}/rentals/settings` : undefined,
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
