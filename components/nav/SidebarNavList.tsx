"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { computeSharedBases, isNavItemActive, type NavGroup } from "./nav-active";

const TONES = {
  /** Persistent dark app-chrome sidebars — dashboard, org workspace, admin. */
  dark: {
    groupLabel: "text-slate-500",
    active: "border-brand-600 bg-white/[0.06] text-brand-400",
    inactive: "border-transparent text-slate-300 hover:bg-white/10 hover:text-white",
    ring: "focus-visible:ring-offset-slate-950",
    description: "text-slate-500",
    comingSoon: "bg-white/10 text-slate-500",
  },
  /** In-page light nav, e.g. account settings. */
  light: {
    groupLabel: "text-zinc-400",
    active: "border-brand-600 bg-white text-brand-700",
    inactive: "border-transparent text-zinc-600 hover:bg-white/50 hover:text-zinc-900",
    ring: "focus-visible:ring-offset-2",
    description: "text-zinc-400",
    comingSoon: "bg-zinc-100 text-zinc-400",
  },
} as const;

/**
 * The one nav-list renderer shared by every sidebar-shaped navigation surface
 * in the app (dashboard, org workspace, admin, settings). Owns spacing,
 * icon sizing, and the single active/hover/focus visual language; callers
 * configure content (groups) and color scheme (tone) only.
 */
export default function SidebarNavList({
  groups,
  tone,
  ariaLabel,
  className = "space-y-5",
}: {
  groups: NavGroup[];
  tone: keyof typeof TONES;
  ariaLabel: string;
  className?: string;
}) {
  const pathname = usePathname();
  const currentTab = useSearchParams().get("tab");
  const sharedBases = useMemo(() => computeSharedBases(groups), [groups]);
  const t = TONES[tone];

  return (
    <nav aria-label={ariaLabel} className={className}>
      {groups.map((group, groupIndex) => (
        <div key={group.label ?? groupIndex} className="space-y-0.5">
          {group.label && (
            <p className={`mb-1 border-l-2 border-transparent px-3 text-[10px] font-black uppercase tracking-widest ${t.groupLabel}`}>
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(pathname, currentTab, item, sharedBases);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-r-lg border-l-2 px-3 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${t.ring} ${
                  active ? t.active : t.inactive
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.description && (
                    <span className={`mt-0.5 block truncate text-[10px] font-medium leading-none ${t.description}`}>
                      {item.description}
                    </span>
                  )}
                </span>
                {item.comingSoon && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${t.comingSoon}`}>
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
