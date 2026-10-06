"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HomeAdaptiveNav() {
  const pathname = usePathname();
  const t = useTranslations('Navigation');
  const NAV_ITEMS = [
    { label: t('home'), href: "/" },
    { label: t('events'), href: "/events" },
    { label: t('fundraisers'), href: "/fundraisers" },
    { label: t('articles'), href: "/articles" },
    { label: t('businesses'), href: "/businesses" },
    { label: t('shop'), href: "/products" },
  ] as const;

  function getActiveLabel(pathname: string): string {
    const match = NAV_ITEMS.slice().reverse().find((item) => {
      if (item.href === "/") return pathname === "/";
      return pathname.startsWith(item.href);
    });
    return match?.label ?? t('home');
  }

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLabel = getActiveLabel(pathname ?? "/");

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={containerRef} className="relative flex items-center justify-center">
      {/*
        Pill container.
        IMPORTANT: no overflow-hidden here — it would clip the inline <motion.nav>
        expansion on desktop and would block the absolutely-positioned mobile panel
        from being painted outside the pill bounds.
      */}
      <motion.div
        layout
        className={cn(
          "relative flex items-center rounded-full border shadow-xs",
          open
            ? "border-zinc-200 bg-white"
            : "border-zinc-200 bg-white hover:border-zinc-300"
        )}
        initial={false}
        animate={{ width: open ? "auto" : "auto" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {/*
          Trigger button.
          Mobile (<sm): icon only — no text label or chevron, compact padding.
            - `aria-label` always present so screen readers know its purpose.
            - `aria-expanded` reflects open state.
            - onClick always wired to setOpen.
          sm+: icon + activeLabel text + chevron, normal padding.
        */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="home-adaptive-nav-mobile"
          aria-label={open ? "Close site navigation" : "Open site navigation"}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex items-center rounded-full transition",
            // Mobile: icon-only, compact
            "gap-0 px-2.5 py-2",
            // sm+: icon + label + chevron
            "sm:gap-1.5 sm:px-4 sm:py-2",
            open ? "bg-zinc-900 text-white" : "bg-white text-zinc-800 hover:bg-zinc-50"
          )}
        >
          <Home className="h-4 w-4 shrink-0" />
          {/* Label and chevron: hidden on narrow screens */}
          <span className="hidden text-sm font-bold sm:inline">{activeLabel}</span>
          <ChevronDown
            className={cn(
              "hidden h-4 w-4 shrink-0 transition-transform sm:block",
              open && "rotate-180"
            )}
          />
        </button>

        {/* Desktop inline expansion — only visible at sm+ (hidden on mobile via sm:flex) */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.nav
              id="home-adaptive-nav-desktop"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex items-center"
              aria-label="Site navigation"
            >
              <div className="hidden items-center gap-1 pl-1 pr-2 sm:flex">
                {NAV_ITEMS.filter((i) => i.label !== activeLabel).map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap transition",
                        isActive
                          ? "bg-orange-50 text-orange-700"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </motion.div>

      {/*
        Mobile dropdown panel — uses `fixed` positioning so it escapes every
        ancestor overflow/clip/transform context (the sticky header, the flex
        row, the pill, the center wrapper — none of them can clip this).

        Placement: just below the navbar (top-14 = 56px = h-14 on mobile).
        Horizontally: centered in the viewport with left/right inset + margin,
        capped at 340px wide, always ≥8px from each edge.

        z-index: z-[200] — above the sticky header (z-50) and any overlay.
        Only shown at <sm; at sm+ the inline desktop expansion handles nav.
      */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="home-adaptive-nav-mobile"
            role="dialog"
            aria-label="Site navigation"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed inset-x-2 top-[calc(3.5rem+8px)] z-[200] mx-auto max-w-[340px] rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl sm:hidden"
          >
            <nav className="flex flex-col gap-1" aria-label="Site navigation">
              {NAV_ITEMS.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-sm font-bold transition",
                      isActive
                        ? "bg-orange-50 text-orange-700"
                        : "text-zinc-700 hover:bg-zinc-50 hover:text-orange-600"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
