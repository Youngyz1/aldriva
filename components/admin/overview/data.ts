/**
 * components/admin/overview/data.ts
 * Server-side data access for the admin Overview page.
 *
 * Assumes requireAdmin() already ran in app/admin/page.tsx (same request).
 *
 * Counting rule: totals and window counts are SQL aggregates
 * (count with head:true, date-bounded). Sums and day buckets need row data,
 * so they page through range-capped projections to exhaustion with a hard
 * ceiling (PAGE_SIZE × MAX_PAGES); hitting the ceiling marks the result
 * approximate instead of silently truncating. Whole tables are never pulled.
 * Money is grouped per currency and never summed across currencies.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { overviewStrings, type OverviewRange } from "./strings";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rows per projection page; hard ceiling = PAGE_SIZE × MAX_PAGES rows. */
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

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

type Row = Record<string, unknown>;

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Exact SQL count, optionally date-bounded. Never approximated. */
export async function sqlCount(
  table: string,
  column: string,
  value: string | boolean,
  start?: Date,
  end?: Date
): Promise<number> {
  const supabaseAdmin = createSupabaseAdmin();
  let query = supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (start) query = query.gte("created_at", start.toISOString());
  if (end) query = query.lt("created_at", end.toISOString());
  const { count, error } = await query;
  if (error) throw new Error(`Overview ${table} count failed.`);
  return count ?? 0;
}

/** Exact SQL count inside a date window (no status filter). */
export async function sqlCountWindow(
  table: string,
  start: Date,
  end: Date,
  column?: string,
  value?: string | boolean
): Promise<number> {
  const supabaseAdmin = createSupabaseAdmin();
  let query = supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());
  if (column) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error(`Overview ${table} window count failed.`);
  return count ?? 0;
}

/** Exact SQL total (no bounds). */
export async function sqlTotal(table: string): Promise<number> {
  const supabaseAdmin = createSupabaseAdmin();
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Overview ${table} total failed.`);
  return count ?? 0;
}

export type PagedResult = {
  rows: Row[];
  /** True when the safety ceiling stopped pagination — sums/buckets are approximate. */
  approximate: boolean;
};

/**
 * Range-capped column projection paged to exhaustion (offset pages,
 * created_at ascending). Stops after MAX_PAGES and reports approximate
 * instead of silently truncating at Supabase's default row cap.
 */
export async function fetchPaged(
  table: string,
  columns: string,
  start: Date,
  end: Date,
  inStatus?: { column: string; values: string[] }
): Promise<PagedResult> {
  const supabaseAdmin = createSupabaseAdmin();
  const rows: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = supabaseAdmin
      .from(table)
      .select(columns)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const { data, error } = inStatus
      ? await query.in(inStatus.column, inStatus.values)
      : await query;
    if (error) throw new Error(`Overview ${table} fetch failed.`);
    const batch = ((data ?? []) as unknown) as Row[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, approximate: false };
  }
  return { rows, approximate: true };
}

const SETTLED = { column: "status", values: ["succeeded", "completed"] };

export type MoneyTotal = {
  currency: string;
  total: number;
};

export type FigureDatum = {
  id: "users" | "volume" | "fundraisers" | "events" | "organizations";
  value: number;
  prevValue: number;
  sparkCurrent: number[];
  sparkPrevious: number[];
};

export type FiguresData = {
  bounds: RangeBounds;
  figures: FigureDatum[];
  /** Primary-currency series for the chart (USD when present, else largest). */
  volumeLabels: string[];
  volumeCurrent: number[];
  volumePrevious: number[];
  volumeCurrency: string;
  /** Non-primary currency totals in the current window (never added in). */
  volumeOthers: MoneyTotal[];
  /** True when any paged fetch hit the safety ceiling. */
  approximate: boolean;
};

/**
 * Key figures. Window counts are exact SQL aggregates; sparklines, the
 * volume chart and sums come from paged range-capped projections (8 fetch
 * sequences + 10 count queries in one parallel group).
 */
export async function getFiguresData(range: OverviewRange): Promise<FiguresData> {
  const b = getRangeBounds(range);

  const [
    usersN,
    usersP,
    fundsN,
    fundsP,
    evsN,
    evsP,
    orgsN,
    orgsP,
    usersRows,
    usersPrevRows,
    fundRows,
    fundPrevRows,
    evRows,
    evPrevRows,
    orgRows,
    orgPrevRows,
    donRows,
    donPrevRows,
  ] = await Promise.all([
    sqlCountWindow("profiles", b.start, b.end),
    sqlCountWindow("profiles", b.prevStart, b.prevEnd),
    sqlCountWindow("fundraisers", b.start, b.end),
    sqlCountWindow("fundraisers", b.prevStart, b.prevEnd),
    sqlCountWindow("events", b.start, b.end),
    sqlCountWindow("events", b.prevStart, b.prevEnd),
    sqlCountWindow("organizers", b.start, b.end),
    sqlCountWindow("organizers", b.prevStart, b.prevEnd),
    fetchPaged("profiles", "created_at", b.start, b.end),
    fetchPaged("profiles", "created_at", b.prevStart, b.prevEnd),
    fetchPaged("fundraisers", "created_at", b.start, b.end),
    fetchPaged("fundraisers", "created_at", b.prevStart, b.prevEnd),
    fetchPaged("events", "created_at", b.start, b.end),
    fetchPaged("events", "created_at", b.prevStart, b.prevEnd),
    fetchPaged("organizers", "created_at", b.start, b.end),
    fetchPaged("organizers", "created_at", b.prevStart, b.prevEnd),
    fetchPaged("donations", "created_at, amount, currency", b.start, b.end, SETTLED),
    fetchPaged("donations", "created_at, amount, currency", b.prevStart, b.prevEnd, SETTLED),
  ]);

  const bucketize = (
    rows: Row[],
    valueOf: (r: Row) => number,
    indexOf: (at: Date) => number
  ) => {
    const buckets = new Array<number>(b.bucketCount).fill(0);
    for (const r of rows) {
      const at = toDate(r.created_at);
      if (!at) continue;
      buckets[indexOf(at)] += valueOf(r);
    }
    return buckets;
  };

  const one = () => 1;
  const curIdx = (at: Date) => bucketIndex(at, b);
  const prevIdx = (at: Date) => prevBucketIndex(at, b);

  // Money grouped per currency — never summed across currencies.
  const sumByCurrency = (rows: Row[]): MoneyTotal[] => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const cur = typeof r.currency === "string" && r.currency !== ""
        ? r.currency.toUpperCase()
        : "USD";
      map.set(cur, (map.get(cur) ?? 0) + Number(r.amount ?? 0));
    }
    return [...map.entries()]
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, z) => z.total - a.total);
  };

  const donCurByCcy = sumByCurrency(donRows.rows);
  const primary =
    donCurByCcy.find((m) => m.currency === "USD") ?? donCurByCcy[0] ?? { currency: "USD", total: 0 };
  const inPrimary = (r: Row) => {
    const cur = typeof r.currency === "string" && r.currency !== ""
      ? r.currency.toUpperCase()
      : "USD";
    return cur === primary.currency;
  };
  const amtPrimary = (r: Row) => (inPrimary(r) ? Number(r.amount ?? 0) : 0);

  const volCur = bucketize(donRows.rows, amtPrimary, curIdx);
  const volPrev = bucketize(donPrevRows.rows, amtPrimary, prevIdx);
  const volTotal = volCur.reduce((s, v) => s + v, 0);
  const volPrevTotal = volPrev.reduce((s, v) => s + v, 0);

  const approximate =
    usersRows.approximate || usersPrevRows.approximate ||
    fundRows.approximate || fundPrevRows.approximate ||
    evRows.approximate || evPrevRows.approximate ||
    orgRows.approximate || orgPrevRows.approximate ||
    donRows.approximate || donPrevRows.approximate;

  return {
    bounds: b,
    figures: [
      { id: "users", value: usersN, prevValue: usersP, sparkCurrent: bucketize(usersRows.rows, one, curIdx), sparkPrevious: bucketize(usersPrevRows.rows, one, prevIdx) },
      { id: "volume", value: volTotal, prevValue: volPrevTotal, sparkCurrent: volCur, sparkPrevious: volPrev },
      { id: "fundraisers", value: fundsN, prevValue: fundsP, sparkCurrent: bucketize(fundRows.rows, one, curIdx), sparkPrevious: bucketize(fundPrevRows.rows, one, prevIdx) },
      { id: "events", value: evsN, prevValue: evsP, sparkCurrent: bucketize(evRows.rows, one, curIdx), sparkPrevious: bucketize(evPrevRows.rows, one, prevIdx) },
      { id: "organizations", value: orgsN, prevValue: orgsP, sparkCurrent: bucketize(orgRows.rows, one, curIdx), sparkPrevious: bucketize(orgPrevRows.rows, one, prevIdx) },
    ],
    volumeLabels: Array.from({ length: b.bucketCount }, (_, i) => bucketLabel(b, i)),
    volumeCurrent: volCur,
    volumePrevious: volPrev,
    volumeCurrency: primary.currency,
    volumeOthers: donCurByCcy.filter((m) => m.currency !== primary.currency),
    approximate,
  };
}

export type AttentionQueue = {
  id:
    | "organizers"
    | "articles"
    | "identity"
    | "businesses"
    | "businesses-review"
    | "products"
    | "events"
    | "fundraisers"
    | "reviews"
    | "payouts";
  count: number;
  href: string;
};

/** SQL-aggregate counts, one parallel group. Zero-count rows hidden by renderer. */
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

  const [
    organizers,
    articles,
    identity,
    flagged,
    businessesReview,
    products,
    events,
    fundraisers,
    reviews,
    payouts,
  ] = await Promise.all([
    count("organizers", "status", "pending"),
    count("articles", "status", "pending_review"),
    count("user_identity_verifications", "status", "submitted"),
    count("businesses", "is_flagged", true),
    count("businesses", "status", "pending_review"),
    count("products", "status", "pending_review"),
    count("events", "status", "pending"),
    count("fundraisers", "status", "pending_review"),
    count("reviews", "is_approved", false),
    count("payouts", "status", "requested"),
  ]);

  return [
    { id: "organizers", count: organizers, href: "/admin/organizers?status=pending" },
    { id: "events", count: events, href: "/admin/events" },
    { id: "fundraisers", count: fundraisers, href: "/admin/fundraisers?status=pending_review" },
    { id: "businesses-review", count: businessesReview, href: "/admin/businesses?tab=pending_review" },
    { id: "businesses", count: flagged, href: "/admin/businesses?tab=flagged" },
    { id: "products", count: products, href: "/admin/products?status=pending_review" },
    { id: "articles", count: articles, href: "/admin/articles?status=pending_review" },
    { id: "reviews", count: reviews, href: "/admin/reviews" },
    { id: "identity", count: identity, href: "/admin/users/identity-verifications" },
    { id: "payouts", count: payouts, href: "/admin/finance/payouts" },
  ];
}

export type RecentKind =
  | "user"
  | "organizer"
  | "event"
  | "fundraiser"
  | "article"
  | "business"
  | "product"
  | "review";

export type RecentItem = {
  kind: RecentKind;
  id: string;
  label: string;
  createdAt: string;
  href: string;
};

type ProfileRow = {
  id: string;
  account_info: { firstName?: string; lastName?: string; username?: string } | null;
  display_name: string | null;
  created_at: string;
};

/** Real display identifier: full name, else username, else email. Never generic. */
function userLabel(
  profile: ProfileRow,
  authUser: { email?: string | null; user_metadata?: Record<string, unknown> } | null
): string {
  const info = profile.account_info ?? {};
  const metadata = authUser?.user_metadata ?? {};
  const fullName = [info.firstName, info.lastName].filter(Boolean).join(" ").trim();
  if (fullName !== "") return fullName;
  if (profile.display_name?.trim()) return profile.display_name.trim();
  const username =
    info.username?.trim() ||
    String(metadata.username ?? metadata.user_name ?? "").trim();
  if (username !== "") return username;
  if (authUser?.email) return authUser.email;
  return authUser?.email?.split("@")[0] ?? profile.id.slice(0, 8);
}

/** Newest rows per entity, merged to the newest overall. Real submissions only. */
export async function getRecentSubmissions(limit = 8): Promise<RecentItem[]> {
  const supabaseAdmin = createSupabaseAdmin();
  const [
    users,
    organizers,
    events,
    fundraisers,
    articles,
    businesses,
    products,
    reviews,
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, account_info, display_name, created_at")
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
    supabaseAdmin
      .from("businesses")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("products")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("reviews")
      .select("id, title, review, created_at, event_id, fundraiser_id, organizer_id, events(title), fundraisers(title), organizers(name)")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const profileRows = ((users.data ?? []) as unknown) as ProfileRow[];
  // Emails live in auth, not profiles — one lookup per recent user row only.
  const authById = new Map<string, { email?: string | null; user_metadata?: Record<string, unknown> }>();
  await Promise.all(
    profileRows.map(async (p) => {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(p.id);
        if (data?.user) {
          authById.set(p.id, {
            email: data.user.email ?? null,
            user_metadata: (data.user.user_metadata ?? {}) as Record<string, unknown>,
          });
        }
      } catch {
        /* offline row keeps profile-only identifier */
      }
    })
  );

  const all: RecentItem[] = [];
  for (const row of profileRows) {
    all.push({
      kind: "user",
      id: row.id,
      label: userLabel(row, authById.get(row.id) ?? null),
      createdAt: row.created_at,
      href: `/admin/users/${row.id}`,
    });
  }
  const named = (
    rows: unknown,
    kind: RecentItem["kind"],
    href: string,
    pickName: (r: { id: string; created_at: string; [k: string]: unknown }) => string
  ) => {
    for (const row of (rows ?? []) as Array<{ id: string; created_at: string; [k: string]: unknown }>) {
      all.push({ kind, id: row.id, label: pickName(row), createdAt: row.created_at, href });
    }
  };
  named(organizers.data, "organizer", "/admin/organizers", (r) => String(r.name ?? ""));
  named(events.data, "event", "/admin/events", (r) => String(r.title ?? ""));
  for (const row of ((fundraisers.data ?? []) as unknown) as Array<{ id: string; title: string; created_at: string }>) {
    all.push({
      kind: "fundraiser",
      id: row.id,
      label: String(row.title ?? ""),
      createdAt: row.created_at,
      href: `/admin/fundraisers/${row.id}`,
    });
  }
  named(articles.data, "article", "/admin/articles", (r) => String(r.title ?? ""));
  named(businesses.data, "business", "/admin/businesses", (r) => String(r.name ?? ""));
  named(products.data, "product", "/admin/products", (r) => String(r.name ?? ""));
  for (const row of ((reviews.data ?? []) as unknown) as Array<{
    id: string;
    title: string | null;
    created_at: string;
    events: { title: string } | null;
    fundraisers: { title: string } | null;
    organizers: { name: string } | null;
  }>) {
    const target =
      row.events?.title ?? row.fundraisers?.title ?? row.organizers?.name ?? null;
    all.push({
      kind: "review",
      id: row.id,
      label: row.title?.trim() || (target ? `Review of ${target}` : "Review"),
      createdAt: row.created_at,
      href: "/admin/reviews",
    });
  }

  return all
    .filter((item) => toDate(item.createdAt) !== null)
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

export type GlanceState = {
  label: string;
  value: number;
};

export type GlanceRow = {
  id: string;
  total: number;
  rangeNew: number;
  rangePrev: number;
  states: GlanceState[];
  href: string;
};

/**
 * Platform-at-a-glance rows. All counts are exact SQL aggregates issued in
 * one parallel group; state chips are additional head:true counts.
 */
export async function getGlanceData(b: RangeBounds): Promise<GlanceRow[]> {
  const win = (table: string, start: Date, end: Date) =>
    sqlCountWindow(table, start, end);
  const winEq = (
    table: string,
    column: string,
    value: string | boolean,
    start: Date,
    end: Date
  ) => sqlCount(table, column, value, start, end);

  const [
    userTotal, userNew, userPrev, userActive, userSuspended, userAdmins,
    orgTotal, orgNew, orgPrev, orgPending, orgVerified,
    evTotal, evNew, evPrev, evApproved, evPending,
    fundTotal, fundNew, fundPrev, fundPublished, fundPending,
    bizTotal, bizNew, bizPrev, bizActive, bizFlagged,
    prodTotal, prodNew, prodPrev, prodActive, prodPending,
    artTotal, artNew, artPrev, artPublished, artPending,
    revTotal, revNew, revPrev, revApproved, revHidden,
    donTotal, donNew, donPrev, donSucceeded,
    payTotal, payNew, payPrev, payRequested, payProcessing,
    tickTotal, tickNew, tickPrev,
  ] = await Promise.all([
    sqlTotal("profiles"),
    win("profiles", b.start, b.end),
    win("profiles", b.prevStart, b.prevEnd),
    sqlCount("profiles", "status", "active"),
    sqlCount("profiles", "status", "suspended"),
    sqlCount("profiles", "role", "admin"),
    sqlTotal("organizers"),
    win("organizers", b.start, b.end),
    win("organizers", b.prevStart, b.prevEnd),
    sqlCount("organizers", "status", "pending"),
    sqlCount("organizers", "status", "verified"),
    sqlTotal("events"),
    win("events", b.start, b.end),
    win("events", b.prevStart, b.prevEnd),
    sqlCount("events", "status", "approved"),
    sqlCount("events", "status", "pending"),
    sqlTotal("fundraisers"),
    win("fundraisers", b.start, b.end),
    win("fundraisers", b.prevStart, b.prevEnd),
    sqlCount("fundraisers", "status", "published"),
    sqlCount("fundraisers", "status", "pending_review"),
    sqlTotal("businesses"),
    win("businesses", b.start, b.end),
    win("businesses", b.prevStart, b.prevEnd),
    sqlCount("businesses", "status", "active"),
    sqlCount("businesses", "is_flagged", true),
    sqlTotal("products"),
    win("products", b.start, b.end),
    win("products", b.prevStart, b.prevEnd),
    sqlCount("products", "status", "active"),
    sqlCount("products", "status", "pending_review"),
    sqlTotal("articles"),
    win("articles", b.start, b.end),
    win("articles", b.prevStart, b.prevEnd),
    sqlCount("articles", "status", "published"),
    sqlCount("articles", "status", "pending_review"),
    sqlTotal("reviews"),
    win("reviews", b.start, b.end),
    win("reviews", b.prevStart, b.prevEnd),
    sqlCount("reviews", "is_approved", true),
    sqlCount("reviews", "is_approved", false),
    sqlTotal("donations"),
    winEq("donations", "status", "succeeded", b.start, b.end),
    winEq("donations", "status", "succeeded", b.prevStart, b.prevEnd),
    sqlCount("donations", "status", "succeeded"),
    sqlTotal("payouts"),
    win("payouts", b.start, b.end),
    win("payouts", b.prevStart, b.prevEnd),
    sqlCount("payouts", "status", "requested"),
    sqlCount("payouts", "status", "processing"),
    sqlCount("ticket_orders", "status", "valid"),
    winEq("ticket_orders", "status", "valid", b.start, b.end),
    winEq("ticket_orders", "status", "valid", b.prevStart, b.prevEnd),
  ]);

  const st = overviewStrings.glanceStates;
  return [
    { id: "users", total: userTotal, rangeNew: userNew, rangePrev: userPrev, states: [{ label: st.active, value: userActive }, { label: st.suspended, value: userSuspended }, { label: st.admins, value: userAdmins }], href: "/admin/users" },
    { id: "organizations", total: orgTotal, rangeNew: orgNew, rangePrev: orgPrev, states: [{ label: st.pending, value: orgPending }, { label: st.verified, value: orgVerified }], href: "/admin/organizers" },
    { id: "events", total: evTotal, rangeNew: evNew, rangePrev: evPrev, states: [{ label: st.approved, value: evApproved }, { label: st.pending, value: evPending }], href: "/admin/events" },
    { id: "fundraisers", total: fundTotal, rangeNew: fundNew, rangePrev: fundPrev, states: [{ label: st.published, value: fundPublished }, { label: st.pendingReview, value: fundPending }], href: "/admin/fundraisers" },
    { id: "businesses", total: bizTotal, rangeNew: bizNew, rangePrev: bizPrev, states: [{ label: st.active, value: bizActive }, { label: st.flagged, value: bizFlagged }], href: "/admin/businesses" },
    { id: "products", total: prodTotal, rangeNew: prodNew, rangePrev: prodPrev, states: [{ label: st.active, value: prodActive }, { label: st.pendingReview, value: prodPending }], href: "/admin/products" },
    { id: "articles", total: artTotal, rangeNew: artNew, rangePrev: artPrev, states: [{ label: st.published, value: artPublished }, { label: st.pendingReview, value: artPending }], href: "/admin/articles" },
    { id: "reviews", total: revTotal, rangeNew: revNew, rangePrev: revPrev, states: [{ label: st.approved, value: revApproved }, { label: st.hidden, value: revHidden }], href: "/admin/reviews" },
    { id: "payments", total: donTotal, rangeNew: donNew, rangePrev: donPrev, states: [{ label: st.succeeded, value: donSucceeded }], href: "/admin/payments" },
    { id: "payouts", total: payTotal, rangeNew: payNew, rangePrev: payPrev, states: [{ label: st.requested, value: payRequested }, { label: st.processing, value: payProcessing }], href: "/admin/finance/payouts" },
    { id: "tickets", total: tickTotal, rangeNew: tickNew, rangePrev: tickPrev, states: [], href: "/admin/payments" },
  ];
}

export function formatMoney(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value !== 0 && Math.abs(value) < 100 ? 2 : 0,
    }).format(value);
  } catch {
    return `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
}

export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    const str = (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1);
    return `${str}k`;
  }
  return String(value);
}

/** Compact delta: arrow + percent ("↑ 30%"). Absolute + previous go in title. */
export function formatDelta(current: number, previous: number): {
  text: string;
  title: string;
  tone: "up" | "down" | "flat";
} {
  const fmt = (n: number) => n.toLocaleString("en-US");
  const diff = current - previous;
  if (diff === 0) {
    return {
      text: "—",
      title: overviewStrings.deltaTitle("±0", fmt(previous)),
      tone: "flat",
    };
  }
  const arrow = diff > 0 ? "↑" : "↓";
  const abs = Math.abs(diff);
  const signedAbs = `${diff > 0 ? "+" : "−"}${fmt(abs)}`;
  const title = overviewStrings.deltaTitle(signedAbs, fmt(previous));
  if (previous === 0) {
    return { text: `${arrow} new`, title, tone: diff > 0 ? "up" : "down" };
  }
  const pct = Math.round((abs / previous) * 100);
  return { text: `${arrow} ${pct}%`, title, tone: diff > 0 ? "up" : "down" };
}

export function timeAgo(iso: string, now = new Date()): string {
  const d = toDate(iso);
  if (!d) return "";
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
