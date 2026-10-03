"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BarChart3, Eye, MousePointerClick, Share2, TrendingUp } from "lucide-react";
import type { DailyDonation } from "@/lib/fundraiser-dashboard";

const MiniAreaChart = dynamic(() => import("./MiniAreaChart"), { ssr: false, loading: () => <div className="h-36 w-full animate-pulse rounded bg-zinc-100" /> });

type TabId = "donations" | "avg_gift" | "visitors" | "conversion" | "shares";
const TABS: Array<{ id: TabId; label: string; tracked: boolean }> = [
  { id: "donations", label: "Donations", tracked: true },
  { id: "avg_gift", label: "Average Gift", tracked: true },
  { id: "visitors", label: "Visitors", tracked: false },
  { id: "conversion", label: "Conversion", tracked: false },
  { id: "shares", label: "Shares", tracked: false },
];

function computeWeekChange(points: { date: string; value: number }[]): number | null {
  if (points.length < 8) return null;
  const lastWeek = points.slice(-7);
  const prevWeek = points.slice(-14, -7);
  const lastTotal = lastWeek.reduce((s, d) => s + d.value, 0);
  const prevTotal = prevWeek.reduce((s, d) => s + d.value, 0);
  if (prevTotal <= 0) return null;
  return Math.round(((lastTotal - prevTotal) / prevTotal) * 100);
}

export default function FundraiserAnalytics({ dailyDonations }: { dailyDonations: DailyDonation[] }) {
  const [tab, setTab] = useState<TabId>("donations");
  const hasData = dailyDonations.length > 0;
  const donationPoints = useMemo(() => dailyDonations.map((d) => ({ date: d.date, value: d.amount })), [dailyDonations]);
  const avgGiftPoints = useMemo(() => dailyDonations.map((d) => ({ date: d.date, value: d.count > 0 ? Math.round(d.amount / d.count) : 0 })), [dailyDonations]);
  const activePoints = tab === "avg_gift" ? avgGiftPoints : donationPoints;
  const weekChange = useMemo(() => computeWeekChange(activePoints), [activePoints]);
  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-900">Analytics</h2>
        </div>
        {activeTab.tracked && hasData && weekChange !== null && (
          <div className="flex items-center gap-1.5">
            <TrendingUp className={weekChange >= 0 ? "h-3.5 w-3.5 text-brand-700" : "h-3.5 w-3.5 text-red-500"} />
            <span className={weekChange >= 0 ? "text-xs font-semibold text-brand-700" : "text-xs font-semibold text-red-500"}>
              {weekChange >= 0 ? "+" : ""}
              {weekChange}% vs last week
            </span>
          </div>
        )}
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-100 px-3 pt-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? "shrink-0 whitespace-nowrap rounded-t-lg border-b-2 border-brand-700 px-3 py-2 text-xs font-semibold text-brand-700" : "shrink-0 whitespace-nowrap rounded-t-lg border-b-2 border-transparent px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-600"}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-5">
        {!activeTab.tracked ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            {tab === "visitors" ? <Eye className="h-8 w-8 text-zinc-300" /> : tab === "conversion" ? <MousePointerClick className="h-8 w-8 text-zinc-300" /> : <Share2 className="h-8 w-8 text-zinc-300" />}
            <p className="text-sm font-semibold text-zinc-900">{activeTab.label} isn&apos;t tracked yet</p>
            <p className="max-w-xs text-xs text-zinc-500">We&apos;ll surface this chart as soon as this data is being collected.</p>
          </div>
        ) : hasData ? (
          <MiniAreaChart data={activePoints} gradientId={`analytics-${tab}`} valueFormatter={(v) => `$${v.toLocaleString()}`} />
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <BarChart3 className="h-8 w-8 text-zinc-300" />
            <p className="text-sm font-semibold text-zinc-900">Not enough history yet</p>
            <p className="text-xs text-zinc-500">Once donations start coming in, trends will show up here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
