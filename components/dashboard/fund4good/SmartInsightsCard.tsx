"use client";

import { useMemo } from "react";
import { type Campaign, type Donation } from "@/lib/fund4good-data";
import { buildFundraisingInsights, type Insight } from "@/lib/fundraising-insights";
import { cn } from "@/lib/utils";
import { Lightbulb, TrendingUp, AlertTriangle, Info } from "lucide-react";
import { EmptyState } from "./EmptyState";

interface SmartInsightsCardProps {
  campaign: Campaign;
  campaignDonations: Donation[];
  className?: string;
}

const toneConfig: Record<Insight["tone"], { icon: typeof TrendingUp; iconColor: string; iconBg: string }> = {
  positive: { icon: TrendingUp, iconColor: "text-brand-700", iconBg: "bg-brand-50" },
  warning: { icon: AlertTriangle, iconColor: "text-amber-600", iconBg: "bg-amber-50" },
  neutral: { icon: Info, iconColor: "text-sky-600", iconBg: "bg-sky-50" },
};

export function SmartInsightsCard({ campaign, campaignDonations, className }: SmartInsightsCardProps) {
  const insights = useMemo(
    () => buildFundraisingInsights(campaign, campaignDonations),
    [campaign, campaignDonations]
  );

  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900">Fundraising Insights</h2>
      </div>

      {insights.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Not enough data yet"
          description="Insights will appear here as your campaign collects more donation history."
        />
      ) : (
        <ul className="flex flex-col gap-3 p-4" role="list" aria-label="Fundraising insights">
          {insights.map((insight) => {
            const tone = toneConfig[insight.tone];
            const Icon = tone.icon;
            return (
              <li key={insight.id} className="flex items-start gap-3 rounded-lg p-2">
                <div
                  className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", tone.iconBg)}
                  aria-hidden
                >
                  <Icon className={cn("h-3.5 w-3.5", tone.iconColor)} />
                </div>
                <p className="text-sm leading-relaxed text-slate-700">{insight.text}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
