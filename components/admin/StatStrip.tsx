/**
 * components/admin/StatStrip.tsx
 * Shared admin stat strip: plain text figures (value + label, optional
 * state color) separated by 1px dividers — no cards, no shadows.
 * Desktop: one wrapping row. Mobile: one horizontally scrollable line of
 * chips with scroll-snap and no visible scrollbar. Renders nothing when
 * there are no items (e.g. stats still loading).
 */

import { cn } from "@/lib/utils";
import { pagePartStrings, type StatItem } from "./page-strings";

export type { StatItem };

export default function StatStrip({ items }: { items: StatItem[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <div
        aria-label={pagePartStrings.statsLabel}
        className="hidden items-baseline gap-y-2 divide-x divide-zinc-200 sm:flex sm:flex-wrap"
      >
        {items.map((item) => (
          <span
            key={item.label}
            className="flex items-baseline gap-1.5 px-4 first:pl-0"
          >
            <span
              className={cn(
                "font-bold tabular-nums text-zinc-950",
                item.accent
              )}
            >
              {item.value}
            </span>
            <span className="font-semibold text-zinc-400">{item.label}</span>
          </span>
        ))}
      </div>
      <div
        aria-label={pagePartStrings.statsLabel}
        className="flex snap-x gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <span
            key={item.label}
            className="flex shrink-0 snap-start items-baseline gap-1.5 whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs"
          >
            <span
              className={cn(
                "font-bold tabular-nums text-zinc-950",
                item.accent
              )}
            >
              {item.value}
            </span>
            <span className="font-semibold text-zinc-400">{item.label}</span>
          </span>
        ))}
      </div>
    </>
  );
}
