// lib/fundraiser-dashboard.ts — single-fundraiser command-center calculations
// Adapted from event-platform/app/dashboard/page.tsx + lib/fund4good-data.ts + fundraising-insights
// Scope: ONE fundraiser only (fundraiser_id = current). No cross-fundraiser leakage.

import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";
import { formatMoney } from "@/lib/money";

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

/**
 * Legacy USD insight-string helper. Delegates to the shared formatMoney;
 * insight strings stay whole-dollar (trailing .00 stripped).
 */
export function formatCurrency(amount: number): string {
  return formatMoney(Math.round(amount), "USD").replace(/\.00$/, "");
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

/**
 * Week-over-week change of a daily series. Returns null when there is no
 * basis for comparison (fewer than 8 points, or an empty prior window) —
 * callers render NO badge in that case, never a red negative percentage.
 */
export function computeWeekChange(points: { date: string; value: number }[]): number | null {
  if (points.length < 8) return null;
  const lastWeek = points.slice(-7);
  const prevWeek = points.slice(-14, -7);
  const lastTotal = lastWeek.reduce((s, d) => s + d.value, 0);
  const prevTotal = prevWeek.reduce((s, d) => s + d.value, 0);
  if (prevTotal <= 0) return null;
  return Math.round(((lastTotal - prevTotal) / prevTotal) * 100);
}

/**
 * Statuses that count toward fundraiser totals. 'completed' (paid, incl. all
 * Stripe/RPC gifts) and 'succeeded' both count; pending/failed/refunded (and
 * null) never do — on every surface. Import this constant instead of
 * re-listing statuses per page.
 */
export const COUNTED_DONATION_STATUSES = ["completed", "succeeded"] as const;

export interface FundraiserDonationRow {
  id: string;
  donor_name?: string | null;
  donor_email?: string | null;
  user_id?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface CurrencyTotal {
  currency: string;
  total: number;
  count: number;
}

export interface StatsDonorRecord {
  key: string;
  displayName: string;
  isAnonymous: boolean;
  donationCount: number;
  /** Sum in the primary (largest-total) currency. */
  totalGiven: number;
  totalsPerCurrency: CurrencyTotal[];
  avgGift: number;
  firstDonation: string;
  lastDonation: string;
  isRepeat: boolean;
  donations: { id: string; amount: number; currency: string; status: string | null; created_at: string }[];
}

export interface CumulativeDayPoint {
  date: string;
  /** Cumulative primary-currency total through this day ("raised over time"). */
  amount: number;
  /** Primary-currency gifts given that day (for per-day averages). */
  dayAmount: number;
  count: number;
}

export interface FundraiserDonationStats {
  /** Counted rows only (completed/succeeded by default). Never a fallback. */
  rows: FundraiserDonationRow[];
  /** One entry per currency actually paid in, largest total first. Never merged. */
  totalsPerCurrency: CurrencyTotal[];
  primaryCurrency: string;
  donationCount: number;
  donorCount: number;
  averageDonation: number;
  todayAmount: number;
  todayCount: number;
  dailySeries: CumulativeDayPoint[];
  donorRecords: DonorRecord[];
}

type DonorRecord = StatsDonorRecord;

/**
 * ONE donor-grouping rule for every surface: logged-in giver by user_id,
 * else guest by normalized email, else by normalized name — except gifts
 * with no identity at all (missing/“Anonymous” name and no email), which
 * stay separate per row so strangers are never merged.
 */
export function donorGroupKey(d: FundraiserDonationRow): string {
  if (d.user_id) return `user:${d.user_id}`;
  const email = (d.donor_email ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = (d.donor_name ?? "").trim().toLowerCase();
  if (name && name !== "anonymous") return `named:${name}`;
  return `anon:${d.id}`;
}

function rowCurrency(d: FundraiserDonationRow): string {
  const code = typeof d.currency === "string" ? d.currency.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}

function dayKeyUtc(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Pure stats computer shared by the fundraiser overview, donations, donors,
 * and public pages. Only rows whose status is in `statuses` count;
 * everything else is ignored (no "fall back to all rows").
 */
export function computeFundraiserDonationStats(
  rows: FundraiserDonationRow[],
  opts: { statuses?: readonly string[]; now?: Date } = {}
): FundraiserDonationStats {
  const allowed = new Set(
    (opts.statuses ?? COUNTED_DONATION_STATUSES).map((s) => s.toLowerCase())
  );
  const now = opts.now ?? new Date();
  const counted = (rows ?? []).filter((d) =>
    typeof d.status === "string" ? allowed.has(d.status.toLowerCase()) : false
  );

  // Per-currency totals (never added across currencies).
  const byCurrency = new Map<string, { total: number; count: number }>();
  for (const d of counted) {
    const c = rowCurrency(d);
    const prev = byCurrency.get(c) ?? { total: 0, count: 0 };
    prev.total += Number(d.amount ?? 0);
    prev.count += 1;
    byCurrency.set(c, prev);
  }
  const totalsPerCurrency: CurrencyTotal[] = [...byCurrency.entries()]
    .map(([currency, v]) => ({ currency, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency));
  const primaryCurrency = totalsPerCurrency[0]?.currency ?? "USD";
  const primaryRows = counted.filter((d) => rowCurrency(d) === primaryCurrency);
  const primaryTotal = totalsPerCurrency[0]?.total ?? 0;

  // Donor records (counted rows only, one grouping rule).
  const donorMap = new Map<string, StatsDonorRecord>();
  for (const d of counted) {
    const key = donorGroupKey(d);
    const amount = Number(d.amount ?? 0);
    const currency = rowCurrency(d);
    const name = (d.donor_name ?? "").trim();
    const displayName = name || "Anonymous";
    const isAnonymous =
      !d.user_id && !(d.donor_email ?? "").trim() && (!name || name.toLowerCase() === "anonymous");
    const created = d.created_at ?? new Date().toISOString();
    const existing = donorMap.get(key);
    if (!existing) {
      donorMap.set(key, {
        key,
        displayName,
        isAnonymous,
        donationCount: 1,
        totalGiven: currency === primaryCurrency ? amount : 0,
        totalsPerCurrency: [{ currency, total: amount, count: 1 }],
        avgGift: currency === primaryCurrency ? amount : 0,
        firstDonation: created,
        lastDonation: created,
        isRepeat: false,
        donations: [{ id: d.id, amount, currency, status: d.status ?? null, created_at: created }],
      });
    } else {
      existing.donationCount += 1;
      if (currency === primaryCurrency) existing.totalGiven += amount;
      const slot = existing.totalsPerCurrency.find((t) => t.currency === currency);
      if (slot) {
        slot.total += amount;
        slot.count += 1;
      } else {
        existing.totalsPerCurrency.push({ currency, total: amount, count: 1 });
      }
      existing.donations.push({ id: d.id, amount, currency, status: d.status ?? null, created_at: created });
      if (created < existing.firstDonation) existing.firstDonation = created;
      if (created > existing.lastDonation) existing.lastDonation = created;
    }
  }
  const donorRecords = [...donorMap.values()];
  for (const rec of donorRecords) {
    const primaryCount = rec.donations.filter((x) => x.currency === primaryCurrency).length;
    rec.avgGift = primaryCount > 0 ? Math.round(rec.totalGiven / primaryCount) : 0;
    rec.isRepeat = rec.donationCount > 1;
    rec.donations.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // Today (primary currency only).
  const todayRows = primaryRows.filter((d) => {
    if (!d.created_at) return false;
    return isSameUtcDay(new Date(d.created_at), now);
  });
  const todayAmount = todayRows.reduce((s, d) => s + Number(d.amount ?? 0), 0);

  // Cumulative zero-padded daily series (primary currency): every UTC day
  // from the first counted gift through today carries the running total, so
  // "raised over time" never slopes downward between gifts.
  const perDay = new Map<string, { dayAmount: number; count: number }>();
  for (const d of primaryRows) {
    const key = dayKeyUtc(d.created_at);
    if (!key) continue;
    const prev = perDay.get(key) ?? { dayAmount: 0, count: 0 };
    prev.dayAmount += Number(d.amount ?? 0);
    prev.count += 1;
    perDay.set(key, prev);
  }
  const dailySeries: CumulativeDayPoint[] = [];
  const sortedDays = [...perDay.keys()].sort();
  if (sortedDays.length > 0) {
    const todayKey = now.toISOString().slice(0, 10);
    let cursor = sortedDays[0];
    let running = 0;
    while (cursor <= todayKey) {
      const cell = perDay.get(cursor);
      if (cell) running += cell.dayAmount;
      dailySeries.push({
        date: new Date(`${cursor}T00:00:00Z`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        amount: running,
        dayAmount: cell?.dayAmount ?? 0,
        count: cell?.count ?? 0,
      });
      const next = new Date(`${cursor}T00:00:00Z`).getTime() + DAY_MS;
      cursor = new Date(next).toISOString().slice(0, 10);
      if (dailySeries.length > 3700) break;
    }
  }

  const primaryCount = primaryRows.length;
  return {
    rows: counted,
    totalsPerCurrency,
    primaryCurrency,
    donationCount: counted.length,
    donorCount: donorRecords.length,
    averageDonation: primaryCount > 0 ? Math.round(primaryTotal / primaryCount) : 0,
    todayAmount,
    todayCount: todayRows.length,
    dailySeries,
    donorRecords,
  };
}

/** Minimal query surface so tests can inject a mock admin client. */
export interface DonationStatsClient {
  from: (table: string) => unknown;
}

/**
 * Fetches a fundraiser's donations and returns the shared stats. Never
 * throws: query failures yield empty stats (callers render their own empty
 * states).
 */
export async function getFundraiserDonationStats(
  admin: DonationStatsClient,
  fundraiserId: string,
  opts: { statuses?: readonly string[]; now?: Date; limit?: number } = {}
): Promise<FundraiserDonationStats> {
  const empty = computeFundraiserDonationStats([], opts);
  try {
    const query = (admin.from("donations") as {
      select: (cols: string) => unknown;
    });
    const builder = query.select(
      "id, donor_name, donor_email, user_id, amount, currency, status, created_at, fundraiser_id"
    ) as {
      eq: (col: string, val: string) => unknown;
    };
    const ordered = (builder.eq("fundraiser_id", fundraiserId) as {
      order: (col: string, o: { ascending: boolean }) => unknown;
    }).order("created_at", { ascending: false }) as {
      limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
    };
    const { data, error } = await ordered.limit(opts.limit ?? 2000);
    if (error || !Array.isArray(data)) return empty;
    return computeFundraiserDonationStats(data as FundraiserDonationRow[], opts);
  } catch {
    return empty;
  }
}

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
