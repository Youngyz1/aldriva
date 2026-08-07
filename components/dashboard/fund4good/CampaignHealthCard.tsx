"use client";

import { useState } from "react";
import Link from "next/link";
import { type Campaign, formatCurrency } from "@/lib/fund4good-data";
import { copyTextToClipboard } from "@/lib/clipboard";
import { getSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import { getStatusMeta } from "./campaign-status";
import FundraisingProgressRing from "@/components/ui/FundraisingProgressRing";
import { ArrowRight, Check } from "lucide-react";

interface CampaignHealthCardProps {
  campaign: Campaign;
  className?: string;
}

function formatProjectedFinish(campaign: Campaign): string {
  if (campaign.status === "completed") return "Goal reached";
  if (!campaign.projectedFinishDate) return "Not enough data yet";
  return new Date(campaign.projectedFinishDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CampaignHealthCard({ campaign, className }: CampaignHealthCardProps) {
  const status = getStatusMeta(campaign.status, campaign.healthScore);
  const action = campaign.recommendedAction;
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${getSiteUrl()}/fundraisers/${campaign.slug}`;
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const actionHref =
    action.type === "post_update"
      ? `/dashboard/fundraisers/${campaign.id}/updates`
      : action.type === "thank_donors"
      ? "/dashboard/donations"
      : undefined;
  const isBoost = action.type === "boost_campaign";

  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Campaign Health</h2>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            status.color
          )}
        >
          <span aria-hidden>{status.emoji}</span>
          {status.label}
        </span>
      </div>

      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        {/* Ring */}
        <div className="mx-auto shrink-0 sm:mx-0">
          <FundraisingProgressRing
            raised={campaign.raised}
            goal={campaign.goal}
            size={112}
            strokeWidth={9}
            showDetails
          />
        </div>

        {/* Pace stats */}
        <div className="grid flex-1 grid-cols-2 gap-4">
          <Metric label="Health Score" value={`${campaign.healthScore}/100`} />
          <Metric label="Projected Finish" value={formatProjectedFinish(campaign)} />
          <Metric
            label="Current Pace"
            value={`${formatCurrency(campaign.averageDailyRaised, campaign.currency, true)}/day`}
          />
          <Metric
            label="Required Pace"
            value={
              campaign.dailyPaceRequired
                ? `${formatCurrency(campaign.dailyPaceRequired, campaign.currency, true)}/day`
                : "—"
            }
          />
        </div>
      </div>

      {/* Recommended Action — primary CTA */}
      <div className="border-t border-slate-100 p-5">
        <div
          className={cn(
            "rounded-xl p-4",
            action.urgency === "high" && "bg-red-50",
            action.urgency === "medium" && "bg-amber-50",
            action.urgency === "low" && "bg-slate-50"
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Recommended Action
              </span>
              <h3 className="text-sm font-semibold leading-snug text-slate-900">
                {action.reason}
              </h3>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                action.urgency === "high" && "border-red-200 bg-white text-red-600",
                action.urgency === "medium" && "border-amber-200 bg-white text-amber-600",
                action.urgency === "low" && "border-slate-200 bg-white text-slate-500"
              )}
            >
              {action.urgency.charAt(0).toUpperCase() + action.urgency.slice(1)} priority
            </span>
          </div>
          {actionHref ? (
            <Link
              href={actionHref}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-150 hover:bg-brand-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
              aria-label={action.label}
            >
              {action.label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <button
              type="button"
              onClick={!isBoost ? handleShare : undefined}
              disabled={isBoost}
              title={isBoost ? "Paid promotion isn't available yet" : undefined}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-150 hover:bg-brand-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={copied ? "Link copied" : action.label}
            >
              {copied ? "Link copied" : action.label}
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className="truncate text-sm font-bold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
