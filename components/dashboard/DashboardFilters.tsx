"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardSelectOption = { value: string; label: string };

export type DashboardFilterSelect = {
  id: string;
  label: string;
  value: string;
  options: DashboardSelectOption[];
  onChange: (value: string) => void;
};

function SelectField({ filter }: { filter: DashboardFilterSelect }) {
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
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
      </div>
    </label>
  );
}

type Props = {
  filters: DashboardFilterSelect[];
  sort?: DashboardFilterSelect;
  open?: boolean;
  className?: string;
};

export default function DashboardFilters({ filters, sort, open = true, className }: Props) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap",
        !open && "hidden lg:flex",
        className
      )}
    >
      {filters.map((filter) => (
        <SelectField key={filter.id} filter={filter} />
      ))}
      {sort && <SelectField filter={sort} />}
    </div>
  );
}

export { SelectField };
