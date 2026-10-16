"use client";

import { useTranslations } from 'next-intl';
import MobilePillNav from "@/components/nav/MobilePillNav";
import { getOrgNavItems } from "./org-nav-items";
import type { Capability } from "@/lib/business-taxonomy";
import type { OrganizerDashboardTypeFlags } from "@/lib/organizer-dashboard-classifier";

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
export default function OrgMobileNav({ orgId, organizerTypes, hasProducts, hasMenuRows, hasServiceRows, hasReservationRows, capabilities, offerings }: { orgId: string; organizerTypes: OrganizerDashboardTypeFlags; hasProducts?: boolean; hasMenuRows?: boolean; hasServiceRows?: boolean; hasReservationRows?: boolean; capabilities: Capability[]; offerings?: readonly string[] | null }) {
  const t = useTranslations('Organizer');
  const navItems = getOrgNavItems(`/dashboard/org/${orgId}`, { organizerTypes, hasProducts, hasMenuRows, hasServiceRows, hasReservationRows, capabilities, offerings }).map(item => {
    const key = item.label.toLowerCase() as any;
    try { return { ...item, label: t(key) }; } catch { return item; }
  });
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2.5 sm:px-6 lg:hidden">
      <div className="overflow-x-auto">
        <MobilePillNav items={navItems} ariaLabel="Organization workspace navigation" />
      </div>
    </div>
  );
}
