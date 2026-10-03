"use client";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import SidebarNavList from "./SidebarNavList";
import type { NavGroup } from "./nav-active";

export default function AppSidebar({
  groups,
  header,
  footer,
  navAriaLabel,
}: {
  groups: NavGroup[];
  header: ReactNode;
  footer?: ReactNode;
  navAriaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [isHoverCapable, setIsHoverCapable] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia("(hover: hover)");
    setIsHoverCapable(mql.matches);
    const listener = (e: MediaQueryListEvent) => setIsHoverCapable(e.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (!open || isHoverCapable) return;
    function onClickOutside(e: MouseEvent) {
      const aside = document.querySelector("[data-adaptive-app-sidebar]");
      if (aside && !aside.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, isHoverCapable]);

  return (
    <motion.aside
      data-adaptive-app-sidebar
      initial={false}
      animate={{ width: open ? 300 : 60 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onMouseEnter={() => {
        if (isHoverCapable) setOpen(true);
      }}
      onMouseLeave={() => {
        if (isHoverCapable) setOpen(false);
      }}
      onClick={() => {
        if (!isHoverCapable) setOpen((v) => !v);
      }}
      className="sticky top-16 z-30 hidden h-[calc(100vh-4rem)] shrink-0 self-start flex-col overflow-hidden border-r border-zinc-200 bg-white text-zinc-900 supports-[height:100dvh]:h-[calc(100dvh-4rem)] lg:flex"
    >
      <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className={open ? "block" : "hidden"}>
          <div className="px-3 pt-5">{header}</div>
        </div>
        <div className={!open ? "block" : "hidden"}>
          <div className="flex flex-col items-center gap-2 px-2 pt-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-xs font-black text-white">A</span>
            <Link href="/dashboard/create" title="Create New" className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-700 text-white hover:bg-brand-800">
              <Plus className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <SidebarNavList
          groups={groups}
          tone="light"
          ariaLabel={navAriaLabel}
          className="flex-1 space-y-5 px-2 py-4"
          collapsed={!open}
        />
        <div className={open ? "block" : "hidden"}>{footer}</div>
        <div className={!open ? "flex justify-center p-2" : "hidden"}>
          <span className="h-6 w-6" aria-hidden />
        </div>
      </div>
    </motion.aside>
  );
}
