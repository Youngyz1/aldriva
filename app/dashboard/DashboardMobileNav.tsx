"use client";

import MobilePillNav from "@/components/nav/MobilePillNav";
import { dashboardNavGroups } from "./nav-items";

const navItems = dashboardNavGroups.flatMap((group) => group.items);

/** Scrollable pill strip for the dashboard's mobile nav — same pattern as
 *  the org workspace nav (OrgMobileNav), used here because the dashboard
 *  nav now covers 11 destinations, too many for a fixed bottom tab bar. */
export default function DashboardMobileNav() {
  return (
    <div className="-mx-4 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-2.5 lg:hidden">
      <MobilePillNav items={navItems} ariaLabel="Dashboard navigation" />
    </div>
  );
}
