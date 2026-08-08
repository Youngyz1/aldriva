"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { computeSharedBases, isNavItemActive, type NavItem } from "./nav-active";

/**
 * Shared horizontal scrollable pill strip for mobile nav — used wherever a
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

  // Keep the active pill in view when the strip is scrolled (e.g. deep-linking
  // into a tab that's off-screen to the right on first paint).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [pathname, currentTab]);

  return (
    <nav aria-label={ariaLabel} className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isNavItemActive(pathname, currentTab, item, sharedBases);
        return (
          <Link
            key={item.href}
            href={item.href}
            ref={active ? activeRef : undefined}
            className={`flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
              active
                ? "border-brand-100 bg-brand-50 text-brand-800"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {item.label}
            {item.comingSoon && (
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-zinc-400">
                Soon
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
