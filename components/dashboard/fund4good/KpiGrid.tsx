"use client";

import { memo, useMemo } from "react";
import { type Campaign, type DailyDonation, formatCurrency } from "@/lib/fund4good-data";
import { cn } from "@/lib/utils";
import { StatCard } from "./StatCard";
import {
  Wallet,
  Target,
  PiggyBank,
  Users,
  Receipt,
  Zap,
  Share2,
  MousePointerClick,
  Eye,
  Heart,
} from "lucide-react";

interface KpiGridProps {
  campaign: Campaign;
  dailyDonations?: DailyDonation[];
  className?: string;
}

function useRaisedTrend(dailyDonations: DailyDonation[] | undefined) {
  return useMemo(() => {
    if (!dailyDonations || dailyDonations.length < 8) return null;
    const lastWeek = dailyDonations.slice(-7);
    const prevWeek = dailyDonations.slice(-14, -7);
    const lastTotal = lastWeek.reduce((sum, d) => sum + d.amount, 0);
    const prevTotal = prevWeek.reduce((sum, d) => sum + d.amount, 0);
    if (prevTotal <= 0) return null;
    const change = Math.round(((lastTotal - prevTotal) / prevTotal) * 100);
    return {
      direction: (change >= 0 ? "up" : "down") as "up" | "down",
      value: `${change >= 0 ? "+" : ""}${change}%`,
      label: "vs prior week",
    };
  }, [dailyDonations]);
}

export const KpiGrid = memo(function KpiGrid({ campaign, dailyDonations, className }: KpiGridProps) {
  const remaining = Math.max(0, campaign.goal - campaign.raised);
  const raisedTrend = useRaisedTrend(dailyDonations);

  const todayTrend =
    campaign.todayCount > 0
      ? {
          direction: (campaign.todayAmount >= campaign.averageDailyRaised ? "up" : "down") as
            | "up"
            | "down",
          value:
            campaign.averageDailyRaised > 0
              ? `${Math.round((campaign.todayAmount / campaign.averageDailyRaised) * 100)}% of avg day`
              : "new activity",
        }
      : undefined;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Primary KPIs — what matters most at a glance */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Amount Raised"
          value={formatCurrency(campaign.raised, campaign.currency, true)}
          icon={Wallet}
          iconBg="bg-brand-50"
          iconColor="text-brand-700"
          trend={raisedTrend ?? undefined}
        />
        <StatCard
          label="Today's Donations"
          value={formatCurrency(campaign.todayAmount, campaign.currency, true)}
          subValue={`${campaign.todayCount} ${campaign.todayCount === 1 ? "gift" : "gifts"} today`}
          icon={Zap}
          iconBg="bg-brand-50"
          iconColor="text-brand-700"
          trend={todayTrend}
        />
        <StatCard
          label="Donors"
          value={campaign.donorCount.toLocaleString()}
          subValue="people who gave"
          icon={Users}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <StatCard
          label="Average Donation"
          value={formatCurrency(campaign.averageDonation, campaign.currency, true)}
          icon={Receipt}
          iconBg="bg-sky-50"
          iconColor="text-sky-600"
        />
      </div>

      {/* Secondary KPIs */}
      <div>
        <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          More stats
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Goal"
            value={formatCurrency(campaign.goal, campaign.currency, true)}
            icon={Target}
            iconBg="bg-indigo-50"
            iconColor="text-indigo-600"
          />
          <StatCard
            label="Remaining"
            value={formatCurrency(remaining, campaign.currency, true)}
            icon={PiggyBank}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
          <StatCard
            label="Followers"
            value={campaign.followerCount.toLocaleString()}
            subValue="following your org"
            icon={Heart}
            iconBg="bg-rose-50"
            iconColor="text-rose-500"
          />
          <StatCard label="Shares" icon={Share2} unavailable />
          <StatCard label="Conversion Rate" icon={MousePointerClick} unavailable />
          <StatCard label="Page Views" icon={Eye} unavailable />
        </div>
      </div>
    </div>
  );
});
