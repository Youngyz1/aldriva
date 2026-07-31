"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  BarChart2,
  Mail,
  Settings,
  HelpCircle
} from "lucide-react";

type SidebarLink = {
  label: string;
  href: string;
  exact?: boolean;
  icon: React.ComponentType<{ className?: string }>;
};

const links: SidebarLink[] = [
  { label: "Overview",      href: "/dashboard",               exact: true,  icon: LayoutDashboard },
  { label: "Organizations", href: "/dashboard/organizations",               icon: Building2 },
  { label: "Analytics",     href: "/dashboard/analytics",                   icon: BarChart2 },
  { label: "Messages",      href: "/dashboard/messages",                    icon: Mail },
  { label: "Settings",      href: "/dashboard/settings",                    icon: Settings },
];

export default function DashboardSidebar() {
  const pathname = usePathname();

  function isActive(link: SidebarLink) {
    if (link.exact) return pathname === link.href;
    return pathname.startsWith(link.href);
  }

  return (
    <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-60 shrink-0 rounded-2xl bg-slate-950 p-4 text-white shadow-xl shadow-slate-950/15 lg:flex lg:flex-col">
      {/* Brand */}
      <Link href="/" className="mb-6 flex items-center gap-3 px-2">
        <span className="text-lg font-black text-white">Aldriva</span>
      </Link> 

      {/* Quick-create buttons */}
      <div className="mb-5 grid gap-2">
        <Link
          href="/create-organizer"
          className="rounded-xl bg-orange-600 px-3 py-2.5 text-center text-sm font-black text-white transition hover:bg-orange-700"
        >
          + New Organization
        </Link>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 space-y-1 text-sm font-bold text-slate-300">
        {links.map((link) => {
          const active = isActive(link);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                active
                  ? "bg-orange-600/20 text-orange-400 ring-1 ring-orange-400/20"
                  : "hover:bg-white/10 hover:text-white"
              }`}
            >
              <link.icon className="h-4 w-4 shrink-0" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Help link at bottom */}
      <Link
        href="/about"
        className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white"
      >
        <HelpCircle className="h-4 w-4 shrink-0" />
        Help &amp; Support
      </Link>
    </aside>
  );
}