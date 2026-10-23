"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { DEFAULT_PLATFORM_NAV_ICON, PLATFORM_NAV_ICONS } from "./platform-nav-icons";
import { computeSharedBases, isNavItemActive, type NavItem } from "./nav-active";
import { cn } from "@/lib/utils";

/**
 * Refined horizontal scrollable pill strip for mobile nav — used wherever a
 * persistent sidebar collapses to a mobile-width nav (dashboard, org
 * workspace, admin, create-fundraiser).
 */
export default function MobilePillNav({
  items,
  ariaLabel,
}: {
  items: NavItem[];
  ariaLabel: string;
}) {
  const pathname = usePathname();
  const currentTab = useSearchParams().get("tab");
  const sharedBases = useMemo(() => computeSharedBases([{ items }]), [items]);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Keep the active pill in view when the strip is scrolled
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [pathname, currentTab]);

  return (
    <nav
      aria-label={ariaLabel}
      className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 scrollbar-none touch-pan-x scroll-smooth"
    >
      {items.map((item) => {
        const Icon = PLATFORM_NAV_ICONS[item.icon] ?? DEFAULT_PLATFORM_NAV_ICON;
        const active = isNavItemActive(pathname, currentTab, item, sharedBases);
        return (
          <Link
            key={item.href}
            href={item.href}
            ref={active ? activeRef : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-1 active:scale-95",
              active
                ? "bg-brand-700 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900 border border-transparent"
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-zinc-600")} />
            <span>{item.label}</span>
            {item.comingSoon && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide",
                  active ? "bg-brand-800 text-white" : "bg-zinc-200 text-zinc-700"
                )}
              >
                Soon
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
