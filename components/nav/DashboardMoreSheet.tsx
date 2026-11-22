"use client";

/**
 * components/nav/DashboardMoreSheet.tsx
 *
 * Workspace More sheet replacing the mobile drawer for dashboard layouts.
 * docs/design/dashboard-overview/06-mobile-navigation-spec.md §2.
 */

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import {
  IconWorld as World,
  IconStar as Star,
  IconChartBar as ChartBar,
  IconSettings as Settings,
  IconChefHat as ChefHat,
  IconQrcode as QrCode,
  IconSpeakerphone as Speakerphone,
  IconChevronRight as ChevronRight,
  IconArrowLeft as ArrowLeft,
  IconX as X,
  IconCalendarPlus,
  IconHeart,
} from "@tabler/icons-react";

export interface DashboardMoreSheetProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  capabilities?: readonly string[];
}

export function DashboardMoreSheet({
  open,
  onClose,
  orgId,
  capabilities = [],
}: DashboardMoreSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Esc key close
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const caps = new Set(capabilities || []);
  const hasMenu = caps.has("MENU") || caps.has("ORDERS") || caps.has("ONLINE_ORDERING");
  const hasTables = caps.has("TABLES") || caps.has("RESERVATIONS");
  const hasEvents = caps.has("EVENTS");
  const hasFundraisers = caps.has("FUNDRAISING") || caps.has("DONATIONS");

  const moreItems: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    show: boolean;
  }> = [
    // ── Create actions (top of sheet) ─────────────────────────────────────
    {
      label: "+ New Event",
      href: `/dashboard/org/${orgId}/events/new`,
      icon: IconCalendarPlus,
      show: hasEvents || (!hasEvents && !hasFundraisers),
    },
    {
      label: "+ New Fundraiser",
      href: `/dashboard/org/${orgId}/fundraisers/new`,
      icon: IconHeart,
      show: hasFundraisers,
    },
    // ── Workspace nav ──────────────────────────────────────────────────────
    {
      label: "Website",
      href: `/dashboard/org/${orgId}/website`,
      icon: World,
      show: true,
    },
    {
      label: "Kitchen Display",
      href: `/dashboard/org/${orgId}/kitchen`,
      icon: ChefHat,
      show: hasMenu,
    },
    {
      label: "Tables & QR",
      href: `/dashboard/org/${orgId}/tables`,
      icon: QrCode,
      show: hasTables,
    },
    {
      label: "Customer Reviews",
      href: `/dashboard/org/${orgId}/reviews`,
      icon: Star,
      show: true,
    },
    {
      label: "Analytics",
      href: `/dashboard/org/${orgId}/analytics`,
      icon: ChartBar,
      show: true,
    },
    {
      label: "Promotions",
      href: `/dashboard/org/${orgId}/promotions`,
      icon: Speakerphone,
      show: true,
    },
    {
      label: "Settings",
      href: `/dashboard/org/${orgId}/settings`,
      icon: Settings,
      show: true,
    },
  ];

  const visibleItems = moreItems.filter((i) => i.show);

  return (
    <div className="fixed inset-0 z-[var(--z-sheet-backdrop)] flex items-end justify-center lg:hidden">
      <div
        className="fixed inset-0 bg-black/40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Workspace navigation"
        className="relative w-full max-w-lg rounded-t-2xl bg-white p-5 z-[var(--z-sheet)] pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-200"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200" />

        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-600">
            Workspace menu
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="divide-y divide-zinc-100 mt-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="min-h-[48px] flex items-center justify-between py-3 px-2 rounded-lg hover:bg-zinc-50 group transition"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700 group-hover:bg-zinc-200/80 transition">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-[15px] font-semibold text-zinc-900">
                    {item.label}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700" />
              </Link>
            );
          })}
        </div>

        <div className="pt-3 mt-3 border-t border-zinc-100">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="min-h-[48px] flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 text-xs font-bold text-zinc-700 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Aldriva Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
