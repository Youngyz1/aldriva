"use client";

import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import DashboardSearch from "./DashboardSearch";
import DashboardFilters, { type DashboardFilterSelect } from "./DashboardFilters";
import DashboardExportButton from "./DashboardExportButton";
import DashboardBulkActions from "./DashboardBulkActions";

export type DashboardTabOption = { value: string; label: string; count?: number };

type Props = {
  search: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  filters: DashboardFilterSelect[];
  sort?: DashboardFilterSelect;
  tabs?: DashboardTabOption[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  selectedCount?: number;
  bulkActions?: React.ReactNode;
  onExport?: () => void;
  exporting?: boolean;
  exportLabel?: string;
  filtersOpen?: boolean;
  onToggleFilters?: () => void;
  trailing?: React.ReactNode;
  showSearch?: boolean;
};

export default function DashboardToolbar({
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
  exportLabel,
  filtersOpen = true,
  onToggleFilters,
  trailing,
  showSearch = true,
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
              {tab.count !== undefined && <span className="ml-1.5 opacity-70">({tab.count})</span>}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        {showSearch && (
          <DashboardSearch
            value={search}
            placeholder={searchPlaceholder}
            onChange={onSearchChange}
          />
        )}

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

        <DashboardFilters filters={filters} sort={sort} open={filtersOpen} />
        {trailing}
        <DashboardExportButton onExport={onExport} exporting={exporting} label={exportLabel} />
      </div>

      {bulkActions && (
        <DashboardBulkActions selectedCount={selectedCount}>{bulkActions}</DashboardBulkActions>
      )}
    </div>
  );
}
