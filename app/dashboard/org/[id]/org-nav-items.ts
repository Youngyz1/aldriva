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
 * Visibility is capability-driven (`lib/org-dashboard-modules.ts`): pass
 * `capabilities` (union across the org's linked businesses) plus catalog
 * existence counts and Services/Menu follow type + existing rows. When
 * `capabilities` is omitted the legacy rule applies (Services/Menu always
 * shown) so older callers keep today's behavior.
 */
export interface OrgNavOpts extends OrgNavSignalCounts {
  capabilities?: Capability[];
}

export function getOrgNavItems(base: string, opts?: OrgNavOpts): NavItem[] {
  if (opts?.capabilities) {
    return getOrgNavModules(opts.capabilities, opts).map((module) => ({
      label: module.label,
      href: `${base}/${module.hrefSuffix}`,
      icon: module.icon,
    }));
  }
  const all: NavItem[] = [
    { label: "Overview",     href: `${base}/overview`,    icon: "LayoutDashboard" },
    { label: "Website",      href: `${base}/website`,     icon: "Globe" },
    { label: "Events",       href: `${base}/events`,      icon: "Calendar" },
    { label: "Fundraisers",  href: `${base}/fundraisers`, icon: "Heart" },
    { label: "Shop",         href: `${base}/products`,    icon: "ShoppingBag" },
    { label: "Services",     href: `${base}/services`,    icon: "Briefcase" },
    { label: "Menu",         href: `${base}/menu`,        icon: "Utensils" },
    { label: "Reviews",      href: `${base}/reviews`,     icon: "Star" },
    { label: "Analytics",    href: `${base}/analytics`,   icon: "BarChart2" },
    { label: "Settings",     href: `${base}/settings`,    icon: "Settings" },
  ];
  // Hide irrelevant modules when counts are known and zero — keeps workspace contextual
  if (opts) {
    return all.filter((item) => {
      if (item.label === "Website" && opts.hasWebsite === false) return false;
      if (item.label === "Events" && opts.hasEvents === false) return false;
      if (item.label === "Fundraisers" && opts.hasFundraisers === false) return false;
      if (item.label === "Shop" && opts.hasProducts === false) return false;
      // Always keep Overview, Reviews, Analytics, Settings
      return true;
    });
  }
  return all;
}
