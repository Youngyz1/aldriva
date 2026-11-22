"use client";

/**
 * components/nav/AccountBottomBar.tsx
 *
 * Mobile 4-tab bottom navigation for account-level pages (/dashboard, /profile/[id], etc.)
 * Tabs: Home | Organizers | Events | More
 */

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconHome,
  IconBuilding,
  IconCalendar,
  IconDots,
  IconX,
  IconChevronRight,
  IconPlus,
  IconGift,
  IconTicket,
  IconHeart,
  IconBuildingStore,
  IconNews,
  IconShoppingBag,
  IconSettings,
  IconArrowLeft,
} from "@tabler/icons-react";

export function AccountBottomBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Esc key close
  useEffect(() => {
    if (!moreOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen]);

  // Tab active states
  const isHomeActive = pathname === "/dashboard" || pathname?.startsWith("/profile");
  const isOrganizersActive = pathname === "/dashboard/organizations";
  const isEventsActive = pathname === "/dashboard/events" || pathname?.startsWith("/dashboard/events");

  const moreItems = [
    { label: "+ Create New", href: "/dashboard/create", icon: IconPlus, highlight: true },
    { label: "My Donations", href: "/dashboard/donations", icon: IconGift },
    { label: "My Tickets", href: "/events/my-tickets", icon: IconTicket },
    { label: "Campaigns", href: "/dashboard/fundraisers", icon: IconHeart },
    { label: "Businesses", href: "/dashboard/businesses", icon: IconBuildingStore },
    { label: "Articles", href: "/dashboard/articles", icon: IconNews },
    { label: "Products", href: "/dashboard/products", icon: IconShoppingBag },
    { label: "Account Settings", href: "/account", icon: IconSettings },
  ];

  const tabCls = (active: boolean) =>
    `flex-1 min-h-[48px] h-full flex flex-col items-center justify-center gap-1 transition ${
      active ? "text-[var(--primary)] font-bold" : "text-zinc-500 hover:text-zinc-900 font-medium"
    }`;

  return (
    <>
      <nav
        aria-label="Account navigation"
        className="fixed inset-x-0 bottom-0 z-[var(--z-bottom-bar)] bg-white border-t border-zinc-200 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="flex items-center justify-around h-14">
          {/* Tab 1: Home */}
          <Link
            href="/dashboard"
            aria-current={isHomeActive ? "page" : undefined}
            className={tabCls(isHomeActive)}
          >
            <IconHome className="h-5 w-5" />
            <span className="text-[11px] leading-none">Home</span>
          </Link>

          {/* Tab 2: Organizers */}
          <Link
            href="/dashboard/organizations"
            aria-current={isOrganizersActive ? "page" : undefined}
            className={tabCls(isOrganizersActive)}
          >
            <IconBuilding className="h-5 w-5" />
            <span className="text-[11px] leading-none">Organizers</span>
          </Link>

          {/* Tab 3: Events */}
          <Link
            href="/dashboard/events"
            aria-current={isEventsActive ? "page" : undefined}
            className={tabCls(isEventsActive)}
          >
            <IconCalendar className="h-5 w-5" />
            <span className="text-[11px] leading-none">Events</span>
          </Link>

          {/* Tab 4: More */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className="flex-1 min-h-[48px] h-full flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-zinc-900 font-medium transition"
          >
            <IconDots className="h-5 w-5" />
            <span className="text-[11px] leading-none">More</span>
          </button>
        </div>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-[var(--z-sheet-backdrop)] flex items-end justify-center lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 transition-opacity"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Account navigation"
            className="relative w-full max-w-lg rounded-t-2xl bg-white p-5 z-[var(--z-sheet)] pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-200"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200" />
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-600">
                Dashboard menu
              </h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>
            <div className="divide-y divide-zinc-100 mt-1">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="min-h-[48px] flex items-center justify-between py-3 px-2 rounded-lg hover:bg-zinc-50 group transition"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center transition ${
                          item.highlight
                            ? "bg-brand-50 text-brand-700 font-bold"
                            : "bg-zinc-100 text-zinc-700 group-hover:bg-zinc-200/80"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span
                        className={`text-[15px] font-semibold ${
                          item.highlight ? "text-brand-700" : "text-zinc-900"
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                    <IconChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700" />
                  </Link>
                );
              })}
            </div>
            <div className="pt-3 mt-3 border-t border-zinc-100">
              <Link
                href="/"
                onClick={() => setMoreOpen(false)}
                className="min-h-[48px] flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 text-xs font-bold text-zinc-700 transition"
              >
                <IconArrowLeft className="h-4 w-4" />
                <span>Back to Home</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
