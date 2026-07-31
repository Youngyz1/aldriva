"use client";

import { ChevronDown, Download, Filter, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

type FilterSelect = {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
};

type TabOption = { value: string; label: string; count?: number };

type Props = {
  search: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  filters: FilterSelect[];
  sort?: FilterSelect;
  tabs?: TabOption[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  selectedCount?: number;
  bulkActions?: React.ReactNode;
  onExport?: () => void;
  exporting?: boolean;
  filtersOpen?: boolean;
  onToggleFilters?: () => void;
};

function SelectField({ filter }: { filter: FilterSelect }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
        {filter.label}
      </span>
      <div className="relative">
        <select
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-zinc-200 bg-white py-2 pl-3 pr-8 text-xs font-bold text-zinc-800 outline-none focus:border-violet-500"
        >
          {filter.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
      </div>
    </label>
  );
}

export default function AdminManagementToolbar({
  search,
  searchPlaceholder,
  onSearchChange,
  filters,
  sort,
  tabs,
  activeTab,
  onTabChange,
  selectedCount = 0,
  bulkActions,
  onExport,
  exporting = false,
  filtersOpen = true,
  onToggleFilters,
}: Props) {
  return (
    <div className="sticky top-0 z-20 space-y-3 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5">
      {tabs && onTabChange && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onTabChange(tab.value)}
              className={cn(
                "shrink-0 rounded-xl px-3 py-2 text-xs font-black transition",
                activeTab === tab.value
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-zinc-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-200"
          />
        </div>

        {onToggleFilters && (
          <button
            type="button"
            onClick={onToggleFilters}
            className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-xs font-black text-zinc-700 lg:hidden"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
        )}

        <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap", !filtersOpen && "hidden lg:flex")}>
          {filters.map((filter) => (
            <SelectField key={filter.id} filter={filter} />
          ))}
          {sort && <SelectField filter={sort} />}
        </div>

        {onExport && (
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        )}
      </div>

      {selectedCount > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
          <span className="text-xs font-black text-violet-800">
            {selectedCount} selected
          </span>
          {bulkActions}
        </div>
      )}
    </div>
  );
}
