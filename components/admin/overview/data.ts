/**
 * components/admin/overview/data.ts
 * Server-side data access for the admin Overview page.
 *
 * Assumes requireAdmin() already ran in app/admin/page.tsx (same request).
 * Counting rule: totals use SQL aggregates (count with head:true); chart and
 * sparkline series need per-day shapes, so they use range-capped column
 * projections (created_at, amount) bucketed in JS — windows are capped at
 * 90 days and every fetch carries gte/lt bounds, so whole tables are never
 * pulled. Callers issue these helpers inside Promise.all groups.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type { OverviewRange } from "./strings";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RangeBounds = {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  bucketCount: number;
  bucketKind: "hour" | "day";
};

export function getRangeBounds(range: OverviewRange, now = new Date()): RangeBounds {
  if (range === "today") {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + DAY_MS);
    return {
      start,
      end,
      prevStart: new Date(start.getTime() - DAY_MS),
      prevEnd: start,
      bucketCount: 24,
      bucketKind: "hour",
    };
  }
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const end = now;
  const start = new Date(end.getTime() - days * DAY_MS);
  return {
    start,
    end,
    prevStart: new Date(start.getTime() - days * DAY_MS),
    prevEnd: start,
    bucketCount: days,
    bucketKind: "day",
  };
}

function bucketIndex(at: Date, b: RangeBounds): number {
  if (b.bucketKind === "hour") return at.getUTCHours();
  const idx = Math.floor((at.getTime() - b.start.getTime()) / DAY_MS);
  return Math.min(Math.max(idx, 0), b.bucketCount - 1);
}

function prevBucketIndex(at: Date, b: RangeBounds): number {
  if (b.bucketKind === "hour") return at.getUTCHours();
  const idx = Math.floor((at.getTime() - b.prevStart.getTime()) / DAY_MS);
  return Math.min(Math.max(idx, 0), b.bucketCount - 1);
}

export function bucketLabel(b: RangeBounds, i: number): string {
  if (b.bucketKind === "hour") return `${i}:00`;
  const d = new Date(b.start.getTime() + i * DAY_MS);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type DonationRow = { created_at: string; amount: number | string | null };

/** Bounded column projection for one window (never a whole-table fetch). */
async function fetchWindow(
  table: string,
  columns: string,
  start: Date,
  end: Date,
  inStatus?: { column: string; values: string[] }
) {
  const supabaseAdmin = createSupabaseAdmin();
  const query = supabaseAdmin
    .from(table)
    .select(columns)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true });
  const { data, error } = inStatus
    ? await query.in(inStatus.column, inStatus.values)
    : await query;
  if (error) throw new Error(`Overview ${table} fetch failed.`);
  return ((data ?? []) as unknown) as Array<Record<string, unknown>>;
}

export type FigureDatum = {
  id: "users" | "volume" | "fundraisers" | "events";
  value: number;
  prevValue: number;
  sparkCurrent: number[];
  sparkPrevious: number[];
};

export type FiguresData = {
  bounds: RangeBounds;
  figures: FigureDatum[];
  volumeLabels: string[];
  volumeCurrent: number[];
  volumePrevious: number[];
};

/**
 * Key figures + main volume series. 8 bounded queries in one parallel group:
 * created_at projections for users/fundraisers/events (range + previous) and
 * created_at+amount projections for donations (range + previous).
 */
export async function getFiguresData(range: OverviewRange): Promise<FiguresData> {
  const b = getRangeBounds(range);
  const settled = { column: "status", values: ["succeeded", "completed"] };

  const [
    usersCur,
    usersPrev,
    fundCur,
    fundPrev,
    evCur,
    evPrev,
    donCur,
    donPrev,
  ] = await Promise.all([
    fetchWindow("profiles", "created_at", b.start, b.end),
    fetchWindow("profiles", "created_at", b.prevStart, b.prevEnd),
    fetchWindow("fundraisers", "created_at", b.start, b.end),
    fetchWindow("fundraisers", "created_at", b.prevStart, b.prevEnd),
    fetchWindow("events", "created_at", b.start, b.end),
    fetchWindow("events", "created_at", b.prevStart, b.prevEnd),
    fetchWindow("donations", "created_at, amount", b.start, b.end, settled),
    fetchWindow("donations", "created_at, amount", b.prevStart, b.prevEnd, settled),
  ]);

  /** Bucket rows of one window; valueOf extracts the per-row contribution. */
  const bucketize = (
    rows: Array<Record<string, unknown>>,
    valueOf: (r: Record<string, unknown>) => number,
    indexOf: (at: Date) => number
  ) => {
    const buckets = new Array<number>(b.bucketCount).fill(0);
    let total = 0;
    for (const r of rows) {
      const v = valueOf(r);
      total += v;
      buckets[indexOf(new Date(String(r.created_at)))] += v;
    }
    return { total, buckets };
  };

  const one = () => 1;
  const amountOf = (r: Record<string, unknown>) => Number((r as DonationRow).amount ?? 0);
  const curIdx = (at: Date) => bucketIndex(at, b);
  const prevIdx = (at: Date) => prevBucketIndex(at, b);

  const users = bucketize(usersCur, one, curIdx);
  const usersP = bucketize(usersPrev, one, prevIdx);
  const funds = bucketize(fundCur, one, curIdx);
  const fundsP = bucketize(fundPrev, one, prevIdx);
  const evs = bucketize(evCur, one, curIdx);
  const evsP = bucketize(evPrev, one, prevIdx);
  const vol = bucketize(donCur, amountOf, curIdx);
  const volP = bucketize(donPrev, amountOf, prevIdx);

  return {
    bounds: b,
    figures: [
      { id: "users", value: users.total, prevValue: usersP.total, sparkCurrent: users.buckets, sparkPrevious: usersP.buckets },
      { id: "volume", value: vol.total, prevValue: volP.total, sparkCurrent: vol.buckets, sparkPrevious: volP.buckets },
      { id: "fundraisers", value: funds.total, prevValue: fundsP.total, sparkCurrent: funds.buckets, sparkPrevious: fundsP.buckets },
      { id: "events", value: evs.total, prevValue: evsP.total, sparkCurrent: evs.buckets, sparkPrevious: evsP.buckets },
    ],
    volumeLabels: Array.from({ length: b.bucketCount }, (_, i) => bucketLabel(b, i)),
    volumeCurrent: vol.buckets,
    volumePrevious: volP.buckets,
  };
}

export type AttentionQueue = {
  id: "organizers" | "articles" | "identity" | "businesses" | "payouts";
  count: number;
  href: string;
};

/** 5 SQL-aggregate counts in one parallel group. Zero-count rows are hidden by the renderer. */
export async function getAttentionQueue(): Promise<AttentionQueue[]> {
  const supabaseAdmin = createSupabaseAdmin();
  const count = async (
    table: string,
    column: string,
    value: string | boolean
  ): Promise<number> => {
    const { count: c, error } = await supabaseAdmin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, value);
    if (error) throw new Error(`Overview ${table} count failed.`);
    return c ?? 0;
  };

  const [organizers, articles, identity, businesses, payouts] = await Promise.all([
    count("organizers", "status", "pending"),
    count("articles", "status", "pending_review"),
    count("user_identity_verifications", "status", "submitted"),
    count("businesses", "is_flagged", true),
    count("payouts", "status", "requested"),
  ]);

  return [
    { id: "organizers", count: organizers, href: "/admin/organizers?status=pending" },
    { id: "articles", count: articles, href: "/admin/articles?status=pending_review" },
    { id: "identity", count: identity, href: "/admin/users/identity-verifications" },
    { id: "businesses", count: businesses, href: "/admin/businesses?tab=flagged" },
    { id: "payouts", count: payouts, href: "/admin/finance/payouts" },
  ];
}

export type RecentItem = {
  kind: "user" | "organizer" | "event" | "fundraiser" | "article";
  id: string;
  label: string;
  detail: string | null;
  createdAt: string;
  href: string;
};

/** Newest rows per entity (limit 8 each), merged to the 8 latest. Real submissions only. */
export async function getRecentSubmissions(limit = 8): Promise<RecentItem[]> {
  const supabaseAdmin = createSupabaseAdmin();
  const [users, organizers, events, fundraisers, articles] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("organizers")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("events")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("fundraisers")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("articles")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const all: RecentItem[] = [];
  for (const row of (users.data ?? []) as Array<{ id: string; created_at: string }>) {
    all.push({
      kind: "user",
      id: row.id,
      label: "New user",
      detail: null,
      createdAt: row.created_at,
      href: `/admin/users/${row.id}`,
    });
  }
  for (const row of (organizers.data ?? []) as Array<{ id: string; name: string; created_at: string }>) {
    all.push({
      kind: "organizer",
      id: row.id,
      label: row.name,
      detail: null,
      createdAt: row.created_at,
      href: "/admin/organizers",
    });
  }
  for (const row of (events.data ?? []) as Array<{ id: string; title: string; created_at: string }>) {
    all.push({
      kind: "event",
      id: row.id,
      label: row.title,
      detail: null,
      createdAt: row.created_at,
      href: "/admin/events",
    });
  }
  for (const row of (fundraisers.data ?? []) as Array<{ id: string; title: string; created_at: string }>) {
    all.push({
      kind: "fundraiser",
      id: row.id,
      label: row.title,
      detail: null,
      createdAt: row.created_at,
      href: `/admin/fundraisers/${row.id}`,
    });
  }
  for (const row of (articles.data ?? []) as Array<{ id: string; title: string; created_at: string }>) {
    all.push({
      kind: "article",
      id: row.id,
      label: row.title,
      detail: null,
      createdAt: row.created_at,
      href: "/admin/articles",
    });
  }
  return all
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export type TopFundraiser = {
  id: string;
  title: string;
  raised: number;
  goal: number | null;
};

export type NewestOrganizer = {
  id: string;
  name: string;
  createdAt: string;
};

/** Side-by-side lists: top fundraisers by raised, newest organizers. */
export async function getTopLists(): Promise<{
  fundraisers: TopFundraiser[];
  organizers: NewestOrganizer[];
}> {
  const supabaseAdmin = createSupabaseAdmin();
  const [fundraisers, organizers] = await Promise.all([
    supabaseAdmin
      .from("fundraisers")
      .select("id, title, raised, goal")
      .order("raised", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("organizers")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  if (fundraisers.error) throw new Error("Overview top fundraisers failed.");
  if (organizers.error) throw new Error("Overview newest organizers failed.");
  return {
    fundraisers: ((fundraisers.data ?? []) as Array<{
      id: string;
      title: string;
      raised: number | null;
      goal: number | null;
    }>).map((f) => ({
      id: f.id,
      title: f.title,
      raised: Number(f.raised ?? 0),
      goal: f.goal == null ? null : Number(f.goal),
    })),
    organizers: ((organizers.data ?? []) as Array<{
      id: string;
      name: string;
      created_at: string;
    }>).map((o) => ({ id: o.id, name: o.name, createdAt: o.created_at })),
  };
}

export function formatMoney(value: number): string {
  return `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    const str = (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1);
    return `${str}k`;
  }
  return String(value);
}

/** "+12 · +8%" / "−3 · −5%" / "new" / "—" */
export function formatDelta(current: number, previous: number): {
  text: string;
  tone: "up" | "down" | "flat";
} {
  const diff = current - previous;
  if (diff === 0) return { text: "—", tone: "flat" };
  const sign = diff > 0 ? "+" : "−";
  const abs = Math.abs(diff);
  if (previous === 0) return { text: `${sign}${abs} · new`, tone: diff > 0 ? "up" : "down" };
  const pct = Math.round((abs / previous) * 100);
  return { text: `${sign}${abs} · ${sign}${pct}%`, tone: diff > 0 ? "up" : "down" };
}

export function timeAgo(iso: string, now = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
