"use client";

/**
 * Range + compare controls for the admin Overview. State lives in the URL
 * (?range=30d&compare=1) so the page is server-rendered and shareable.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { overviewStrings, type OverviewRange } from "./strings";

export default function RangeControls({
  range,
  compare,
}: {
  range: OverviewRange;
  compare: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        role="group"
        aria-label={overviewStrings.rangeLabel}
        className="flex items-center gap-1"
      >
        {overviewStrings.ranges.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={range === r.value}
            onClick={() => update({ range: r.value === "30d" ? null : r.value })}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-bold transition",
              range === r.value
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={compare}
        onClick={() => update({ compare: compare ? "0" : "1" })}
        className="flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-zinc-900"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
            compare ? "justify-end bg-zinc-900" : "justify-start bg-zinc-200"
          )}
        >
          <span className="h-4 w-4 rounded-full bg-white shadow-xs" />
        </span>
        {overviewStrings.compareLabel}
      </button>
    </div>
  );
}
