"use client";

/**
 * components/dashboard/overview/PeriodSelector.tsx
 *
 * Period selector matching docs/design/dashboard-overview/04-components.md §9.
 * Writes ?period= and optional ?from=&to= to URL params.
 *
 * Rendered through a portal straight into <body> with z-[60] — above the
 * global header (components/Navbar.tsx:109, `sticky top-0 z-50`), which
 * sits above every design-system sheet token (app/globals.css:128-132 top
 * out at --z-sheet: 40). The old inline, un-capped, bottom-anchored sheet
 * grew taller than the viewport and its top half rendered underneath that
 * header. On lg+ this renders as a popover anchored under the trigger
 * button instead of a bottom sheet, with its own max-height/scroll so it
 * is always fully visible without ever reaching under the header.
 */

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  IconCalendar as Calendar,
  IconChevronDown as ChevronDown,
  IconCheck as Check,
  IconX as X,
} from "@tabler/icons-react";
import {
  PERIOD_OPTIONS,
  resolvePeriodRange,
  validateCustomRange,
  formatPeriodRangeLabel,
  type PeriodKind,
} from "@/lib/dashboard/date-range";

export interface PeriodSelectorProps {
  currentPeriod: PeriodKind;
  timezone: string;
  from?: string;
  to?: string;
  className?: string;
}

const DESKTOP_BREAKPOINT_QUERY = "(min-width: 1024px)";
const POPOVER_WIDTH = 320;
const POPOVER_GAP = 8;
const VIEWPORT_MARGIN = 8;

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
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
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);
  const [selectedKind, setSelectedKind] = useState<PeriodKind>(currentPeriod);
  const [customFrom, setCustomFrom] = useState(initialFrom || "");
  const [customTo, setCustomTo] = useState(initialTo || "");
  const [customError, setCustomError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_BREAKPOINT_QUERY);
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const periodFromParams = searchParams.get("period") as PeriodKind | null;
    if (periodFromParams && periodFromParams !== selectedKind) {
      setSelectedKind(periodFromParams);
    }
  }, [selectedKind, searchParams]);

  const activeOption =
    PERIOD_OPTIONS.find((o) => o.kind === currentPeriod) || PERIOD_OPTIONS[0];

  // Recomputed client-side with the same pure resolver the server uses, so
  // the trigger button always shows the real applied range — never just
  // the kind name — and never silently disagrees with what the page
  // actually rendered for.
  const activeRange = resolvePeriodRange(currentPeriod, timezone, initialFrom, initialTo);
  const activeRangeLabel = formatPeriodRangeLabel(activeRange.from, activeRange.to, timezone);

  // Anchor the desktop popover under the trigger; recomputed on open and
  // kept in sync while open since the header above it is sticky.
  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setAnchorRect({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  // Escape and outside-click close the panel, on both the desktop popover
  // and the mobile sheet.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

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
    setCustomError(null);
    if (kind !== "custom") {
      applyPeriod(kind);
    }
  }

  function handleApplyCustom() {
    const result = validateCustomRange(customFrom, customTo);
    if (!result.valid) {
      setCustomError(result.error);
      return;
    }
    setCustomError(null);
    applyPeriod("custom", customFrom, customTo);
  }

  const panelInner = (
    <>
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
        <div>
          <h3 className="text-base font-bold text-zinc-900">Select period</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Times in {timezone}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close period selector"
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
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setCustomError(null);
                }}
                aria-invalid={customError ? "true" : undefined}
                className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-600 ${customError ? "border-red-300" : "border-zinc-200"}`}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                To
              </label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setCustomError(null);
                }}
                aria-invalid={customError ? "true" : undefined}
                className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-600 ${customError ? "border-red-300" : "border-zinc-200"}`}
              />
            </div>
          </div>
          {customError && (
            <p role="alert" className="text-xs font-semibold text-red-600">
              {customError}
            </p>
          )}
          <button
            type="button"
            onClick={handleApplyCustom}
            className="w-full min-h-[44px] rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-bold text-xs py-2.5 transition"
          >
            Apply Custom Range
          </button>
        </div>
      )}
    </>
  );

  // Desktop: dropdown popover anchored under the trigger, capped to fit
  // under the viewport bottom with its own scroll if content overflows.
  const desktopPopover = anchorRect ? (
    <div
      ref={panelRef}
      className="fixed z-[60] w-[320px] rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl overflow-y-auto"
      style={{
        top: anchorRect.bottom + POPOVER_GAP,
        left: Math.min(
          Math.max(VIEWPORT_MARGIN, anchorRect.left),
          window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN
        ),
        maxHeight: Math.max(240, window.innerHeight - anchorRect.bottom - POPOVER_GAP - VIEWPORT_MARGIN),
      }}
      role="dialog"
      aria-label="Select period"
    >
      {panelInner}
    </div>
  ) : null;

  // Mobile: bottom sheet, height-capped so it can never reach under the
  // sticky header regardless of content length.
  const mobileSheet = (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div
        className="fixed inset-0 bg-black/40 transition-opacity"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className="relative w-full max-w-lg rounded-t-2xl bg-white p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl animate-in slide-in-from-bottom duration-200 max-h-[calc(100vh-5rem)] overflow-y-auto"
        role="dialog"
        aria-label="Select period"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-200" />
        {panelInner}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`min-h-[44px] min-w-[44px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-800 hover:bg-zinc-50 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${className}`}
      >
        <Calendar className="h-3.5 w-3.5 text-zinc-500" />
        <span className="flex flex-col items-start leading-tight">
          <span>{activeOption.defaultLabel}</span>
          {currentPeriod !== "today" && (
            <span className="text-[10px] font-medium text-zinc-500">{activeRangeLabel}</span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
      </button>

      {mounted && open
        ? createPortal(isDesktop ? desktopPopover : mobileSheet, document.body)
        : null}
    </>
  );
}
