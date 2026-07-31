"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import {
  LayoutDashboard, Calendar, Heart, Package, Briefcase,
  Users, BookOpen, Star, ImageIcon, BarChart2, Settings,
  ChevronLeft, Globe
} from "lucide-react";

type Org = {
  id: string;
  name: string;
  slug: string | null;
  photo: string | null;
  status: string | null;
  org_type: string | null;
};

const ORG_TYPE_LABELS: Record<string, string> = {
  nonprofit: "Nonprofit", business: "Business", church: "Church",
  school: "School", creator: "Creator", community: "Community",
  government: "Government", restaurant: "Restaurant",
  sports_club: "Sports Club", other: "Organization",
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
};

export default function OrgDashboardSidebar({ org }: { org: Org }) {
  const pathname = usePathname();
  const base = `/dashboard/organizations/${org.slug ?? org.id}`;

  const navItems: NavItem[] = [
    { label: "Overview",    href: `${base}/overview`,    icon: LayoutDashboard },
    { label: "Events",      href: `${base}/events`,      icon: Calendar },
    { label: "Fundraisers", href: `${base}/fundraisers`, icon: Heart },
    { label: "Products",    href: `${base}/products`,    icon: Package },
    { label: "Services",    href: `${base}/services`,    icon: Briefcase,  comingSoon: true },
    { label: "Volunteers",  href: `${base}/volunteers`,  icon: Users,      comingSoon: true },
    { label: "Blog",        href: `${base}/blog`,        icon: BookOpen },
    { label: "Reviews",     href: `${base}/reviews`,     icon: Star },
    { label: "Gallery",     href: `${base}/gallery`,     icon: ImageIcon,  comingSoon: true },
    { label: "Analytics",   href: `${base}/analytics`,   icon: BarChart2 },
    { label: "Settings",    href: `${base}/settings`,    icon: Settings },
  ];

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const orgTypeLabel = ORG_TYPE_LABELS[org.org_type ?? "other"] ?? "Organization";

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-slate-950 text-white lg:flex">
      {/* ← Back to account */}
      <div className="border-b border-white/10 px-4 py-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-xs font-bold text-slate-400 transition hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All Organizations
        </Link>
      </div>

      {/* Org identity */}
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white/10">
            {org.photo ? (
              <Image src={org.photo} alt={org.name} width={40} height={40} className="h-full w-full object-cover" />
            ) : (
              <LocalBrandedPlaceholder
                variant="avatar"
                title={org.name}
                initials={org.name.charAt(0).toUpperCase()}
                className="from-transparent to-transparent text-lg text-white/60"
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">{org.name}</p>
            <p className="text-xs text-slate-400">{orgTypeLabel}</p>
          </div>
        </div>
        {/* View public profile */}
        <Link
          href={`/organizations/${org.slug ?? org.id}`}
          target="_blank"
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <Globe className="h-3 w-3" />
          View Public Profile
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-3 text-sm">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold transition ${
                active
                  ? "bg-orange-600/20 text-orange-400 ring-1 ring-orange-400/20"
                  : "text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.comingSoon && (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-500">
                  Soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
