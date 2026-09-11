"use client";

import MobilePillNav from "@/components/nav/MobilePillNav";
import { dashboardNavGroups } from "./nav-items";

const navItems = dashboardNavGroups.flatMap((group) => group.items);

/** Horizontally scrollable pill strip for the dashboard's mobile nav */
export default function DashboardMobileNav() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/80 bg-white/95 backdrop-blur-md px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-6 lg:hidden shadow-xs">
      <div className="overflow-x-auto scrollbar-none">
        <MobilePillNav items={navItems} ariaLabel="Dashboard navigation" />
      </div>
    </div>
  );
}
