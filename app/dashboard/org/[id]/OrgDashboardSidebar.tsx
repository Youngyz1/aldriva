"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import {
  ChevronLeft, Globe
} from "lucide-react";
import { getOrgNavItems } from "./org-nav-items";

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

export default function OrgDashboardSidebar({ org }: { org: Org }) {
  const pathname = usePathname();
  // Base always uses the immutable UUID — never the slug
  const base = `/dashboard/org/${org.id}`;

  // Item definitions live in ./org-nav-items so the mobile pill nav exposes
  // the exact same destinations; only the rendering differs here.
  const navItems = getOrgNavItems(base);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const orgTypeLabel = ORG_TYPE_LABELS[org.org_type ?? "other"] ?? "Organization";

  return (
    // Pinned app chrome — see components/nav/AppSidebar for the rationale:
    // stick below the sticky global navbar (h-16), never under it.
    <aside className="sticky top-16 z-30 hidden h-[calc(100vh-4rem)] w-64 shrink-0 self-start flex-col overflow-y-auto overscroll-contain bg-slate-950 text-white supports-[height:100dvh]:h-[calc(100dvh-4rem)] lg:flex">
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
        {/* View public profile — uses slug for the public URL */}
        <Link
          href={org.slug ? `/org/${org.slug}` : `/organizers/${org.id}`}
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
