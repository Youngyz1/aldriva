import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  /** Required unless `unavailable` is set. */
  value?: string;
  subValue?: string;
  trend?: {
    direction: "up" | "down" | "flat";
    value: string;
    label?: string;
  };
  icon?: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  className?: string;
  /** When true, renders a muted "not tracked yet" state instead of `value`/`trend` — for metrics with no real data source (e.g. page views), never a fabricated number. */
  unavailable?: boolean;
  unavailableLabel?: string;
}

export function StatCard({
  label,
  value,
  subValue,
  trend,
  icon: Icon,
  iconBg = "bg-slate-100",
  iconColor = "text-slate-500",
  className,
  unavailable = false,
  unavailableLabel = "Not tracked yet",
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-white p-5",
        unavailable ? "border-dashed border-zinc-200" : "border-zinc-200",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {Icon && (
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              unavailable ? "bg-slate-50" : iconBg
            )}
            aria-hidden
          >
            <Icon className={cn("h-4 w-4", unavailable ? "text-slate-300" : iconColor)} />
          </div>
        )}
      </div>

      {unavailable ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-lg font-semibold text-slate-300">—</span>
          <span className="text-xs text-slate-400">{unavailableLabel}</span>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
              {value}
            </span>
            {subValue && <span className="text-xs text-slate-400">{subValue}</span>}
          </div>

          {trend && (
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "text-xs font-semibold",
                  trend.direction === "up" && "text-brand-700",
                  trend.direction === "down" && "text-red-500",
                  trend.direction === "flat" && "text-slate-400"
                )}
              >
                {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}{" "}
                {trend.value}
              </span>
              {trend.label && <span className="text-xs text-slate-400">{trend.label}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
