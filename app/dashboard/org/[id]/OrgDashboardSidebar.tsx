"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from 'next-intl';
import { motion } from "framer-motion";
import Image from "next/image";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import {
  ChevronLeft, Globe,
  LayoutDashboard, Calendar, Heart, Package, Briefcase, Users, BookOpen, Star, ImageIcon, BarChart2, Settings,
} from "lucide-react";
import { getOrgNavItems } from "./org-nav-items";

type Org = {
  id: string;
  name: string;
  slug: string | null;
  photo: string | null;
  status: string | null;
  org_type: string | null;
};

const ORG_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Globe, Calendar, Heart, Package, Briefcase, Users, BookOpen, Star, ImageIcon, BarChart2, Settings,
};

const ORG_TYPE_LABELS: Record<string, string> = {
  nonprofit: "Nonprofit", business: "Business", church: "Church",
  school: "School", creator: "Creator", community: "Community",
  government: "Government", restaurant: "Restaurant",
  sports_club: "Sports Club", other: "Organization",
};

export default function OrgDashboardSidebar({ org, hasEvents, hasFundraisers, hasProducts, hasWebsite }: { org: Org; hasEvents?: boolean; hasFundraisers?: boolean; hasProducts?: boolean; hasWebsite?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations('Organizer');
  const base = `/dashboard/org/${org.id}`;
  const rawNavItems = getOrgNavItems(base, { hasEvents, hasFundraisers, hasProducts, hasWebsite });
  const navItems = rawNavItems.map(item => {
    const key = item.label.toLowerCase() as any;
    try { return { ...item, label: t(key) }; } catch { return item; }
  });
  const [open, setOpen] = useState(false);
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
  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }
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
      className="sticky top-16 z-30 hidden h-[calc(100vh-4rem)] shrink-0 self-start flex-col overflow-hidden border-r border-zinc-200 bg-white text-zinc-900 supports-[height:100dvh]:h-[calc(100dvh-4rem)] lg:flex"
    >
      <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* Collapsed: icon only */}
        {!open ? (
          <div className="flex flex-col items-center gap-3 px-2 py-4">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-zinc-100">
              {org.photo ? <Image src={org.photo} alt={org.name} width={32} height={32} className="h-full w-full object-cover" /> : <span className="text-xs font-black">{org.name.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="flex flex-col items-center gap-1">
              {navItems.slice(0, 5).map((item) => {
                const Icon = ORG_ICON_MAP[item.icon] ?? Globe;
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} title={item.label} className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-orange-50 text-orange-700" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"}`}>
                    <Icon className="h-4 w-4" />
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-zinc-100 px-4 py-3">
              <Link href="/dashboard" className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900">
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
                const active = isActive(item.href);
                const Icon = ORG_ICON_MAP[item.icon] ?? Globe;
                return (
                  <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-orange-50 text-orange-700" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"}`}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.comingSoon && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400">Soon</span>}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </div>
    </motion.aside>
  );
}
