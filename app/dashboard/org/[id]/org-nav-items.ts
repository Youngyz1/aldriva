import type { NavItem } from "@/components/nav/nav-active";

/**
 * The org-workspace destinations — single source of truth shared by the
 * desktop OrgDashboardSidebar and the mobile OrgMobileNav pill strip, so both
 * always expose the same links.
 *
 * Base always uses the immutable org UUID — never the slug (public profile
 * URLs use the slug, workspace URLs use the id).
 */
export function getOrgNavItems(base: string, opts?: { hasEvents?: boolean; hasFundraisers?: boolean; hasProducts?: boolean; hasWebsite?: boolean }): NavItem[] {
  const all: NavItem[] = [
    { label: "Overview",     href: `${base}/overview`,    icon: "LayoutDashboard" },
    { label: "Website",      href: `${base}/website`,     icon: "Globe" },
    { label: "Events",       href: `${base}/events`,      icon: "Calendar" },
    { label: "Fundraisers",  href: `${base}/fundraisers`, icon: "Heart" },
    { label: "Products",     href: `${base}/products`,    icon: "Package" },
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
      if (item.label === "Products" && opts.hasProducts === false) return false;
      // Always keep Overview, Reviews, Analytics, Settings
      return true;
    });
  }
  return all;
}
