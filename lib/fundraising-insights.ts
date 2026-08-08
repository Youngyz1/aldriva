// lib/fundraising-insights.ts
// Deterministic, data-driven insights for a single campaign. Every insight is
// computed directly from real campaign/donation fields — no AI, no fabricated
// numbers. If a condition's data isn't strong enough to support a claim, the
// insight is simply omitted rather than guessed at.

import { formatCurrency, type Campaign, type Donation } from "./fund4good-data";

export type InsightTone = "positive" | "neutral" | "warning";

export interface Insight {
  id: string;
  tone: InsightTone;
  text: string;
}

const DAY_MS = 86_400_000;
const STALE_UPDATE_DAYS = 7;
const MIN_DONATIONS_FOR_WEEKDAY_INSIGHT = 10;
const WEEKEND_GAP_THRESHOLD = 0.15; // weekend avg must be >=15% lower to be worth surfacing

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Compares weekday vs weekend average donation size from real timestamps. */
function buildWeekendInsight(donations: Donation[]): Insight | null {
  if (donations.length < MIN_DONATIONS_FOR_WEEKDAY_INSIGHT) return null;

  let weekdayTotal = 0;
  let weekdayCount = 0;
  let weekendTotal = 0;
  let weekendCount = 0;

  for (const d of donations) {
    const date = new Date(d.timestamp);
    if (isWeekend(date)) {
      weekendTotal += d.amount;
      weekendCount += 1;
    } else {
      weekdayTotal += d.amount;
      weekdayCount += 1;
    }
  }

  if (weekdayCount < 3 || weekendCount < 3) return null;

  const weekdayAvg = weekdayTotal / weekdayCount;
  const weekendAvg = weekendTotal / weekendCount;
  if (weekdayAvg <= 0) return null;

  const gap = (weekdayAvg - weekendAvg) / weekdayAvg;
  if (gap >= WEEKEND_GAP_THRESHOLD) {
    return {
      id: "weekend-lower",
      tone: "neutral",
      text: `Weekend donations tend to run lower for this campaign — weekday gifts average ${formatCurrency(
        weekdayAvg,
        "USD",
        true
      )} vs ${formatCurrency(weekendAvg, "USD", true)} on weekends.`,
    };
  }
  if (gap <= -WEEKEND_GAP_THRESHOLD) {
    return {
      id: "weekend-higher",
      tone: "positive",
      text: `Weekends are your strongest donation days — averaging ${formatCurrency(
        weekendAvg,
        "USD",
        true
      )} vs ${formatCurrency(weekdayAvg, "USD", true)} on weekdays.`,
    };
  }
  return null;
}

function buildPaceInsight(campaign: Campaign): Insight | null {
  if (campaign.status === "completed") return null;
  if (!campaign.dailyPaceRequired || campaign.dailyPaceRequired <= 0) return null;

  if (campaign.averageDailyRaised >= campaign.dailyPaceRequired) {
    return {
      id: "pace-ahead",
      tone: "positive",
      text: `You're averaging ${formatCurrency(campaign.averageDailyRaised, "USD", true)}/day, ahead of the ${formatCurrency(
        campaign.dailyPaceRequired,
        "USD",
        true
      )}/day pace needed to reach your goal.`,
    };
  }
  return {
    id: "pace-behind",
    tone: "warning",
    text: `You're averaging ${formatCurrency(campaign.averageDailyRaised, "USD", true)}/day. You need about ${formatCurrency(
      campaign.dailyPaceRequired,
      "USD",
      true
    )}/day to reach your goal.`,
  };
}

function buildStaleUpdateInsight(campaign: Campaign): Insight | null {
  if (campaign.status === "completed") return null;
  const lastUpdate = new Date(campaign.lastUpdateDate).getTime();
  if (!Number.isFinite(lastUpdate)) return null;
  const daysSince = Math.floor((Date.now() - lastUpdate) / DAY_MS);
  if (daysSince >= STALE_UPDATE_DAYS) {
    return {
      id: "stale-update",
      tone: "neutral",
      text:
        campaign.updateCount === 0
          ? "You haven't posted an update yet — campaigns with at least one update tend to build more donor trust."
          : `It's been ${daysSince} days since your last update. Posting one today may help re-engage donors.`,
    };
  }
  return null;
}

function buildTodayInsight(campaign: Campaign): Insight | null {
  if (campaign.todayCount === 0) return null;
  return {
    id: "today-activity",
    tone: "positive",
    text: `You've already raised ${formatCurrency(campaign.todayAmount, "USD", true)} today from ${campaign.todayCount} ${
      campaign.todayCount === 1 ? "donation" : "donations"
    }.`,
  };
}

function buildRemainingInsight(campaign: Campaign): Insight | null {
  if (campaign.status === "completed") return null;
  const remaining = campaign.goal - campaign.raised;
  if (remaining <= 0) return null;
  const pctFunded = campaign.goal > 0 ? Math.round((campaign.raised / campaign.goal) * 100) : 0;
  if (pctFunded < 90) return null; // only surface "so close" framing near the finish line
  return {
    id: "almost-there",
    tone: "positive",
    text: `You're ${pctFunded}% funded — just ${formatCurrency(remaining, "USD", true)} away from your goal.`,
  };
}

/**
 * Builds the ranked list of insights for a campaign. Returns at most 4,
 * ordered by relevance (pace/goal news first, behavioral patterns last).
 */
export function buildFundraisingInsights(campaign: Campaign, campaignDonations: Donation[]): Insight[] {
  const insights = [
    buildRemainingInsight(campaign),
    buildTodayInsight(campaign),
    buildPaceInsight(campaign),
    buildStaleUpdateInsight(campaign),
    buildWeekendInsight(campaignDonations),
  ].filter((insight): insight is Insight => insight !== null);

  return insights.slice(0, 4);
}
