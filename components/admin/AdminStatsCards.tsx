"use client";

import { cn } from "@/lib/utils";

type StatItem = {
  label: string;
  value: number | string;
  accent?: string;
};

export default function AdminStatsCards({
  items,
  className,
}: {
  items: StatItem[];
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5"
        >
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 sm:text-xs">
            {item.label}
          </p>
          <p className={cn("mt-1.5 text-xl font-black text-zinc-950 sm:mt-2 sm:text-2xl", item.accent)}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
