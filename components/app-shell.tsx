"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Avatar from "@radix-ui/react-avatar";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as Separator from "@radix-ui/react-separator";
import {
  LayoutDashboard,
  Calendar,
  Heart,
  Users,
  Settings,
  DollarSign,
  BarChart2,
  Building2,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  LogOut,
  User,
  ChevronsUpDown,
  Home,
  Ticket,
  Newspaper,
  Package,
} from "lucide-react";

const navGroups = [
  {
    label: "Main",
    links: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { label: "Organizations", href: "/dashboard/organizations", icon: Building2 },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0f14] text-white">
      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={`relative flex flex-col border-r border-white/[0.06] bg-[#141418] transition-all duration-300 ${
          collapsed ? "w-[68px]" : "w-[240px]"
        } hidden lg:flex`}
      >
        {/* Logo */}
        <div className="flex h-[60px] shrink-0 items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/30">
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
            {!collapsed && (
              <span className="truncate text-sm font-black tracking-tight text-white">
                Aldriva
              </span>
            )}
          </Link>
        </div>

        <Separator.Root className="h-px bg-white/[0.06]" />

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.links.map(({ label, href, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={collapsed ? label : undefined}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                        active
                          ? "bg-orange-500/10 text-orange-400"
                          : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
                      }`}
                    >
                      <Icon
                        size={17}
                        className={`shrink-0 transition-colors ${
                          active ? "text-orange-400" : "text-white/40 group-hover:text-white/60"
                        }`}
                      />
                      {!collapsed && <span className="truncate">{label}</span>}
                      {!collapsed && active && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-orange-400" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: Settings + Collapse */}
        <div className="shrink-0 px-2 pb-4">
          <Separator.Root className="mb-3 h-px bg-white/[0.06]" />
          <Link
            href="/dashboard/settings"
            title={collapsed ? "Settings" : undefined}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.04] hover:text-white/80"
          >
            <Settings size={17} className="shrink-0 text-white/40" />
            {!collapsed && <span>Settings</span>}
          </Link>
          <Link
            href="/"
            title={collapsed ? "Home" : undefined}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.04] hover:text-white/80"
          >
            <Home size={17} className="shrink-0 text-white/40" />
            {!collapsed && <span>Back to Site</span>}
          </Link>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-[72px] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#1e1e26] text-white/60 shadow-md hover:text-white"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </aside>

      {/* ─── Main Content ────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] bg-[#141418] px-5">
          {/* Search */}
          <div className="flex max-w-xs flex-1 items-center gap-2 rounded-xl bg-white/[0.05] px-3.5 py-2 ring-1 ring-white/[0.07] transition focus-within:ring-orange-500/40">
            <Search size={15} className="shrink-0 text-white/30" />
            <input
              type="text"
              placeholder="Search…"
              className="w-full bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications */}
            <button className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-white/50 ring-1 ring-white/[0.07] transition hover:bg-white/[0.08] hover:text-white/80">
              <Bell size={16} />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-orange-500" />
            </button>

            {/* Avatar dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="flex items-center gap-2.5 rounded-xl bg-white/[0.05] py-1.5 pl-1.5 pr-3 ring-1 ring-white/[0.07] transition hover:bg-white/[0.08]">
                  <Avatar.Root className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                    <Avatar.Image
                      src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&h=64&fit=crop&crop=face"
                      alt="User"
                      className="h-full w-full object-cover"
                    />
                    <Avatar.Fallback className="flex h-full w-full items-center justify-center bg-orange-500 text-xs font-bold text-white">
                      U
                    </Avatar.Fallback>
                  </Avatar.Root>
                  <span className="hidden text-xs font-semibold text-white/70 sm:block">
                    My Account
                  </span>
                  <ChevronsUpDown size={13} className="text-white/30" />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 min-w-[180px] rounded-2xl border border-white/[0.08] bg-[#1e1e26] p-1.5 shadow-2xl"
                >
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/dashboard/settings/profile"
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-white/70 outline-none transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <User size={14} />
                      Profile
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/dashboard/settings"
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-white/70 outline-none transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <Settings size={14} />
                      Settings
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1.5 h-px bg-white/[0.06]" />
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/login"
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-red-400 outline-none transition hover:bg-red-500/10 hover:text-red-300"
                    >
                      <LogOut size={14} />
                      Sign out
                    </Link>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-[#0f0f14] p-5 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
