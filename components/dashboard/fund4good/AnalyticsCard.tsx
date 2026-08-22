"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { formatCurrency, type DailyDonation } from "@/lib/fund4good-data";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingUp, Eye, MousePointerClick, Share2 } from "lucide-react";
import { Skeleton } from "./Skeletons";
import { EmptyState } from "./EmptyState";
import type { ChartPoint } from "./MiniAreaChart";

const MiniAreaChart = dynamic(() => import("./MiniAreaChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-36 w-full" />,
});

type TabId = "donations" | "avg_gift" | "visitors" | "conversion" | "shares";

const TABS: Array<{ id: TabId; label: string; tracked: boolean }> = [
  { id: "donations", label: "Donations", tracked: true },
  { id: "avg_gift", label: "Average Gift", tracked: true },
  { id: "visitors", label: "Visitors", tracked: false },
  { id: "conversion", label: "Conversion", tracked: false },
  { id: "shares", label: "Shares", tracked: false },
];

interface AnalyticsCardProps {
  dailyDonations?: DailyDonation[];
  className?: string;
}

function computeWeekChange(points: ChartPoint[]): number | null {
  if (points.length < 8) return null;
  const lastWeek = points.slice(-7);
  const prevWeek = points.slice(-14, -7);
  const lastTotal = lastWeek.reduce((sum, d) => sum + d.value, 0);
  const prevTotal = prevWeek.reduce((sum, d) => sum + d.value, 0);
  if (prevTotal <= 0) return null;
  return Math.round(((lastTotal - prevTotal) / prevTotal) * 100);
}

export function AnalyticsCard({ dailyDonations = [], className }: AnalyticsCardProps) {
  const [tab, setTab] = useState<TabId>("donations");
  const hasData = dailyDonations.length > 0;

  const donationPoints: ChartPoint[] = useMemo(
    () => dailyDonations.map((d) => ({ date: d.date, value: d.amount })),
    [dailyDonations]
  );
  const avgGiftPoints: ChartPoint[] = useMemo(
    () => dailyDonations.map((d) => ({ date: d.date, value: d.count > 0 ? Math.round(d.amount / d.count) : 0 })),
    [dailyDonations]
  );

  const activePoints = tab === "avg_gift" ? avgGiftPoints : donationPoints;
  const weekChange = useMemo(() => computeWeekChange(activePoints), [activePoints]);
  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-slate-400" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Analytics</h2>
        </div>
        {activeTab.tracked && hasData && weekChange !== null && (
          <div className="flex items-center gap-1.5">
            <TrendingUp
              className={cn("h-3.5 w-3.5", weekChange >= 0 ? "text-brand-600" : "text-red-500")}
              aria-hidden
            />
            <span className={cn("text-xs font-semibold", weekChange >= 0 ? "text-brand-700" : "text-red-500")}>
              {weekChange >= 0 ? "+" : ""}
              {weekChange}% vs last week
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors",
              tab === t.id
                ? "border-b-2 border-brand-700 text-brand-700"
                : "border-b-2 border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {!activeTab.tracked ? (
          <EmptyState
            icon={tab === "visitors" ? Eye : tab === "conversion" ? MousePointerClick : Share2}
            title={`${activeTab.label} isn't tracked yet`}
            description="We'll surface this chart as soon as this data is being collected."
          />
        ) : hasData ? (
          <MiniAreaChart
            data={activePoints}
            gradientId={`analytics-${tab}`}
            valueFormatter={(v) => formatCurrency(v, "USD")}
          />
        ) : (
          <EmptyState
            icon={BarChart3}
            title="Not enough history yet"
            description="Once donations start coming in, trends will show up here."
          />
        )}
      </div>
    </div>
  );
}
