"use client";

/**
 * components/dashboard/overview/EntityHeader.tsx
 *
 * Sticky 48px workspace header.
 * docs/design/dashboard-overview/04-components.md §1 and 01 §1.1.
 */

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconRotateClockwise as RotateCw,
  IconChevronDown as ChevronDown,
} from "@tabler/icons-react";
import { PeriodSelector } from "./PeriodSelector";
import type { PeriodKind } from "@/lib/dashboard/date-range";

export interface BusinessItem {
  id: string;
  name: string;
  type?: string;
}

export interface EntityHeaderProps {
  name: string;
  subtitle?: string;
  statusBadge?: string;
  currentPeriod: PeriodKind;
  timezone: string;
  from?: string;
  to?: string;
  businesses?: BusinessItem[];
  selectedBusinessId?: string;
  onBusinessSelect?: (id: string) => void;
  className?: string;
}

export function EntityHeader({
  name,
  subtitle,
  statusBadge,
  currentPeriod,
  timezone,
  from,
  to,
  businesses = [],
  selectedBusinessId,
  onBusinessSelect,
  className = "",
}: EntityHeaderProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  function handleManualRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div
      className={`sticky top-14 sm:top-16 z-[var(--z-sticky)] min-h-[48px] bg-white/95 backdrop-blur-xs border-b border-zinc-200/80 px-4 flex items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-bold text-zinc-950 truncate max-w-[180px] sm:max-w-xs">
              {name}
            </h1>
            {statusBadge && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 shrink-0">
                {statusBadge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] font-medium text-zinc-400 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <PeriodSelector
          currentPeriod={currentPeriod}
          timezone={timezone}
          from={from}
          to={to}
        />

        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          aria-label="Refresh overview"
          className="h-10 w-10 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition active:scale-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          title="Refresh overview"
        >
          <RotateCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin text-brand-700" : ""}`}
          />
        </button>
      </div>
    </div>
  );
}
