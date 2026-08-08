// lib/fund4good-data.ts — Data definitions and mock fallbacks for Aldriva Dashboard on event-platform

import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";

export type CampaignStatus = "on_track" | "behind" | "ahead" | "completed" | "paused";
export type DonationTier = "bronze" | "silver" | "gold" | "platinum";
export type ActivityType =
  | "donation"
  | "update_posted"
  | "share"
  | "milestone"
  | "withdrawal"
  | "campaign_started"
  | "comment"
  | "follow";

export interface Campaign {
  id: string;
  title: string;
  description: string;
  category: string;
  status: CampaignStatus;
  raised: number;
  goal: number;
  currency: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  donorCount: number;
  shareCount: number;
  updateCount: number;
  coverImage?: string;
  slug: string;
  organizerId: string;
  lastUpdateDate: string;
  recommendedAction: RecommendedAction;
  healthMessage: string;
  dailyPaceRequired?: number;
  averageDailyRaised: number;
  averageDonation: number;
  todayAmount: number;
  todayCount: number;
  followerCount: number;
  commentCount: number;
  /** 0-100 composite score derived from actual pace vs. required pace. */
  healthScore: number;
  /** ISO date the campaign is projected to hit its goal, or null if not enough pace data yet. */
  projectedFinishDate: string | null;
  /** Metrics we don't have a real tracking source for yet — never fabricated, always undefined until wired up. */
  pageViews?: number;
  conversionRate?: number;
}

export interface RecommendedAction {
  type: "post_update" | "share_campaign" | "thank_donors" | "boost_campaign";
  label: string;
  reason: string;
  urgency: "high" | "medium" | "low";
}

export interface Donation {
  id: string;
  donorName: string;
  donorAvatar?: string;
  amount: number;
  currency: string;
  message?: string;
  timestamp: string;
  isAnonymous: boolean;
  tier: DonationTier;
  campaignId: string;
}

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  campaignId: string;
  metadata?: {
    donorName?: string;
    amount?: number;
    currency?: string;
    platform?: string;
    milestone?: string;
    updateTitle?: string;
    commentAuthor?: string;
    commentBody?: string;
  };
}

export interface TopDonor {
  id: string;
  name: string;
  totalGiven: number;
  currency: string;
  donationCount: number;
  lastDonation: string;
  tier: DonationTier;
  isAnonymous: boolean;
  avatar?: string;
}

export interface WithdrawalStatus {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "failed";
  requestedDate: string;
  completedDate?: string;
  bankLast4: string;
  campaignId: string;
}

export interface DailyDonation {
  date: string;
  amount: number;
  count: number;
}

export interface WeeklyDonation {
  week: string;
  amount: number;
  count: number;
}

export interface SourceBreakdown {
  source: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  type: "milestone" | "update" | "campaign_start" | "donation_spike";
  amount?: number;
  description: string;
  campaignId: string;
}

// ─── Default Campaigns ──────────────────────────────────────────────────────

export const campaigns: Campaign[] = [
  {
    id: "camp-001",
    title: "Rebuild the Maplewood Community Center",
    description:
      "After the 2025 flood, Maplewood's community center was devastated. We're raising funds to restore this vital gathering place for 4,200 residents.",
    category: "Community",
    status: "ahead",
    raised: 18450,
    goal: 25000,
    currency: "USD",
    startDate: "2026-07-01",
    endDate: "2026-08-14",
    daysRemaining: 14,
    donorCount: 247,
    shareCount: 1203,
    updateCount: 3,
    slug: "maplewood-community-center",
    organizerId: "org-001",
    lastUpdateDate: "2026-07-24",
    averageDailyRaised: 598,
    averageDonation: 75,
    todayAmount: 598,
    todayCount: 4,
    followerCount: 312,
    commentCount: 28,
    healthScore: 82,
    projectedFinishDate: "2026-08-10",
    dailyPaceRequired: 467,
    healthMessage: "You are ahead of pace. Keep the momentum going.",
    recommendedAction: {
      type: "post_update",
      label: "Post an Update",
      reason:
        "Donations slowed 38% after your last update on Jul 24. A fresh update typically restores momentum within 48 hours.",
      urgency: "high",
    },
  },
  {
    id: "camp-002",
    title: "Send Eastview Middle School to Science Nationals",
    description:
      "Our robotics team won regionals for the third year running. Help us get to nationals in Denver.",
    category: "Education",
    status: "behind",
    raised: 4200,
    goal: 12000,
    currency: "USD",
    startDate: "2026-07-10",
    endDate: "2026-08-20",
    daysRemaining: 20,
    donorCount: 61,
    shareCount: 389,
    updateCount: 1,
    slug: "eastview-robotics-nationals",
    organizerId: "org-001",
    lastUpdateDate: "2026-07-15",
    averageDailyRaised: 190,
    averageDonation: 69,
    todayAmount: 0,
    todayCount: 0,
    followerCount: 84,
    commentCount: 9,
    healthScore: 32,
    projectedFinishDate: "2026-09-30",
    dailyPaceRequired: 390,
    healthMessage: "You need approximately $390/day to reach your goal.",
    recommendedAction: {
      type: "share_campaign",
      label: "Share Campaign",
      reason:
        "Organic reach has plateaued. Sharing on social media could unlock 3–5× more visibility.",
      urgency: "medium",
    },
  },
  {
    id: "camp-003",
    title: "Emergency Medical Fund for Rivera Family",
    description:
      "Maria Rivera was diagnosed with a rare autoimmune condition. Help cover treatment costs not covered by insurance.",
    category: "Medical",
    status: "completed",
    raised: 30000,
    goal: 30000,
    currency: "USD",
    startDate: "2026-06-01",
    endDate: "2026-07-15",
    daysRemaining: 0,
    donorCount: 512,
    shareCount: 4201,
    updateCount: 7,
    slug: "rivera-family-medical",
    organizerId: "org-001",
    lastUpdateDate: "2026-07-14",
    averageDailyRaised: 666,
    averageDonation: 59,
    todayAmount: 0,
    todayCount: 0,
    followerCount: 640,
    commentCount: 61,
    healthScore: 100,
    projectedFinishDate: null,
    healthMessage: "Goal reached! Campaign completed successfully.",
    recommendedAction: {
      type: "thank_donors",
      label: "Thank Donors",
      reason: "You haven't thanked donors since reaching the goal. A personal message builds trust.",
      urgency: "low",
    },
  },
];

export const activeCampaign = campaigns[0];

// ─── Recent Donations ─────────────────────────────────────────────────────────

export const recentDonations: Donation[] = [
  {
    id: "don-001",
    donorName: "Sarah Mitchell",
    amount: 250,
    currency: "USD",
    message: "So proud of this community. Keep going! 💪",
    timestamp: "2026-07-31T21:44:00Z",
    isAnonymous: false,
    tier: "silver",
    campaignId: "camp-001",
  },
  {
    id: "don-002",
    donorName: "Anonymous",
    amount: 100,
    currency: "USD",
    timestamp: "2026-07-31T20:12:00Z",
    isAnonymous: true,
    tier: "bronze",
    campaignId: "camp-001",
  },
  {
    id: "don-003",
    donorName: "James & Linda Thornton",
    amount: 500,
    currency: "USD",
    message: "Our family grew up with this center. It means everything to us.",
    timestamp: "2026-07-31T18:03:00Z",
    isAnonymous: false,
    tier: "gold",
    campaignId: "camp-001",
  },
  {
    id: "don-004",
    donorName: "David Park",
    amount: 75,
    currency: "USD",
    timestamp: "2026-07-31T15:30:00Z",
    isAnonymous: false,
    tier: "bronze",
    campaignId: "camp-001",
  },
  {
    id: "don-005",
    donorName: "Priya Nair",
    amount: 150,
    currency: "USD",
    message: "Wishing you all the best!",
    timestamp: "2026-07-31T13:22:00Z",
    isAnonymous: false,
    tier: "bronze",
    campaignId: "camp-001",
  },
  {
    id: "don-006",
    donorName: "Marcus Webb",
    amount: 1000,
    currency: "USD",
    message: "Let's make this happen.",
    timestamp: "2026-07-30T22:15:00Z",
    isAnonymous: false,
    tier: "platinum",
    campaignId: "camp-001",
  },
  {
    id: "don-007",
    donorName: "Anonymous",
    amount: 50,
    currency: "USD",
    timestamp: "2026-07-30T19:44:00Z",
    isAnonymous: true,
    tier: "bronze",
    campaignId: "camp-001",
  },
];

// ─── Activity Feed ────────────────────────────────────────────────────────────

export const recentActivity: Activity[] = [
  {
    id: "act-001",
    type: "donation",
    title: "New donation received",
    description: "Sarah Mitchell donated $250",
    timestamp: "2026-07-31T21:44:00Z",
    campaignId: "camp-001",
    metadata: { donorName: "Sarah Mitchell", amount: 250, currency: "USD" },
  },
  {
    id: "act-002",
    type: "milestone",
    title: "Milestone reached",
    description: "Campaign surpassed 75% of goal — $18,750 raised",
    timestamp: "2026-07-31T18:03:00Z",
    campaignId: "camp-001",
    metadata: { milestone: "75%" },
  },
  {
    id: "act-003",
    type: "share",
    title: "Campaign shared",
    description: "Your campaign was shared on Facebook 12 times today",
    timestamp: "2026-07-31T16:00:00Z",
    campaignId: "camp-001",
    metadata: { platform: "Facebook" },
  },
  {
    id: "act-004",
    type: "donation",
    title: "New donation received",
    description: "James & Linda Thornton donated $500",
    timestamp: "2026-07-31T18:03:00Z",
    campaignId: "camp-001",
    metadata: { donorName: "James & Linda Thornton", amount: 500, currency: "USD" },
  },
  {
    id: "act-005",
    type: "update_posted",
    title: "Update posted",
    description: "\"Week 3 Progress Report\" was published",
    timestamp: "2026-07-24T10:00:00Z",
    campaignId: "camp-001",
    metadata: { updateTitle: "Week 3 Progress Report" },
  },
  {
    id: "act-006",
    type: "withdrawal",
    title: "Withdrawal processed",
    description: "$5,000 transferred to your bank account (••••3821)",
    timestamp: "2026-07-22T14:30:00Z",
    campaignId: "camp-001",
    metadata: { amount: 5000, currency: "USD" },
  },
  {
    id: "act-007",
    type: "milestone",
    title: "Milestone reached",
    description: "Reached 50% of goal — $12,500 raised",
    timestamp: "2026-07-18T09:15:00Z",
    campaignId: "camp-001",
    metadata: { milestone: "50%" },
  },
];

// ─── Top Donors ───────────────────────────────────────────────────────────────

export const topDonors: TopDonor[] = [
  {
    id: "td-001",
    name: "Marcus Webb",
    totalGiven: 1500,
    currency: "USD",
    donationCount: 2,
    lastDonation: "2026-07-30T22:15:00Z",
    tier: "platinum",
    isAnonymous: false,
  },
  {
    id: "td-002",
    name: "James & Linda Thornton",
    totalGiven: 750,
    currency: "USD",
    donationCount: 2,
    lastDonation: "2026-07-31T18:03:00Z",
    tier: "gold",
    isAnonymous: false,
  },
  {
    id: "td-003",
    name: "Sarah Mitchell",
    totalGiven: 500,
    currency: "USD",
    donationCount: 2,
    lastDonation: "2026-07-31T21:44:00Z",
    tier: "gold",
    isAnonymous: false,
  },
  {
    id: "td-004",
    name: "Anonymous",
    totalGiven: 350,
    currency: "USD",
    donationCount: 4,
    lastDonation: "2026-07-30T19:44:00Z",
    tier: "silver",
    isAnonymous: true,
  },
  {
    id: "td-005",
    name: "Priya Nair",
    totalGiven: 300,
    currency: "USD",
    donationCount: 2,
    lastDonation: "2026-07-31T13:22:00Z",
    tier: "silver",
    isAnonymous: false,
  },
];

// ─── Analytics Data ───────────────────────────────────────────────────────────

export const dailyDonations: DailyDonation[] = [
  { date: "Jul 1", amount: 420, count: 6 },
  { date: "Jul 3", amount: 680, count: 9 },
  { date: "Jul 5", amount: 340, count: 5 },
  { date: "Jul 7", amount: 890, count: 12 },
  { date: "Jul 9", amount: 1200, count: 15 },
  { date: "Jul 11", amount: 760, count: 10 },
  { date: "Jul 13", amount: 540, count: 7 },
  { date: "Jul 15", amount: 980, count: 13 },
  { date: "Jul 17", amount: 1450, count: 18 },
  { date: "Jul 19", amount: 890, count: 11 },
  { date: "Jul 21", amount: 1100, count: 14 },
  { date: "Jul 22", amount: 2400, count: 28 },
  { date: "Jul 24", amount: 1600, count: 20 },
  { date: "Jul 26", amount: 620, count: 8 },
  { date: "Jul 28", amount: 580, count: 7 },
  { date: "Jul 30", amount: 1200, count: 16 },
  { date: "Jul 31", amount: 750, count: 10 },
];

export const sourceBreakdown: SourceBreakdown[] = [
  { source: "Direct link", amount: 8280, percentage: 44.9, color: "#6366f1" },
  { source: "Facebook", amount: 4612, percentage: 25.0, color: "#3b82f6" },
  { source: "Email", amount: 2768, percentage: 15.0, color: "#10b981" },
  { source: "Twitter / X", amount: 1476, percentage: 8.0, color: "#f59e0b" },
  { source: "Other", amount: 1314, percentage: 7.1, color: "#94a3b8" },
];

// ─── Timeline Events ──────────────────────────────────────────────────────────

export const timelineEvents: TimelineEvent[] = [
  {
    id: "tl-001",
    date: "2026-07-01",
    title: "Campaign Launched",
    type: "campaign_start",
    description: "Aldriva campaign went live.",
    campaignId: "camp-001",
  },
  {
    id: "tl-002",
    date: "2026-07-09",
    title: "First $5,000 Reached",
    type: "milestone",
    amount: 5000,
    description: "Hit the first milestone — $5,000 raised in 8 days.",
    campaignId: "camp-001",
  },
  {
    id: "tl-003",
    date: "2026-07-15",
    title: "Update: Construction Begins",
    type: "update",
    description: "Posted first progress update with construction photos.",
    campaignId: "camp-001",
  },
  {
    id: "tl-004",
    date: "2026-07-17",
    title: "Donation Surge",
    type: "donation_spike",
    amount: 1450,
    description: "Highest single-day total so far following media mention.",
    campaignId: "camp-001",
  },
  {
    id: "tl-005",
    date: "2026-07-18",
    title: "50% Goal Reached",
    type: "milestone",
    amount: 12500,
    description: "Halfway milestone — $12,500 raised.",
    campaignId: "camp-001",
  },
  {
    id: "tl-006",
    date: "2026-07-22",
    title: "First Withdrawal",
    type: "update",
    description: "$5,000 withdrawn to begin paying contractors.",
    campaignId: "camp-001",
  },
  {
    id: "tl-007",
    date: "2026-07-24",
    title: "Update: Week 3 Report",
    type: "update",
    description: "Week 3 progress report published. Walls are up!",
    campaignId: "camp-001",
  },
  {
    id: "tl-008",
    date: "2026-07-31",
    title: "75% Goal Reached",
    type: "milestone",
    amount: 18750,
    description: "$18,750 raised — 75% of goal with 14 days remaining.",
    campaignId: "camp-001",
  },
];

// ─── Withdrawal Status ────────────────────────────────────────────────────────

export const withdrawals: WithdrawalStatus[] = [
  {
    id: "wd-001",
    amount: 5000,
    currency: "USD",
    status: "completed",
    requestedDate: "2026-07-21T10:00:00Z",
    completedDate: "2026-07-22T14:30:00Z",
    bankLast4: "3821",
    campaignId: "camp-001",
  },
  {
    id: "wd-002",
    amount: 8000,
    currency: "USD",
    status: "processing",
    requestedDate: "2026-07-30T09:00:00Z",
    bankLast4: "3821",
    campaignId: "camp-001",
  },
];

// ─── Helper Functions ─────────────────────────────────────────────────────────

export function formatCurrency(
  amount: number,
  currency = "USD",
  compact = false
): string {
  if (compact && amount >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getProgressPercentage(raised: number, goal: number): number {
  return calculateFundraisingPercentage(raised, goal);
}

export function getTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Aggregates a donation list into per-day totals — used to rebuild the analytics chart client-side whenever the selected campaign changes, since server-fetched daily totals span every campaign a fundraiser owns. */
export function buildDailyDonations(donations: Donation[]): DailyDonation[] {
  const totals = new Map<string, { amount: number; count: number }>();
  for (const d of donations) {
    const dateKey = new Date(d.timestamp).toISOString().slice(0, 10);
    const prev = totals.get(dateKey) ?? { amount: 0, count: 0 };
    totals.set(dateKey, { amount: prev.amount + d.amount, count: prev.count + 1 });
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      amount: v.amount,
      count: v.count,
    }));
}

export function getDonorInitials(name: string): string {
  if (name === "Anonymous") return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export const tierColors: Record<DonationTier, string> = {
  bronze: "text-amber-600 bg-amber-50 border-amber-200",
  silver: "text-slate-500 bg-slate-100 border-slate-200",
  gold: "text-yellow-600 bg-yellow-50 border-yellow-200",
  platinum: "text-violet-600 bg-violet-50 border-violet-200",
};

export const tierLabels: Record<DonationTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};
