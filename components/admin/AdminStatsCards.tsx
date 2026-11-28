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
      {items.map((item, index) => {
        const isOddLast = items.length % 2 === 1 && index === items.length - 1;
        return (
          <div
            key={item.label}
            className={cn(
              "rounded-xl border border-zinc-200/60 bg-white p-4 shadow-xs sm:rounded-2xl sm:p-5",
              isOddLast && "col-span-2 sm:col-span-1"
            )}
          >
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 sm:text-xs">
              {item.label}
            </p>
            <p className={cn("mt-1.5 text-xl font-black text-zinc-950 sm:mt-2 sm:text-2xl", item.accent)}>
              {item.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
