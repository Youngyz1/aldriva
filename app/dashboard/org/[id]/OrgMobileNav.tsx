"use client";

import MobilePillNav from "@/components/nav/MobilePillNav";
import { getOrgNavItems } from "./org-nav-items";

/**
 * Fixed bottom tab strip for the org workspace's mobile nav — same pattern as
 * DashboardMobileNav (outer shell owns fixed positioning, inner wrapper owns
 * horizontal scrolling).
 *
 * Org pages nest inside the dashboard layout, whose own bottom bar
 * (69px + safe-area, see DashboardMobileNav) sits at the screen edge. This
 * strip therefore docks directly ABOVE it, so the two stay stacked without
 * overlapping. Hidden on lg where the desktop OrgDashboardSidebar takes over.
 * Fixed positioning removes it from document flow — the org content wrapper
 * reserves 69px for it (see ./layout.tsx).
 */
export default function OrgMobileNav({ orgId }: { orgId: string }) {
  const navItems = getOrgNavItems(`/dashboard/org/${orgId}`);
  return (
    <div className="fixed bottom-[calc(69px+env(safe-area-inset-bottom))] left-0 right-0 z-40 border-t border-zinc-200 bg-white px-3 py-2.5 sm:px-6 lg:hidden">
      <div className="overflow-x-auto">
        <MobilePillNav items={navItems} ariaLabel="Organization workspace navigation" />
      </div>
    </div>
  );
}
