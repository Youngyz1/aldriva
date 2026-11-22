"use client";
/**
 * components/nav/EventBottomBar.tsx
 *
 * Mobile bottom navigation for event dashboard pages.
 * 4 tabs: Overview, Check-ins, Scanner, More.
 * More sheet lists: Operations, Memories, Ticket Design, Seating, Team & Staff, Edit Details.
 */
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconLayoutDashboard,
  IconCheckbox,
  IconQrcode,
  IconDots,
  IconX,
  IconChevronRight,
  IconActivity,
  IconCamera,
  IconTicket,
  IconArmchair,
  IconUsers,
  IconEdit,
} from "@tabler/icons-react";

export interface EventBottomBarProps {
  eventId: string;
  userRole?: "owner" | "event_manager" | "ticket_scanner" | null;
}

export function EventBottomBar({ eventId, userRole }: EventBottomBarProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const base = `/dashboard/events/${eventId}`;
  const canManage = userRole === "owner" || userRole === "event_manager";

  const isOverviewActive =
    pathname === base ||
    pathname === `${base}/overview` ||
    pathname.startsWith(`${base}/overview/`);
  const isCheckinsActive = pathname.startsWith(`${base}/checkins`);
  const isScanActive = pathname.startsWith(`${base}/scan`);

  const moreItems = [
    { label: "Operations", href: `${base}/operations`, icon: IconActivity, show: canManage },
    { label: "Memories", href: `${base}/memories`, icon: IconCamera, show: canManage },
    { label: "Ticket Design", href: `${base}/ticket-design`, icon: IconTicket, show: canManage },
    { label: "Seating", href: `${base}/seating`, icon: IconArmchair, show: canManage },
    { label: "Team & Staff", href: `${base}/team`, icon: IconUsers, show: canManage },
    { label: "Edit Details", href: `/events/edit/${eventId}`, icon: IconEdit, show: userRole === "owner" },
  ].filter((i) => i.show);

  const tabCls = (active: boolean) =>
    `flex-1 min-h-[48px] h-full flex flex-col items-center justify-center gap-1 transition ${
      active ? "text-[var(--primary)] font-bold" : "text-zinc-500 hover:text-zinc-900 font-medium"
    }`;

  return (
    <>
      <nav
        aria-label="Event navigation"
        className="fixed inset-x-0 bottom-0 z-[var(--z-bottom-bar)] bg-white border-t border-zinc-200 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="flex items-center justify-around h-14">
          <Link
            href={`${base}/overview`}
            aria-current={isOverviewActive ? "page" : undefined}
            className={tabCls(isOverviewActive)}
          >
            <IconLayoutDashboard className="h-5 w-5" />
            <span className="text-[11px] leading-none">Overview</span>
          </Link>

          {canManage && (
            <Link
              href={`${base}/checkins`}
              aria-current={isCheckinsActive ? "page" : undefined}
              className={tabCls(isCheckinsActive)}
            >
              <IconCheckbox className="h-5 w-5" />
              <span className="text-[11px] leading-none">Check-ins</span>
            </Link>
          )}

          <Link
            href={`${base}/scan`}
            aria-current={isScanActive ? "page" : undefined}
            className={tabCls(isScanActive)}
          >
            <IconQrcode className="h-5 w-5" />
            <span className="text-[11px] leading-none">Scanner</span>
          </Link>

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
          <div className="fixed inset-0 bg-black/40" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Event navigation"
            className="relative w-full max-w-lg rounded-t-2xl bg-white p-5 z-[var(--z-sheet)] pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-200"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200" />
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-600">Event menu</h2>
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
                      <div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700 group-hover:bg-zinc-200/80 transition">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-[15px] font-semibold text-zinc-900">{item.label}</span>
                    </div>
                    <IconChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
