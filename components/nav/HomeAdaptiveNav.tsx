"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home", href: "/" },
  { label: "Events", href: "/events" },
  { label: "Fundraisers", href: "/fundraisers" },
  { label: "Articles", href: "/articles" },
  { label: "Businesses", href: "/businesses" },
  { label: "Shop", href: "/products" },
] as const;

function getActiveLabel(pathname: string): string {
  const match = NAV_ITEMS.slice().reverse().find((item) => {
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.href);
  });
  return match?.label ?? "Home";
}

export default function HomeAdaptiveNav() {
  const pathname = usePathname();
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
      {/* Collapsed / Expanded pill */}
      <motion.div
        layout
        className={cn(
          "relative flex items-center overflow-hidden rounded-full border shadow-xs",
          open
            ? "border-zinc-200 bg-white"
            : "border-zinc-200 bg-white hover:border-zinc-300"
        )}
        initial={false}
        animate={{ width: open ? "auto" : "auto" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {/* Trigger */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="home-adaptive-nav"
          aria-label={open ? "Close site navigation" : "Open site navigation"}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition",
            open ? "bg-zinc-900 text-white" : "bg-white text-zinc-800 hover:bg-zinc-50"
          )}
        >
          <Home className="h-4 w-4 shrink-0" />
          <span>{activeLabel}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>

        {/* Expanded items — inline on desktop, handled via same container */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.nav
              id="home-adaptive-nav"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex items-center"
              aria-label="Site navigation"
            >
              {/* Desktop: horizontal pill items */}
              <div className="hidden items-center gap-1 pl-1 pr-2 sm:flex">
                {NAV_ITEMS.filter((i) => i.label !== activeLabel).map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
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
                {/* When active is Home, Home already in trigger, don't duplicate */}
                {activeLabel === "Home" &&
                  NAV_ITEMS.slice(1).map((item) => null)}
              </div>

              {/* Show active as first item on desktop when not Home is trigger? Already trigger shows active, so remaining items exclude active */}
              {/* Mobile: vertical dropdown handled below, hide inline */}
            </motion.nav>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Mobile expanded panel — vertical, constrained to viewport */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="absolute left-1/2 top-[calc(100%+8px)] z-40 w-[min(calc(100vw-16px),340px)] -translate-x-1/2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl sm:hidden"
          >
            <nav className="flex flex-col gap-1" aria-label="Site navigation">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
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
