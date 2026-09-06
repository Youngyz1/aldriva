"use client";

import MobilePillNav from "@/components/nav/MobilePillNav";
import { dashboardNavGroups } from "./nav-items";

const navItems = dashboardNavGroups.flatMap((group) => group.items);

/** Horizontally scrollable pill strip for the dashboard's mobile nav — the
 *  dashboard nav covers too many destinations to fit one screen width, so the
 *  strip scrolls sideways inside a bottom tab bar instead. */
export default function DashboardMobileNav() {
  return (
    // Fixed bottom tab bar, always reachable regardless of scroll position.
    // The outer shell owns the fixed positioning; the inner wrapper owns the
    // horizontal scrolling. pb adds the iOS/Android home-indicator safe area
    // so the pills are never obscured by system UI. Bar height is therefore
    // 69px + safe-area (pt-2.5 10px + pill min-h-44px + inner pb-1 4px +
    // bottom 10px + border-t 1px) — the dashboard content wrapper reserves
    // the same amount (see app/dashboard/layout.tsx). Hidden on lg where the
    // desktop sidebar takes over.
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 sm:px-6 lg:hidden">
      <div className="overflow-x-auto">
        <MobilePillNav items={navItems} ariaLabel="Dashboard navigation" />
      </div>
    </div>
  );
}
