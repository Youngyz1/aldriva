/**
 * components/dashboard/overview/QuickActionTile.tsx
 *
 * Action tiles matching docs/design/dashboard-overview/04-components.md §8.
 * Primary: 48px min-height solid brand-700.
 * Secondary: 72px min-height 2-col tile with icon, title, and one-line description.
 */

import React from "react";
import Link from "next/link";

export interface QuickActionTileProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  href: string;
  variant: "primary" | "secondary";
  className?: string;
}

export function QuickActionTile({
  icon: Icon,
  label,
  description,
  href,
  variant,
  className = "",
}: QuickActionTileProps) {
  if (variant === "primary") {
    return (
      <Link
        href={href}
        className={`min-h-[48px] w-full flex items-center justify-center gap-2 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm px-4 py-3 transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${className}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`min-h-[72px] flex items-center gap-3.5 p-3.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition active:scale-[0.99] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${className}`}
    >
      <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0 group-hover:bg-zinc-200/80 transition">
        <Icon className="h-5 w-5 text-zinc-700" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] sm:text-[15px] font-bold text-zinc-900 truncate">
          {label}
        </p>
        <p className="text-[12px] sm:text-[13px] text-zinc-500 line-clamp-1 mt-0.5">
          {description}
        </p>
      </div>
    </Link>
  );
}
