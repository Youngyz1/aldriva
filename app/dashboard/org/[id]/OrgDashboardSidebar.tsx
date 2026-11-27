"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from 'next-intl';
import { motion } from "framer-motion";
import Image from "next/image";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import {
  IconChevronLeft as ChevronLeft,
  IconChevronDown as ChevronDown,
  IconWorld as Globe,
  IconTag as Tag,
  IconChefHat as ChefHat,
  IconLayoutDashboard as LayoutDashboard,
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
  IconQrcode as Qrcode,
  IconCalendarCheck as CalendarCheck,
  IconCalendarClock as CalendarClock,
  IconCar as Car,
  IconUserCog as UserCog,
  IconMapPin as MapPin,
  IconShieldLock as ShieldLock,
} from "@tabler/icons-react";
import { getFullOrgNavItems } from "./org-nav-items";
import { isNavItemActive, isNavItemOrChildActive, computeSharedBases } from "@/components/nav/nav-active";
import type { Capability } from "@/lib/business-taxonomy";
import type { OrganizerDashboardTypeFlags } from "@/lib/organizer-dashboard-classifier";

type Org = {
  id: string;
  name: string;
  slug: string | null;
  photo: string | null;
  status: string | null;
  org_type: string | null;
};

const ORG_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Globe, Calendar, Heart, Package, Briefcase, Users, BookOpen, Star, ImageIcon, BarChart2, Settings, Utensils, Store, ShoppingBag, Tag, ChefHat, Qrcode, CalendarCheck, CalendarClock, Car, UserCog, MapPin, ShieldLock,
};

const ORG_TYPE_LABELS: Record<string, string> = {
  nonprofit: "Nonprofit", business: "Business", church: "Church",
  school: "School", creator: "Creator", community: "Community",
  government: "Government", restaurant: "Restaurant",
  sports_club: "Sports Club", other: "Organization",
};

export default function OrgDashboardSidebar({ org, organizerTypes, hasProducts, hasMenuRows, hasServiceRows, hasActiveServiceRows, hasReservationRows, hasFleetRows, capabilities, offerings, pendingRentalsCount }: { org: Org; organizerTypes: OrganizerDashboardTypeFlags; hasProducts?: boolean; hasMenuRows?: boolean; hasServiceRows?: boolean; hasActiveServiceRows?: boolean; hasReservationRows?: boolean; hasFleetRows?: boolean; capabilities: Capability[]; offerings?: readonly string[] | null; pendingRentalsCount?: number }) {
  const pathname = usePathname();
  const t = useTranslations('Organizer');
  const base = `/dashboard/org/${org.id}`;
  const rawNavItems = getFullOrgNavItems(base, { organizerTypes, hasProducts, hasMenuRows, hasServiceRows, hasActiveServiceRows, hasReservationRows, hasFleetRows, capabilities, offerings, pendingRentalsCount });
  function translateLabel(label: string): string {
    const key = label.toLowerCase() as any;
    try { return t(key); } catch { return label; }
  }
  const navItems = rawNavItems.map(item => ({
    ...item,
    label: translateLabel(item.label),
    children: item.children?.map((child) => ({ ...child, label: translateLabel(child.label) })),
  }));
  const sharedBases = computeSharedBases([{ items: navItems }]);
  const [open, setOpen] = useState(false);
  const [manuallyToggled, setManuallyToggled] = useState<Record<string, boolean>>({});
  const [isHoverCapable, setIsHoverCapable] = useState(true);
  useEffect(() => {
    const mql = window.matchMedia("(hover: hover)");
    setIsHoverCapable(mql.matches);
    const l = (e: MediaQueryListEvent) => setIsHoverCapable(e.matches);
    mql.addEventListener("change", l);
    return () => mql.removeEventListener("change", l);
  }, []);
  useEffect(() => {
    if (!open || isHoverCapable) return;
    function onClickOutside(e: MouseEvent) {
      const aside = document.querySelector("[data-adaptive-org-sidebar]");
      if (aside && !aside.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, isHoverCapable]);
  const orgTypeLabel = ORG_TYPE_LABELS[org.org_type ?? "other"] ?? "Organization";
  return (
    <motion.aside
      data-adaptive-org-sidebar
      initial={false}
      animate={{ width: open ? 300 : 60 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onMouseEnter={() => { if (isHoverCapable) setOpen(true); }}
      onMouseLeave={() => { if (isHoverCapable) setOpen(false); }}
      onClick={() => { if (!isHoverCapable) setOpen((v) => !v); }}
      className="sticky top-16 z-30 hidden h-[calc(100vh-4rem)] shrink-0 self-start flex-col overflow-hidden border-r border-zinc-200 bg-white text-zinc-900 supports-[height:100dvh]:h-[calc(100dvh-4rem)] md:flex"
    >
      <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* Collapsed: icon only */}
        {!open ? (
          <div className="flex flex-col items-center gap-3 px-2 py-4">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-zinc-100">
              {org.photo ? <Image src={org.photo} alt={org.name} width={32} height={32} className="h-full w-full object-cover" /> : <span className="text-xs font-black">{org.name.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="flex flex-col items-center gap-1">
              {navItems.slice(0, 7).map((item) => {
                const Icon = ORG_ICON_MAP[item.icon] ?? Globe;
                const active = isNavItemActive(pathname, null, item, sharedBases);
                return (
                  <Link key={item.href} href={item.href} title={item.label} aria-current={active ? "page" : undefined} className={`relative flex h-9 w-9 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${active ? "bg-orange-50 text-orange-700" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"}`}>
                    <Icon className="h-4 w-4" />
                    {item.badge !== undefined && Number(item.badge) > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-amber-500 ring-2 ring-white" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-zinc-100 px-4 py-3">
              <Link href="/dashboard" className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2">
                <ChevronLeft className="h-3.5 w-3.5" />
                {t('backToDashboard')}
              </Link>
            </div>
            <div className="border-b border-zinc-100 p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                  {org.photo ? <Image src={org.photo} alt={org.name} width={40} height={40} className="h-full w-full object-cover" /> : <LocalBrandedPlaceholder variant="avatar" title={org.name} initials={org.name.charAt(0).toUpperCase()} className="from-zinc-100 to-zinc-100 text-zinc-500" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-zinc-900">{org.name}</p>
                  <p className="text-xs text-zinc-500">{orgTypeLabel}</p>
                </div>
              </div>
              <Link href={org.slug ? `/org/${org.slug}` : `/organizers/${org.id}`} target="_blank" className="mt-3 flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                <Globe className="h-3 w-3" />
                {t('viewPublicProfile')}
              </Link>
            </div>
            <nav className="flex-1 space-y-0.5 p-3 text-sm">
              {navItems.map((item) => {
                const hasChildren = (item.children?.length ?? 0) > 0;
                const active = isNavItemOrChildActive(pathname, null, item, sharedBases);
                const submenuId = `org-submenu-${item.href.replace(/[^a-zA-Z0-9]/g, "-")}`;
                const expanded = hasChildren ? (manuallyToggled[item.href] ?? active) : false;
                const Icon = ORG_ICON_MAP[item.icon] ?? Globe;
                return (
                  <div key={item.href}>
                    <div className="flex items-center gap-1">
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-11 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${active ? "bg-orange-50 text-orange-700" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && Number(item.badge) > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                            {item.badge}
                          </span>
                        )}
                        {item.comingSoon && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700">Soon</span>}
                      </Link>
                      {hasChildren && (
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={submenuId}
                          aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`}
                          onClick={() => setManuallyToggled((prev) => ({ ...prev, [item.href]: !expanded }))}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </button>
                      )}
                      {item.settingsHref && (
                        <Link
                          href={item.settingsHref}
                          title={`${item.label} Settings`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition"
                        >
                          <Settings className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                    {hasChildren && expanded && (
                      <div id={submenuId} className="ml-4 mt-0.5 space-y-0.5 border-l border-zinc-100 pl-3">
                        {item.children!.map((child) => {
                          const childIsActive = isNavItemActive(pathname, null, child, sharedBases);
                          const ChildIcon = ORG_ICON_MAP[child.icon] ?? Globe;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              aria-current={childIsActive ? "page" : undefined}
                              className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${childIsActive ? "bg-orange-50 text-orange-700" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"}`}
                            >
                              <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                              <span className="flex-1 truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </>
        )}
      </div>
    </motion.aside>
  );
}
