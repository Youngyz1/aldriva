"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

const CATEGORIES = [
  "Music",
  "Business",
  "Education",
  "Charity",
  "Medical",
  "Church",
  "Community",
  "Technology",
];

const SORT_OPTIONS = [
  { value: "date_asc", label: "Date (soonest)" },
  { value: "date_desc", label: "Date (latest)" },
  { value: "newest", label: "Recently added" },
] as const;

const SELECT_CLASS =
  "w-full appearance-none rounded-xl border border-zinc-200 bg-white py-2.5 pl-4 pr-9 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

type EventsFilterControlsProps = {
  activeCategory?: string;
  activeSort?: string;
};

/**
 * Compact Category + Sort dropdowns for the events results header — the pill
 * `<select>` treatment reused from Fundraisers' `ShowcaseControls`, in Events'
 * orange accent. Purely presentational over the URL: writes `category` / `sort`
 * (cleared on their defaults), resets `page`, and preserves every other param.
 * The "when" filter stays a pill in `EventsWhenToggle`.
 */
export default function EventsFilterControls({
  activeCategory,
  activeSort = "date_asc",
}: EventsFilterControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pushWith(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // Match the URL's category (case-insensitive) to a known option; anything
  // unknown or absent falls back to "All categories".
  const selectedCategory =
    CATEGORIES.find((c) => c.toLowerCase() === activeCategory?.toLowerCase()) ?? "";

  return (
    <div className="flex flex-row items-center gap-2 sm:w-auto">
      <label className="relative block flex-1 sm:w-44 sm:flex-none">
        <span className="sr-only">Filter by category</span>
        <select
          value={selectedCategory}
          onChange={(e) => pushWith({ category: e.target.value || null })}
          className={SELECT_CLASS}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      </label>

      <label className="relative block flex-1 sm:w-44 sm:flex-none">
        <span className="sr-only">Sort events</span>
        <select
          value={activeSort}
          onChange={(e) => pushWith({ sort: e.target.value === "date_asc" ? null : e.target.value })}
          className={SELECT_CLASS}
        >
          {SORT_OPTIONS.map((opt) => (
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
