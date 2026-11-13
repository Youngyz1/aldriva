"use client";

/**
 * components/nav/DashboardMoreSheet.tsx
 *
 * Workspace More sheet replacing the mobile drawer for dashboard layouts.
 * docs/design/dashboard-overview/06-mobile-navigation-spec.md §2.
 *
 * The workspace-nav section below is built from `navItems` — the exact
 * same NavItem[] the desktop sidebar renders (both call
 * `getFullOrgNavItems()` from app/dashboard/org/[id]/org-nav-items.ts; this
 * sheet never re-derives its own capability checks for it), so the two
 * surfaces cannot drift out of sync again. Only the "+ New …" quick
 * create actions above it still gate on raw capabilities, same as the
 * Overview's own quick actions (lib/overview-resolver.ts).
 */

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  IconWorld as Globe,
  IconCalendar as Calendar,
  IconHeart as Heart,
  IconPackage as Package,
  IconBriefcase as Briefcase,
  IconUsers as Users,
  IconBook as BookOpen,
  IconStar as Star,
  IconPhoto as ImageIcon,
  IconChartBar as BarChart2,
  IconSettings as Settings,
  IconToolsKitchen2 as Utensils,
  IconBuildingStore as Store,
  IconShoppingBag as ShoppingBag,
  IconTag as Tag,
  IconChefHat as ChefHat,
  IconQrcode as Qrcode,
  IconCalendarCheck as CalendarCheck,
  IconCalendarClock as CalendarClock,
  IconCar as Car,
  IconLayoutDashboard as LayoutDashboard,
  IconChevronRight as ChevronRight,
  IconArrowLeft as ArrowLeft,
  IconX as X,
  IconCalendarPlus,
} from "@tabler/icons-react";
import type { NavItem } from "./nav-active";

export interface DashboardMoreSheetProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  /** Same NavItem[] the desktop sidebar renders — see file header. */
  navItems: NavItem[];
  capabilities?: readonly string[];
}

// Same icon set as app/dashboard/org/[id]/OrgDashboardSidebar.tsx's
// ORG_ICON_MAP (icon glyphs only — no gating logic lives here).
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Globe, Calendar, Heart, Package, Briefcase, Users, BookOpen, Star, ImageIcon, BarChart2, Settings, Utensils, Store, ShoppingBag, Tag, ChefHat, Qrcode, CalendarCheck, CalendarClock, Car,
};

export function DashboardMoreSheet({
  open,
  onClose,
  orgId,
  navItems,
  capabilities = [],
}: DashboardMoreSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("Organizer");

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
  const hasEvents = caps.has("EVENTS");
  const hasFundraisers = caps.has("FUNDRAISING") || caps.has("DONATIONS");
  const hasFleet = caps.has("VEHICLES") || caps.has("VEHICLE_RENTAL");

  // Quick create actions — gated the same way the Overview's own quick
  // actions are (lib/overview-resolver.ts): never shown without the
  // matching capability. "+ New Event" previously showed for every org
  // with no events AND no fundraisers (i.e. also for rental-only orgs);
  // that fallback is removed.
  const createActions: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    show: boolean;
  }> = [
    { label: "+ New Event", href: `/dashboard/org/${orgId}/events/new`, icon: IconCalendarPlus, show: hasEvents },
    { label: "+ New Fundraiser", href: `/dashboard/org/${orgId}/fundraisers/new`, icon: Heart, show: hasFundraisers },
    { label: `+ ${t("addVehicle")}`, href: `/dashboard/org/${orgId}/fleet/new`, icon: Car, show: hasFleet },
    { label: `+ ${t("newBooking")}`, href: `/dashboard/org/${orgId}/rentals`, icon: CalendarClock, show: hasFleet },
  ].filter((item) => item.show);

  // Same translation pass OrgDashboardSidebar.tsx applies to its own
  // navItems — label keys are lowercased English fallbacks (e.g.
  // "rentals", "fleet"); untranslated labels (e.g. "Tables & QR") fall
  // back to themselves when the key doesn't exist.
  const translatedNavItems = navItems.map((item) => {
    const key = item.label.toLowerCase() as any;
    try {
      return { ...item, label: t(key) };
    } catch {
      return item;
    }
  });

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

        {createActions.length > 0 && (
          <div className="divide-y divide-zinc-100 mt-1 border-b border-zinc-100 pb-1">
            {createActions.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
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
        )}

        <div className="divide-y divide-zinc-100 mt-1">
          {translatedNavItems.map((item) => {
            const Icon = ICON_MAP[item.icon] ?? Globe;
            return (
              <React.Fragment key={item.href}>
                <Link
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
                    {item.badge !== undefined && Number(item.badge) > 0 && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700" />
                </Link>
                {item.settingsHref && (
                  <Link
                    href={item.settingsHref}
                    onClick={onClose}
                    className="min-h-[40px] flex items-center justify-between py-2 pl-12 pr-2 rounded-lg hover:bg-zinc-50 group transition"
                  >
                    <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-700">
                      {item.label} settings
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-500" />
                  </Link>
                )}
              </React.Fragment>
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
