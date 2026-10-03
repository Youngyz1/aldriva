"use client";
import { useState } from "react";
import Link from "next/link";
import { MobileHamburgerButton, MobileDrawer } from "@/components/nav/MobileDrawer";
import SidebarNavList from "@/components/nav/SidebarNavList";
import { dashboardNavGroups } from "./nav-items";
import { MyOrganizersDropdown } from "@/components/dashboard/MyOrganizersDropdown";

export default function MobileGlobalNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sticky top-16 z-30 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/" className="text-base font-black text-zinc-900">
          Aldriva
        </Link>
        <MobileHamburgerButton open={open} onClick={() => setOpen((v) => !v)} label="Open menu" />
      </div>
      <MobileDrawer open={open} onClose={() => setOpen(false)} title="Dashboard navigation">
        <div className="space-y-4">
          <Link
            href="/dashboard/create"
            onClick={() => setOpen(false)}
            className="block rounded-xl bg-brand-700 px-3 py-2.5 text-center text-sm font-black text-white hover:bg-brand-800"
          >
            + Create New
          </Link>
          <MyOrganizersDropdown variant="sidebar" />
          <SidebarNavList groups={dashboardNavGroups} tone="dark" ariaLabel="Dashboard navigation" className="space-y-5" />
          <Link
            href="/about"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            Help & Support
          </Link>
        </div>
      </MobileDrawer>
    </>
  );
}
