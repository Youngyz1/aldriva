"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";

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
  const initialQuery = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(initialQuery);

  // Keep input in sync when URL changes via back/forward
  useEffect(() => {
    setSearchInput(searchParams.get("q") ?? "");
  }, [searchParams]);

  const FILTER_TO_PATH: Record<string, string> = {
    all: "/fundraisers/browse-all",
    "just-launched": "/fundraisers/just-launched",
    "close-to-target": "/fundraisers/close-to-target",
    "needs-momentum": "/fundraisers/needs-momentum",
    trending: "/fundraisers/trending",
  };

  function onFilterChange(value: string) {
    const targetPath = FILTER_TO_PATH[value] ?? "/fundraisers";
    const isStandalone = basePath.startsWith("/fundraisers/") && basePath !== "/fundraisers";

    if (FILTER_TO_PATH[activeFilter] && FILTER_TO_PATH[value]) {
      if (basePath === "/fundraisers" && value === "all") {
        if (window.location.pathname === "/fundraisers") return;
        router.push("/fundraisers");
        return;
      }
      if (value === "all" && isStandalone) {
        if (window.location.pathname === "/fundraisers/browse-all") return;
        router.push("/fundraisers/browse-all");
        return;
      }
      if (targetPath === window.location.pathname) return;
      router.push(targetPath);
      return;
    }

    if (basePath === "/fundraisers" && FILTER_TO_PATH[value]) {
      router.push(FILTER_TO_PATH[value]);
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set("filter", value);
    else params.delete("filter");
    params.delete("page");
    const qs = params.toString();
    if (FILTER_TO_PATH[value]) {
      router.push(FILTER_TO_PATH[value]);
      return;
    }
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed) {
      const params = new URLSearchParams();
      params.set("q", trimmed);
      if (activeFilter && activeFilter !== "all") {
        params.set("filter", activeFilter);
      }
      router.push(`/fundraisers/search?${params.toString()}`);
    } else if (basePath.startsWith("/fundraisers/search")) {
      router.push("/fundraisers");
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <form onSubmit={handleSearchSubmit} className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search fundraisers..."
          aria-label="Search fundraisers"
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </form>
      <label className="relative block shrink-0 sm:w-56">
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
    </div>
  );
}
