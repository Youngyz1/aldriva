"use client";

import ProgressBar from "@/components/ui/ProgressBar";
import { formatCurrency, getProgressPercentage, type Campaign } from "@/lib/fund4good-data";
import { cn } from "@/lib/utils";
import { Calendar, Users, TrendingUp } from "lucide-react";

interface CampaignSummaryCardProps {
  campaign: Campaign;
  className?: string;
}

export function CampaignSummaryCard({ campaign, className }: CampaignSummaryCardProps) {
  const progress = getProgressPercentage(campaign.raised, campaign.goal);
  const remaining = campaign.goal - campaign.raised;

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-6",
        className
      )}
      aria-label={`Campaign summary: ${campaign.title}`}
    >
      {/* Raised / Goal */}
      <div className="space-y-1 mb-6">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
            {formatCurrency(campaign.raised, campaign.currency)}
          </span>
          <span className="text-lg text-slate-400 font-medium">
            of {formatCurrency(campaign.goal, campaign.currency)}
          </span>
        </div>
        <p className="text-sm text-slate-500">
          {formatCurrency(remaining, campaign.currency)} remaining to goal
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 mb-2">
          <span className="text-sm font-semibold text-slate-700">{progress}% funded</span>
          <span className="text-xs text-slate-400">Goal: {formatCurrency(campaign.goal, campaign.currency)}</span>
        </div>
        <ProgressBar percentage={progress} height={10} />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <Stat
          icon={<Calendar className="h-3.5 w-3.5 text-slate-400" />}
          label="Days Left"
          value={campaign.daysRemaining > 0 ? `${campaign.daysRemaining}` : "Ended"}
          valueClass={campaign.daysRemaining <= 7 && campaign.daysRemaining > 0 ? "text-amber-600" : "text-slate-900"}
        />
        <Stat
          icon={<Users className="h-3.5 w-3.5 text-slate-400" />}
          label="Donors"
          value={campaign.donorCount.toLocaleString()}
        />
        <Stat
          icon={<TrendingUp className="h-3.5 w-3.5 text-slate-400" />}
          label="Avg / Day"
          value={formatCurrency(campaign.averageDailyRaised, campaign.currency, true)}
          valueClass="text-brand-700"
        />
      </div>
    </div>
  );
}

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}

function Stat({ icon, label, value, valueClass }: StatProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-slate-400 font-medium">{label}</span>
      </div>
      <span className={cn("text-lg font-bold tabular-nums leading-none", valueClass ?? "text-slate-900")}>
        {value}
      </span>
    </div>
  );
}
