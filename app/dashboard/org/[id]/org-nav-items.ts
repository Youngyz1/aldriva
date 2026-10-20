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
}

export function getOrgNavItems(base: string, opts: OrgNavOpts): NavItem[] {
  const items = getOrgNavModules(opts.capabilities, opts).map((module) => ({
    label: module.label,
    href: `${base}/${module.hrefSuffix}`,
    icon: module.icon,
  }));
  if (opts.hasMenuRows || opts.capabilities.includes("MENU")) {
    items.push({ label: "Kitchen", href: `${base}/kitchen`, icon: "ChefHat" });
  }
  return items;
}
