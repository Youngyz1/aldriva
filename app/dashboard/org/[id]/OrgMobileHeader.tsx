"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from 'next-intl';
import { ChevronLeft } from "lucide-react";
import { MobileHamburgerButton, MobileDrawer } from "@/components/nav/MobileDrawer";
import SidebarNavList from "@/components/nav/SidebarNavList";
import { getOrgNavItems } from "./org-nav-items";
import type { NavGroup } from "@/components/nav/nav-active";
import type { Capability } from "@/lib/business-taxonomy";

export default function OrgMobileHeader({
  org,
  hasEvents,
  hasFundraisers,
  hasProducts,
  hasWebsite,
  hasMenuRows,
  hasServiceRows,
  hasReservationRows,
  capabilities,
  offerings,
}: {
  org: { id: string; name: string };
  hasEvents?: boolean;
  hasFundraisers?: boolean;
  hasProducts?: boolean;
  hasWebsite?: boolean;
  hasMenuRows?: boolean;
  hasServiceRows?: boolean;
  hasReservationRows?: boolean;
  capabilities?: Capability[];
  offerings?: readonly string[] | null;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('Organizer');
  const base = `/dashboard/org/${org.id}`;
  const navItems = getOrgNavItems(base, { hasEvents, hasFundraisers, hasProducts, hasWebsite, hasMenuRows, hasServiceRows, hasReservationRows, capabilities, offerings }).map(item => {
    const key = item.label.toLowerCase() as any;
    try { return { ...item, label: t(key) }; } catch { return item; }
  });
  const groups: NavGroup[] = [{ items: navItems }];

  return (
    <>
      <div className="sticky top-16 z-30 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-zinc-900">{org.name}</p>
        </div>
        <MobileHamburgerButton open={open} onClick={() => setOpen((v) => !v)} label="Open organization menu" />
      </div>
      <MobileDrawer open={open} onClose={() => setOpen(false)} title="Organization navigation">
        <div className="space-y-4">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">Organization</p>
            <p className="mt-1 truncate text-sm font-black text-white">{org.name}</p>
          </div>
          <SidebarNavList groups={groups} tone="dark" ariaLabel="Organization workspace navigation" />
        </div>
      </MobileDrawer>
    </>
  );
}
