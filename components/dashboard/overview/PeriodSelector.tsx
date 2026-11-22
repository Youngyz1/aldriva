"use client";

/**
 * components/dashboard/overview/PeriodSelector.tsx
 *
 * Period selector sheet matching docs/design/dashboard-overview/04-components.md §9.
 * Writes ?period= and optional ?from=&to= to URL params.
 */

import React, { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  IconCalendar as Calendar,
  IconChevronDown as ChevronDown,
  IconCheck as Check,
  IconX as X,
} from "@tabler/icons-react";
import { PERIOD_OPTIONS, type PeriodKind } from "@/lib/dashboard/date-range";

export interface PeriodSelectorProps {
  currentPeriod: PeriodKind;
  timezone: string;
  from?: string;
  to?: string;
  className?: string;
}

export function PeriodSelector({
  currentPeriod,
  timezone,
  from: initialFrom,
  to: initialTo,
  className = "",
}: PeriodSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [selectedKind, setSelectedKind] = useState<PeriodKind>(currentPeriod);
  const [customFrom, setCustomFrom] = useState(initialFrom || "");
  const [customTo, setCustomTo] = useState(initialTo || "");

  const activeOption =
    PERIOD_OPTIONS.find((o) => o.kind === currentPeriod) || PERIOD_OPTIONS[0];

  function applyPeriod(kind: PeriodKind, fromDate?: string, toDate?: string) {
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (kind === "today") {
      params.delete("period");
      params.delete("from");
      params.delete("to");
    } else {
      params.set("period", kind);
      if (kind === "custom" && fromDate && toDate) {
        params.set("from", fromDate);
        params.set("to", toDate);
      } else {
        params.delete("from");
        params.delete("to");
      }
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setOpen(false);
  }

  function handleSelect(kind: PeriodKind) {
    setSelectedKind(kind);
    if (kind !== "custom") {
      applyPeriod(kind);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`min-h-[44px] min-w-[44px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-800 hover:bg-zinc-50 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${className}`}
      >
        <Calendar className="h-3.5 w-3.5 text-zinc-500" />
        <span>{activeOption.defaultLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[var(--z-sheet-backdrop)] flex items-end justify-center">
          <div
            className="fixed inset-0 bg-black/40 transition-opacity"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-lg rounded-t-2xl bg-white p-5 z-[var(--z-sheet)] pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl animate-in slide-in-from-bottom duration-200">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-200" />
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Select period</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Times in {timezone}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="divide-y divide-zinc-100 mt-2">
              {PERIOD_OPTIONS.map((opt) => {
                const isSelected = selectedKind === opt.kind;
                return (
                  <button
                    key={opt.kind}
                    type="button"
                    onClick={() => handleSelect(opt.kind)}
                    className="w-full min-h-[48px] flex items-center justify-between py-3 px-2 text-left hover:bg-zinc-50 rounded-lg transition"
                  >
                    <span
                      className={`text-sm ${
                        isSelected ? "font-bold text-brand-700" : "font-medium text-zinc-800"
                      }`}
                    >
                      {opt.defaultLabel}
                    </span>
                    {isSelected && <Check className="h-4 w-4 text-brand-700 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {selectedKind === "custom" && (
              <div className="mt-4 pt-4 border-t border-zinc-100 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                      From
                    </label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full min-h-[44px] rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                      To
                    </label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full min-h-[44px] rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!customFrom || !customTo || customFrom > customTo}
                  onClick={() => applyPeriod("custom", customFrom, customTo)}
                  className="w-full min-h-[44px] rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-bold text-xs py-2.5 transition"
                >
                  Apply Custom Range
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
