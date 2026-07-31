"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { CAMPAIGN_CATEGORIES } from "@/lib/categories";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "raised", label: "Most Raised" },
  { value: "goal", label: "Highest Goal" },
] as const;

type FundraisersFilterSidebarProps = {
  activeCategories?: string[];
  activeSort?: string;
  resultCount?: number;
  showCategoryFilter?: boolean;
};

export default function FundraisersFilterSidebar({
  activeCategories = [],
  activeSort = "newest",
  resultCount,
  showCategoryFilter = true,
}: FundraisersFilterSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [catExpanded, setCatExpanded] = useState(true);

  function buildHref(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    params.delete("page");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function buildCategoryHref(cat: string) {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.get("categories")?.split(",").filter(Boolean) ?? [];
    const isActive = current.includes(cat);
    const next = isActive ? current.filter((c) => c !== cat) : [...current, cat];
    if (next.length === 0) params.delete("categories");
    else params.set("categories", next.join(","));
    params.delete("page");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <aside className="space-y-6">
      {resultCount !== undefined && (
        <p className="text-sm font-bold text-zinc-500">
          {resultCount} {resultCount === 1 ? "campaign" : "campaigns"}
        </p>
      )}

      {/* Category Filter */}
      {showCategoryFilter && (
      <div>
        <button
          type="button"
          onClick={() => setCatExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-800 transition"
        >
          <span>Category</span>
          {catExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {catExpanded && (
          <div className="mt-3 space-y-1">
            <Link
              href={buildHref({ categories: null })}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm font-bold transition",
                activeCategories.length === 0
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-zinc-700 hover:bg-zinc-50"
              )}
            >
              All categories
            </Link>
            {CAMPAIGN_CATEGORIES.map((cat) => {
              const isActive = activeCategories.includes(cat);
              return (
                <Link
                  key={cat}
                  href={buildCategoryHref(cat)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition",
                    isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-zinc-700 hover:bg-zinc-50"
                  )}
                >
                  <span
                    className={cn(
                      "h-3 w-3 rounded-sm border-2 flex-shrink-0",
                      isActive
                        ? "border-emerald-600 bg-emerald-600"
                        : "border-zinc-300"
                    )}
                  />
                  {cat}
                </Link>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Sort Filter */}
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500">Sort by</h2>
        <div className="mt-3 space-y-1">
          {SORT_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={buildHref({ sort: opt.value === "newest" ? null : opt.value })}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm font-bold transition",
                activeSort === opt.value
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-zinc-700 hover:bg-zinc-50"
              )}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
