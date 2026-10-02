"use client";

/**
 * components/admin/table/TableToolbar.tsx
 * One-row toolbar for admin tables: tabs, search, a single Filters button
 * (panel holding every filter group), sort, export. When rows are selected
 * the bar is replaced by an "N selected · actions" strip. On small screens
 * the stats become scrollable chips and export moves into a ⋯ menu.
 */

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Download, Filter, MoreHorizontal, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tableStrings as s } from "./strings";

export type ToolbarFilterOption = { value: string; label: string };

export type ToolbarFilter = {
  id: string;
  label: string;
  value: string;
  options: ToolbarFilterOption[];
  onChange: (value: string) => void;
};

export type ToolbarTab = {
  value: string;
  label: string;
  count?: number;
  active: boolean;
  onSelect: () => void;
};

export type TableToolbarProps = {
  search: { value: string; placeholder: string; onChange: (v: string) => void };
  filters: ToolbarFilter[];
  sort?: { value: string; options: ToolbarFilterOption[]; onChange: (v: string) => void };
  onExport?: () => void;
  exporting?: boolean;
  tabs?: ToolbarTab[];
  /** When set, replaces the whole bar with the selection strip. */
  selection?: { count: number; actions: ReactNode } | null;
  stats?: { label: string; value: ReactNode }[];
  /** Mobile checkbox reveal ("Select" toggle shown on small screens). */
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
};

function FilterSelect({ filter }: { filter: ToolbarFilter }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
        {filter.label}
      </span>
      <div className="relative">
        <select
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          aria-label={filter.label}
          className="w-full appearance-none rounded-xl border border-zinc-200 bg-white py-2 pl-3 pr-8 text-xs font-bold text-zinc-800 outline-none focus:border-violet-500"
        >
          {filter.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
        />
      </div>
    </label>
  );
}

export default function TableToolbar({
  search,
  filters,
  sort,
  onExport,
  exporting = false,
  tabs,
  selection,
  stats,
  selectMode,
  onToggleSelectMode,
}: TableToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = filters.filter((f) => f.value !== "all").length;

  useEffect(() => {
    if (!filtersOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setFiltersOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [filtersOpen]);

  if (selection && selection.count > 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
        <span className="text-xs font-bold text-violet-800">
          {s.selectedCount(selection.count)}
        </span>
        {selection.actions}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stat strip: plain text on desktop, scrollable chips on mobile. */}
      {stats && stats.length > 0 && (
        <div className="hidden items-baseline gap-x-4 gap-y-1 text-xs sm:flex sm:flex-wrap">
          {stats.map((stat) => (
            <span key={stat.label} className="flex items-baseline gap-1.5">
              <span className="font-bold tabular-nums text-zinc-950">{stat.value}</span>
              <span className="font-semibold text-zinc-400">{stat.label}</span>
            </span>
          ))}
        </div>
      )}
      {stats && stats.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 sm:hidden">
          {stats.map((stat) => (
            <span
              key={stat.label}
              className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs"
            >
              <span className="font-bold tabular-nums text-zinc-950">{stat.value}</span>
              <span className="font-semibold text-zinc-400">{stat.label}</span>
            </span>
          ))}
        </div>
      )}

      {tabs && tabs.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={tab.active}
              onClick={tab.onSelect}
              className={cn(
                "shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition",
                tab.active
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 opacity-70">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Main row: search + Filters + Sort + Export (mobile: search above). */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-zinc-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-200"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold",
                filtersOpen || activeFilterCount > 0
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              <Filter aria-hidden="true" className="h-4 w-4" />
              {s.filters}
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {filtersOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setFiltersOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 z-50 mt-2 grid w-64 gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
                  {filters.map((filter) => (
                    <FilterSelect key={filter.id} filter={filter} />
                  ))}
                </div>
              </>
            )}
          </div>

          {sort && (
            <div className="relative">
              <select
                value={sort.value}
                onChange={(e) => sort.onChange(e.target.value)}
                aria-label={s.sort}
                className="appearance-none rounded-xl border border-zinc-200 bg-white py-2.5 pl-3 pr-8 text-xs font-bold text-zinc-700 outline-none focus:border-violet-500"
              >
                {sort.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
              />
            </div>
          )}

          {onExport && (
            <>
              <button
                type="button"
                onClick={onExport}
                disabled={exporting}
                className="hidden items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 sm:flex"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                {exporting ? s.exporting : s.export}
              </button>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger
                  aria-label={s.export}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 sm:hidden"
                >
                  <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={exporting}
                    onSelect={() => onExport()}
                    className="cursor-pointer text-xs font-bold text-zinc-700"
                  >
                    <Download aria-hidden="true" className="mr-2 h-4 w-4" />
                    {exporting ? s.exporting : s.export}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {onToggleSelectMode && (
            <button
              type="button"
              onClick={onToggleSelectMode}
              aria-pressed={!!selectMode}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-xs font-bold sm:hidden",
                selectMode
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-zinc-200 bg-white text-zinc-700"
              )}
            >
              {selectMode ? s.done : s.select}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
