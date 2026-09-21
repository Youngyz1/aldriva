// lib/fundraiser-dashboard.ts — single-fundraiser command-center calculations
// Adapted from event-platform/app/dashboard/page.tsx + lib/fund4good-data.ts + fundraising-insights
// Scope: ONE fundraiser only (fundraiser_id = current). No cross-fundraiser leakage.

import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";

const DAY_MS = 86_400_000;
const DEFAULT_DAYS_REMAINING = 30;

export type CampaignStatus = "on_track" | "behind" | "ahead" | "completed" | "paused";

export function getDaysRemaining(endDate: string | null): number {
  if (!endDate) return DEFAULT_DAYS_REMAINING;
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / DAY_MS));
}

export function inferStatus(raised: number, goal: number, endDate: string | null): CampaignStatus {
  const days = getDaysRemaining(endDate);
  if (days === 0 || (goal > 0 && raised >= goal)) return "completed";
  const progress = goal > 0 ? raised / goal : 0;
  const elapsed = 1 - days / 90;
  if (progress >= elapsed + 0.05) return "ahead";
  if (progress < elapsed - 0.1) return "behind";
  return "on_track";
}

export function computeHealthScore(status: CampaignStatus, dailyPaceRequired: number | undefined, averageDailyRaised: number): number {
  if (status === "completed") return 100;
  if (dailyPaceRequired === undefined || dailyPaceRequired <= 0) return 100;
  const paceRatio = averageDailyRaised / dailyPaceRequired;
  return Math.max(0, Math.min(100, Math.round(paceRatio * 65)));
}

export function computeProjectedFinishDate(raised: number, goal: number, averageDailyRaised: number): string | null {
  if (goal > 0 && raised >= goal) return null;
  if (averageDailyRaised <= 0) return null;
  const daysToGoal = Math.ceil((goal - raised) / averageDailyRaised);
  if (!Number.isFinite(daysToGoal) || daysToGoal < 0) return null;
  return new Date(Date.now() + daysToGoal * DAY_MS).toISOString();
}

export type RecommendedAction = {
  type: "post_update" | "share_campaign" | "thank_donors" | "boost_campaign";
  label: string;
  reason: string;
  urgency: "high" | "medium" | "low";
};

export function buildRecommendedAction(status: CampaignStatus): RecommendedAction {
  switch (status) {
    case "behind":
      return {
        type: "share_campaign",
        label: "Share Campaign",
        reason: "You're behind pace. Sharing on social media could unlock 3–5× more visibility.",
        urgency: "high",
      };
    case "completed":
      return {
        type: "thank_donors",
        label: "Thank Donors",
        reason: "Campaign complete — send a personal thank-you to your donors.",
        urgency: "low",
      };
    case "ahead":
      return {
        type: "post_update",
        label: "Post an Update",
        reason: "Keep momentum going with a fresh update — donations typically spike 48 h after each post.",
        urgency: "medium",
      };
    default:
      return { type: "boost_campaign", label: "Boost Campaign", reason: "Promote your campaign to reach new donors.", urgency: "low" };
  }
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

export function progressPct(raised: number, goal: number): number {
  return calculateFundraisingPercentage(raised, goal);
}

export function formatCurrency(amount: number, compact = true): string {
  if (compact && amount >= 1000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(amount);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

// Insights — adapted from fundraising-insights.ts, scoped to one campaign
export type InsightTone = "positive" | "neutral" | "warning";
export type Insight = { id: string; tone: InsightTone; text: string };

function buildPaceInsight(status: CampaignStatus, dailyPaceRequired: number | undefined, averageDailyRaised: number): Insight | null {
  if (status === "completed") return null;
  if (!dailyPaceRequired || dailyPaceRequired <= 0) return null;
  if (averageDailyRaised >= dailyPaceRequired) {
    return { id: "pace-ahead", tone: "positive", text: `You're averaging ${formatCurrency(averageDailyRaised)}/day, ahead of the ${formatCurrency(dailyPaceRequired)}/day pace needed to reach your goal.` };
  }
  return { id: "pace-behind", tone: "warning", text: `You're averaging ${formatCurrency(averageDailyRaised)}/day. You need about ${formatCurrency(dailyPaceRequired)}/day to reach your goal.` };
}

function buildStaleUpdateInsight(status: CampaignStatus, lastUpdateDate: string | null, updateCount: number): Insight | null {
  if (status === "completed") return null;
  if (!lastUpdateDate) {
    return updateCount === 0
      ? { id: "stale-update", tone: "neutral", text: "You haven't posted an update yet — campaigns with at least one update tend to build more donor trust." }
      : null;
  }
  const last = new Date(lastUpdateDate).getTime();
  if (!Number.isFinite(last)) return null;
  const daysSince = Math.floor((Date.now() - last) / DAY_MS);
  if (daysSince >= 7) {
    return { id: "stale-update", tone: "neutral", text: updateCount === 0 ? "You haven't posted an update yet — campaigns with at least one update tend to build more donor trust." : `It's been ${daysSince} days since your last update. Posting one today may help re-engage donors.` };
  }
  return null;
}

function buildTodayInsight(todayCount: number, todayAmount: number): Insight | null {
  if (todayCount === 0) return null;
  return { id: "today-activity", tone: "positive", text: `You've already raised ${formatCurrency(todayAmount)} today from ${todayCount} ${todayCount === 1 ? "donation" : "donations"}.` };
}

function buildRemainingInsight(status: CampaignStatus, raised: number, goal: number): Insight | null {
  if (status === "completed") return null;
  const remaining = goal - raised;
  if (remaining <= 0) return null;
  const pct = goal > 0 ? Math.round((raised / goal) * 100) : 0;
  if (pct < 90) return null;
  return { id: "almost-there", tone: "positive", text: `You're ${pct}% funded — just ${formatCurrency(remaining)} away from your goal.` };
}

export function buildFundraiserInsights(args: {
  status: CampaignStatus;
  raised: number;
  goal: number;
  dailyPaceRequired: number | undefined;
  averageDailyRaised: number;
  todayCount: number;
  todayAmount: number;
  lastUpdateDate: string | null;
  updateCount: number;
  donations: { amount: number; timestamp: string }[];
}): Insight[] {
  const list = [
    buildRemainingInsight(args.status, args.raised, args.goal),
    buildTodayInsight(args.todayCount, args.todayAmount),
    buildPaceInsight(args.status, args.dailyPaceRequired, args.averageDailyRaised),
    buildStaleUpdateInsight(args.status, args.lastUpdateDate, args.updateCount),
  ].filter((v): v is Insight => v !== null);
  return list.slice(0, 4);
}

export type DailyDonation = { date: string; amount: number; count: number };

export function buildDailyDonations(donations: { amount: number; timestamp: string }[]): DailyDonation[] {
  const totals = new Map<string, { amount: number; count: number }>();
  for (const d of donations) {
    const key = new Date(d.timestamp).toISOString().slice(0, 10);
    const prev = totals.get(key) ?? { amount: 0, count: 0 };
    totals.set(key, { amount: prev.amount + d.amount, count: prev.count + 1 });
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }), amount: v.amount, count: v.count }));
}
