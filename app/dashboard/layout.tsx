"use client";

import { ReactNode, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import DashboardSidebar from "./DashboardSidebar";
import DashboardMobileNav from "./DashboardMobileNav";
import { dashboardNavGroups } from "./nav-items";
import { computeSharedBases, isNavItemActive } from "@/components/nav/nav-active";

const navLinks = dashboardNavGroups.flatMap((group) => group.items);

// Module-level cache so auth check doesn't re-run on every client navigation
let _authedCache: boolean | null = null;

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const currentTab = useSearchParams().get("tab");
  const sharedBases = useMemo(() => computeSharedBases(dashboardNavGroups), []);
  const router = useRouter();
  const [authed, setAuthed] = useState(_authedCache ?? false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer on Escape, matching the modal convention used elsewhere.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  useEffect(() => {
    if (_authedCache === true) { setAuthed(true); return; }
    import("@/lib/supabase").then(({ supabase }) => {
      supabase.auth.getUser().then(({ data }) => {
        if (!data.user) {
          _authedCache = null;
          router.push("/login");
        } else {
          _authedCache = true;
          setAuthed(true);
        }
      });
    });
  }, [router]);

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/" className="text-lg font-black text-zinc-950">
          Aldriva
        </Link>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Scrollable pill nav — replaces a fixed bottom bar now that the
          dashboard nav covers 11 destinations across Organizations,
          Fundraisers, Events, Attendees, Articles, Businesses, Products. */}
      <DashboardMobileNav />

      {/* Drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Slide-over drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        inert={!drawerOpen}
        className={`fixed right-0 top-0 z-50 flex h-full w-72 flex-col bg-white shadow-2xl transition-transform duration-300 lg:hidden ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <span className="text-lg font-black">Navigation</span>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation menu"
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Mobile menu" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navLinks.map((item) => {
            const { label, href, icon: Icon } = item;
            const active = isNavItemActive(pathname, currentTab, item, sharedBases);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setDrawerOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main layout */}
      <div className="flex">
        <DashboardSidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-3 py-4 pb-8 sm:px-6 sm:py-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
