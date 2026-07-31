"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

interface SmartFilterOption {
  value: string;
  label: string;
}

/** Behavioural discovery filters — each backed by real ranking logic in
 *  getFundraiserList (`smartFilter`). "all" is the default browse view. */
const SMART_FILTERS: SmartFilterOption[] = [
  { value: "all", label: "Browse all" },
  { value: "close-to-target", label: "Close to target" },
  { value: "just-launched", label: "Just launched" },
  { value: "needs-momentum", label: "Needs momentum" },
  { value: "trending", label: "Trending" },
];

interface ShowcaseControlsProps {
  basePath: string;
  /** Current smart-filter key; drives the dropdown selection. */
  activeFilter: string;
}

/**
 * Single smart-filter dropdown for the discovery header. Purely presentational
 * over the URL: it writes the `filter` param (cleared on "all") and resets
 * `page`, preserving every other param. The underlying queries are untouched.
 */
export default function ShowcaseControls({ basePath, activeFilter }: ShowcaseControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onFilterChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set("filter", value);
    else params.delete("filter");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <label className="relative block">
      <span className="sr-only">Filter campaigns</span>
      <select
        value={activeFilter}
        onChange={(e) => onFilterChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-zinc-200 bg-white py-2.5 pl-4 pr-9 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      >
        {SMART_FILTERS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
    </label>
  );
}
