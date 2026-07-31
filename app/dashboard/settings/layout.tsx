"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Lock, Bell, CreditCard, ShieldAlert, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

const settingsNavItems = [
  {
    label: "Profile",
    href: "/dashboard/settings/profile",
    icon: User,
    description: "Personal details and addresses",
  },
  {
    label: "Security",
    href: "/dashboard/settings/security",
    icon: Lock,
    description: "Password and account access",
  },
  {
    label: "Notifications",
    href: "/dashboard/settings/notifications",
    icon: Bell,
    description: "Email preference settings",
  },
  {
    label: "Payments",
    href: "/dashboard/settings/payments",
    icon: CreditCard,
    description: "Stripe payouts and currency",
  },
  {
    label: "Privacy",
    href: "/dashboard/settings/privacy",
    icon: ShieldAlert,
    description: "Profile and display privacy",
  },
  {
    label: "Connected Accounts",
    href: "/dashboard/settings/accounts",
    icon: Link2,
    description: "Third-party sync integrations",
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Settings Header */}
      <header className="rounded-xl border border-zinc-200/80 bg-white px-4 py-3 shadow-xs sm:rounded-2xl sm:px-6 sm:py-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-orange-600 sm:text-xs">
          Dashboard
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl font-sans">
          Settings Center
        </h1>
        <p className="mt-1 text-xs font-medium text-zinc-500 sm:text-sm">
          Manage your personal details, credentials, security, notifications, and integrations.
        </p>
      </header>

      {/* Main Settings Navigation and Content Container */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Navigation Sidebar (Desktop: Left, Mobile: Top Scrollable Tabs) */}
        <aside className="w-full shrink-0 lg:w-64">
          {/* Desktop Sidebar Navigation */}
          <nav className="hidden space-y-1 lg:block">
            {settingsNavItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200",
                    active
                      ? "bg-white text-orange-600 shadow-xs ring-1 ring-zinc-200/50"
                      : "text-zinc-600 hover:bg-white/50 hover:text-zinc-900"
                  )}
                >
                  <Icon
                    size={18}
                    className={cn(
                      "shrink-0 transition-colors duration-200",
                      active ? "text-orange-500" : "text-zinc-400 group-hover:text-zinc-500"
                    )}
                  />
                  <div className="flex flex-col text-left">
                    <span className="leading-none">{item.label}</span>
                    <span className="mt-1 text-[10px] font-medium text-zinc-400 leading-none">
                      {item.description}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Mobile Scrollable Horizontal Navigation */}
          <nav className="flex gap-2 overflow-x-auto pb-2 scrollbar-none lg:hidden">
            {settingsNavItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all duration-200 shrink-0",
                    active
                      ? "bg-white text-orange-600 shadow-xs ring-1 ring-zinc-200/50"
                      : "bg-white/40 text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                  )}
                >
                  <Icon
                    size={15}
                    className={cn(
                      "shrink-0",
                      active ? "text-orange-500" : "text-zinc-400"
                    )}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Settings Content Area */}
        <main className="flex-1 min-w-0">
          <div className="transition-all duration-200">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
