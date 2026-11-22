/**
 * components/dashboard/overview/StatCard.tsx
 *
 * KPI tile matching docs/design/dashboard-overview/04-components.md §2.
 * Height target: 88px. Tabular nums, multi-currency badge, delta display.
 */

import Link from "next/link";
import { formatMoney } from "@/lib/money";

export interface StatCardProps {
  label: string;
  value: number;
  format: "count" | "money" | "percent" | "duration";
  currency?: string;
  delta?: { value: number; direction: "up" | "down" | "flat" } | null;
  href?: string;
  hint?: string;
  loading?: boolean;
  currenciesExtra?: number;
}

export function StatCard({
  label,
  value,
  format,
  currency = "USD",
  delta,
  href,
  hint,
  loading = false,
  currenciesExtra = 0,
}: StatCardProps) {
  if (loading) {
    return (
      <div className="min-h-[88px] flex flex-col justify-between rounded-xl border border-zinc-200 p-4 bg-white animate-pulse">
        <div className="h-3 w-20 bg-zinc-200 rounded" />
        <div className="h-7 w-28 bg-zinc-200 rounded my-1" />
        <div className="h-3 w-16 bg-zinc-100 rounded" />
      </div>
    );
  }

  let formattedValue: string;
  switch (format) {
    case "money":
      formattedValue = formatMoney(Math.round(value), currency);
      break;
    case "percent":
      formattedValue = `${Math.round(value)}%`;
      break;
    case "duration":
      formattedValue = `${value}m`;
      break;
    case "count":
    default:
      formattedValue = value.toLocaleString();
      break;
  }

  const content = (
    <div className="min-h-[88px] flex flex-col justify-between rounded-xl border border-zinc-200 p-4 bg-white transition hover:bg-zinc-50/50">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 truncate">
          {label}
        </span>
        {currenciesExtra > 0 && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 shrink-0">
            +{currenciesExtra} curr
          </span>
        )}
      </div>

      <div className="my-0.5">
        <span className="text-2xl font-extrabold tracking-tight tabular-nums text-zinc-950">
          {formattedValue}
        </span>
      </div>

      <div className="flex items-center justify-between min-h-[16px] text-[12px] text-zinc-500">
        {delta ? (
          <span
            className={`font-semibold flex items-center gap-0.5 ${
              delta.direction === "up"
                ? "text-emerald-700"
                : delta.direction === "down"
                ? "text-red-700"
                : "text-zinc-600"
            }`}
          >
            <span>
              {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→"}
            </span>
            <span>{Math.abs(delta.value)}%</span>
          </span>
        ) : hint ? (
          <span className="text-[11px] text-zinc-500 truncate">{hint}</span>
        ) : (
          <span />
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 rounded-xl">
        {content}
      </Link>
    );
  }

  return content;
}
