"use client";
import Link from "next/link";
import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import AppSidebar from "@/components/nav/AppSidebar";
import SidebarNavList from "@/components/nav/SidebarNavList";
import { MobileHamburgerButton, MobileDrawer } from "@/components/nav/MobileDrawer";
import type { NavGroup } from "@/components/nav/nav-active";

export function ManagementShell({
  entityLabel,
  entityName,
  backHref,
  navGroups,
  children,
  headerSlot,
  mobileHeaderSlot,
}: {
  entityLabel: string;
  entityName: string;
  backHref: string;
  navGroups: NavGroup[];
  children: ReactNode;
  headerSlot?: ReactNode;
  mobileHeaderSlot?: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const isInvitationBuilderRoute = /^\/dashboard\/events\/[^/]+\/invitation-page\/?$/.test(pathname);
  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <AppSidebar
        groups={navGroups}
        navAriaLabel={`${entityLabel} navigation`}
        header={
          headerSlot ?? (
            <div className="px-3 pt-5 space-y-3">
              <Link href={backHref} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to My Things
              </Link>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{entityLabel}</p>
                <p className="mt-1 truncate text-sm font-bold text-zinc-900">{entityName}</p>
              </div>
            </div>
          )
        }
        footer={
          <div className="p-3">
            <Link href={backHref} className="text-xs font-semibold text-zinc-500 hover:text-zinc-900">{backHref === "/dashboard" ? "← Back to Dashboard" : "← My Things"}</Link>
          </div>
        }
      />
      <div className="min-w-0 flex-1">
        {/* Mobile: single hamburger header — no bottom pills, no duplicate nav */}
        <div className={`${isInvitationBuilderRoute ? "relative" : "sticky top-16"} z-30 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 lg:hidden`}>
          <Link href={backHref} className="flex items-center gap-1.5 text-xs font-bold text-zinc-600">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <MobileHamburgerButton open={mobileOpen} onClick={() => setMobileOpen((v) => !v)} label={`Open ${entityLabel} menu`} />
        </div>
        {/* Switcher below header on mobile when provided (fundraiser/event selector) — separate from hamburger */}
        {mobileHeaderSlot ? <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-2 lg:hidden">{mobileHeaderSlot}</div> : null}
        <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} title={`${entityLabel} navigation`}>
          <div className="space-y-4">
            <Link href={backHref} onClick={() => setMobileOpen(false)} className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-900">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
            </Link>
            <SidebarNavList groups={navGroups} tone="light" ariaLabel={`${entityLabel} navigation`} />
          </div>
        </MobileDrawer>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
