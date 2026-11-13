"use client";

/**
 * components/nav/DashboardBottomBar.tsx
 *
 * Capability-aware 4-tab mobile bottom navigation bar for org dashboard layouts.
 * docs/design/dashboard-overview/06-mobile-navigation-spec.md §1.
 *
 * Tab layout for events-only: Overview | Events | More
 * Tab layout for fundraiser-only: Overview | Fundraisers | More
 * Tab layout for both: Overview | Events | Fundraisers | More
 * Tab layout for commerce: Overview | Live ops | Manage | More
 * Tab layout for everything: Overview | Events | Fundraisers | More (commerce via More sheet)
 */

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconLayoutDashboard as LayoutDashboard,
  IconCalendar as Calendar,
  IconHeart as Heart,
  IconActivity as Activity,
  IconWorld as World,
  IconBriefcase as Briefcase,
  IconDots as Dots,
} from "@tabler/icons-react";
import { DashboardMoreSheet } from "./DashboardMoreSheet";

export interface DashboardBottomBarProps {
  orgId: string;
  hasLiveDomain?: boolean;
  capabilities?: readonly string[];
  attentionCount?: number;
}

export function DashboardBottomBar({
  orgId,
  hasLiveDomain = true,
  capabilities = [],
  attentionCount = 0,
}: DashboardBottomBarProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const caps = new Set(capabilities);
  const hasEvents = caps.has("EVENTS");
  const hasFundraisers = caps.has("FUNDRAISING") || caps.has("DONATIONS");
  const hasOrders = caps.has("ORDERS") || caps.has("ONLINE_ORDERING");
  const hasBookings = caps.has("BOOKINGS") || caps.has("APPOINTMENTS") || caps.has("TABLES") || caps.has("RESERVATIONS");
  const hasServices = caps.has("SERVICES");
  const hasMenu = caps.has("MENU");
  const hasProducts = caps.has("PRODUCTS");
  const hasBusiness = caps.has("ORDERS") || caps.has("ONLINE_ORDERING") || caps.has("MENU") || caps.has("SERVICES") || caps.has("BOOKINGS") || caps.has("APPOINTMENTS") || caps.has("TABLES") || caps.has("RESERVATIONS") || caps.has("PRODUCTS");

  // ── Tab 2 ──────────────────────────────────────────────────────────────────
  // Priority: Events > Live ops (commerce) > Fundraisers (if no Tab 3 needed) > Website
  const isLiveOps = hasLiveDomain && (hasOrders || hasBookings);
  let tab2Href: string;
  let tab2Label: string;
  let Tab2Icon: React.ComponentType<{ className?: string }>;

  if (hasEvents) {
    tab2Href = `/dashboard/org/${orgId}/events`;
    tab2Label = "Events";
    Tab2Icon = Calendar;
  } else if (isLiveOps) {
    // Commerce live ops
    tab2Label = "Live ops";
    Tab2Icon = Activity;
    if (hasOrders) {
      tab2Href = `/dashboard/org/${orgId}/orders`;
    } else {
      tab2Href = `/dashboard/org/${orgId}/reservations`;
    }
  } else if (hasFundraisers) {
    // Fundraiser-only: Tab 2 = Fundraisers (Tab 3 collapses)
    tab2Href = `/dashboard/org/${orgId}/fundraisers`;
    tab2Label = "Fundraisers";
    Tab2Icon = Heart;
  } else {
    tab2Href = `/dashboard/org/${orgId}/website`;
    tab2Label = "Website";
    Tab2Icon = World;
  }

  // ── Tab 3 ──────────────────────────────────────────────────────────────────
  // Show Tab 3 only when there's something distinct from Tab 2.
  // Events+Fundraisers: Tab 3 = Fundraisers.
  // Commerce without events: Tab 3 = Manage (services/menu/products).
  // Events without fundraisers / fundraisers alone: collapse to 3-tab layout (no Tab 3).
  let tab3Href: string | null = null;
  let tab3Label: string | null = null;
  let Tab3Icon: React.ComponentType<{ className?: string }> | null = null;

  if (hasEvents && hasFundraisers) {
    tab3Href = `/dashboard/org/${orgId}/fundraisers`;
    tab3Label = "Fundraisers";
    Tab3Icon = Heart;
  } else if (hasBusiness) {
    // Commerce manage tab
    if (hasServices) {
      tab3Href = `/dashboard/org/${orgId}/services`;
    } else if (hasMenu) {
      tab3Href = `/dashboard/org/${orgId}/menu`;
    } else if (hasProducts) {
      tab3Href = `/dashboard/org/${orgId}/products`;
    } else {
      tab3Href = `/dashboard/org/${orgId}/website`;
    }
    tab3Label = "Manage";
    Tab3Icon = Briefcase;
  }
  // else: collapse to 3-tab (Tab 3 hidden)

  // ── Active state matchers ──────────────────────────────────────────────────
  const isOverviewActive =
    pathname === `/dashboard/org/${orgId}` ||
    pathname === `/dashboard/org/${orgId}/overview` ||
    pathname.startsWith(`/dashboard/org/${orgId}/overview/`);

  const isTab2Active = (() => {
    if (hasEvents) return pathname.startsWith(`/dashboard/org/${orgId}/events`);
    if (hasOrders || hasBookings) return pathname.includes("/orders") || pathname.includes("/reservations") || pathname.includes("/live");
    if (hasFundraisers) return pathname.startsWith(`/dashboard/org/${orgId}/fundraisers`);
    return pathname.includes("/website");
  })();

  const isTab3Active =
    tab3Href !== null &&
    !isTab2Active &&
    (() => {
      if (hasEvents && hasFundraisers) return pathname.startsWith(`/dashboard/org/${orgId}/fundraisers`);
      return (
        pathname.includes("/services") ||
        pathname.includes("/menu") ||
        pathname.includes("/products") ||
        pathname.includes("/manage") ||
        (pathname.includes("/website") && !hasEvents && !hasFundraisers)
      );
    })();

  const tabCls = (active: boolean) =>
    `flex-1 min-h-[48px] h-full flex flex-col items-center justify-center gap-1 transition ${
      active ? "text-[var(--primary)] font-bold" : "text-zinc-500 hover:text-zinc-900 font-medium"
    }`;

  return (
    <>
      <nav
        aria-label="Mobile workspace navigation"
        className="fixed inset-x-0 bottom-0 z-[var(--z-bottom-bar)] bg-white border-t border-zinc-200 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="flex items-center justify-around h-14">
          {/* Tab 1: Overview */}
          <Link
            href={`/dashboard/org/${orgId}/overview`}
            aria-current={isOverviewActive ? "page" : undefined}
            className={tabCls(isOverviewActive)}
          >
            <div className="relative">
              <LayoutDashboard className="h-5 w-5" />
              {attentionCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-brand-700"
                  aria-hidden="true"
                />
              )}
            </div>
            <span className="text-[11px] leading-none">Overview</span>
          </Link>

          {/* Tab 2: Events / Live ops / Fundraisers / Website */}
          <Link
            href={tab2Href}
            aria-current={isTab2Active ? "page" : undefined}
            className={tabCls(isTab2Active)}
          >
            <Tab2Icon className="h-5 w-5" />
            <span className="text-[11px] leading-none">{tab2Label}</span>
          </Link>

          {/* Tab 3: Fundraisers (when events also present) or Manage — hidden when null */}
          {tab3Href && Tab3Icon && (
            <Link
              href={tab3Href}
              aria-current={isTab3Active ? "page" : undefined}
              className={tabCls(isTab3Active)}
            >
              <Tab3Icon className="h-5 w-5" />
              <span className="text-[11px] leading-none">{tab3Label}</span>
            </Link>
          )}

          {/* Tab 4: More */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className="flex-1 min-h-[48px] h-full flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-zinc-900 font-medium transition"
          >
            <Dots className="h-5 w-5" />
            <span className="text-[11px] leading-none">More</span>
          </button>
        </div>
      </nav>

      <DashboardMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        orgId={orgId}
        capabilities={capabilities}
      />
    </>
  );
}
