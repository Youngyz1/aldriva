import { cn } from "@/lib/utils";

export interface StatCardItem {
  id: string;
  label: string;
  value: number | string;
  /** className applied to the value text, e.g. "text-emerald-600". */
  accent?: string;
  icon?: React.ReactNode;
}

function StatCard({ label, value, accent, icon }: StatCardItem) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm transition hover:border-zinc-300 sm:rounded-2xl sm:p-5">
      {icon && (
        <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-50 text-zinc-500">
          {icon}
        </div>
      )}
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 sm:text-xs">
        {label}
      </p>
      <p className={cn("mt-1.5 text-xl font-black text-zinc-950 sm:mt-2 sm:text-2xl", accent)}>
        {value}
      </p>
    </div>
  );
}

/** Responsive grid of StatCards — the generalized shape behind AdminStatsCards. */
function StatCardGrid({ items, className }: { items: StatCardItem[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {items.map((item) => (
        <StatCard key={item.id} {...item} />
      ))}
    </div>
  );
}

export { StatCard, StatCardGrid };
