"use client";

import { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  BarChart2,
  Mail,
  Settings,
  X,
  Menu,
} from "lucide-react";
import DashboardSidebar from "./DashboardSidebar";

const navLinks = [
  { label: "Overview",      href: "/dashboard",               exact: true,  icon: LayoutDashboard },
  { label: "Organizations", href: "/dashboard/organizations",               icon: Building2 },
  { label: "Analytics",     href: "/dashboard/analytics",                   icon: BarChart2 },
  { label: "Messages",      href: "/dashboard/messages",                    icon: Mail },
  { label: "Settings",      href: "/dashboard/settings",                    icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    import("@/lib/supabase").then(({ supabase }) => {
      supabase.auth.getUser().then(({ data }) => {
        if (!data.user) {
          router.push("/login");
        } else {
          setAuthed(true);
        }
      });
    });
  }, [router]);

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500">
            <svg viewBox="0 0 32 32" className="h-4 w-4" fill="none">
              <path
                d="M8 7h12.5c2 0 3.5 1.5 3.5 3.4s-1.5 3.4-3.5 3.4H16l8.2 6.7c1.6 1.3 1.8 3.5.5 5.1-1.3 1.5-3.6 1.7-5.2.4L6.4 15.2A4.6 4.6 0 0 1 8 7Z"
                fill="white"
              />
              <path
                d="M8.6 17.5h5.8l-4.7 4.1c-1.5 1.3-3.8 1.1-5.1-.4-1.3-1.5-1.1-3.8.4-5.1l3.6-3.1v4.5Z"
                fill="white"
              />
            </svg>
          </div>
          <span className="text-lg font-black">Dashboard</span>
        </Link>
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-bold text-zinc-700"
        >
          <Menu size={18} />
          Menu
        </button>
      </div>

      {/* Drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Slide-over drawer */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-72 flex-col bg-white shadow-2xl transition-transform duration-300 lg:hidden ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <span className="text-lg font-black">Navigation</span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navLinks.map(({ label, href, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setDrawerOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${
                  active
                    ? "bg-orange-50 text-orange-600"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main layout */}
      <div className="mx-auto flex max-w-7xl gap-6 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <DashboardSidebar />
        <div className="flex min-w-0 flex-1 flex-col gap-4 pb-20 sm:gap-6 lg:pb-0">
          {children}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-zinc-200 bg-white shadow-lg lg:hidden">
        {navLinks.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 transition ${
                active ? "text-orange-600" : "text-zinc-400"
              }`}
            >
              <Icon size={22} />
              <span className="text-[10px] font-bold">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}