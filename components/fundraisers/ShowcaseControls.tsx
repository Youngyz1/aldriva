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

  // Every smart filter now has its own standalone route (mirroring
  // event-platform's /campaigns/[category] pattern). The dropdown should
  // feel like an in-page filter switcher — update the URL and re-render
  // results in place without leaving the shared page shell. "Browse all"
  // uses /fundraisers/browse-all (same shell as other filters) rather than
  // the marketing-heavy /fundraisers base page, so switching never feels
  // like leaving the Just Launched experience.
  const FILTER_TO_PATH: Record<string, string> = {
    all: "/fundraisers/browse-all",
    "just-launched": "/fundraisers/just-launched",
    "close-to-target": "/fundraisers/close-to-target",
    "needs-momentum": "/fundraisers/needs-momentum",
    trending: "/fundraisers/trending",
  };

  function onFilterChange(value: string) {
    const targetPath = FILTER_TO_PATH[value] ?? "/fundraisers";

    // Standalone filter routes share the same shell (breadcrumb + heading + grid).
    // Switching between them should feel like an in-page filter change — update
    // URL and re-render results in place without leaving the shared page shell.
    // "Browse all" from a standalone route goes to its own standalone
    // /browse-all (same shell) rather than the marketing-heavy /fundraisers base,
    // so the heading/breadcrumb update in place.
    const isStandalone = basePath.startsWith("/fundraisers/") && basePath !== "/fundraisers";

    if (FILTER_TO_PATH[activeFilter] && FILTER_TO_PATH[value]) {
      // From the marketing base, "Browse all" stays on the base page itself.
      if (basePath === "/fundraisers" && value === "all") {
        if (window.location.pathname === "/fundraisers") return;
        router.push("/fundraisers");
        return;
      }
      // For "all" from a standalone route, keep the same shell by going to
      // /fundraisers/browse-all instead of the marketing-heavy base.
      if (value === "all" && isStandalone) {
        if (window.location.pathname === "/fundraisers/browse-all") return;
        router.push("/fundraisers/browse-all");
        return;
      }
      if (targetPath === window.location.pathname) return;
      router.push(targetPath);
      return;
    }

    // From the marketing-heavy /fundraisers base, other filters go to their standalone routes.
    if (basePath === "/fundraisers" && FILTER_TO_PATH[value]) {
      // "all" already handled above, so this is for just-launched etc.
      router.push(FILTER_TO_PATH[value]);
      return;
    }

    // Fallback for any remaining query-param usage (e.g. direct /fundraisers?filter=... links)
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
