import { notFound } from "next/navigation";
import Link from "next/link";
import { assertCanManageFundraiser } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveBeneficiary } from "@/lib/beneficiary";
import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";
import {
  inferStatus,
  computeHealthScore,
  computeProjectedFinishDate,
  buildRecommendedAction,
  buildFundraiserInsights,
  buildDailyDonations,
  formatCurrency,
  isSameUtcDay,
} from "@/lib/fundraiser-dashboard";
import FundraisingProgressRing from "@/components/ui/FundraisingProgressRing";
import FundraiserAnalytics from "@/components/fundraisers/FundraiserAnalytics.client";
import FundraiserQuickActions from "@/components/fundraisers/FundraiserQuickActions.client";
import FundraiserHeaderActions from "@/components/fundraisers/FundraiserHeaderActions.client";
import { CheckCircle2, AlertTriangle, TrendingUp, Clock, Heart, Users, Wallet, Receipt, Target, PiggyBank, Eye, MousePointerClick, Share2, Lightbulb, Info } from "lucide-react";

function StatusBadge({ status, healthScore }: { status: ReturnType<typeof inferStatus>; healthScore: number }) {
  const meta =
    status === "completed"
      ? { label: "Completed", cls: "bg-violet-50 text-violet-700 border-violet-200", Icon: CheckCircle2 }
      : status === "behind" && healthScore < 35
        ? { label: "Critical", cls: "bg-red-50 text-red-600 border-red-200", Icon: AlertTriangle }
        : status === "behind"
          ? { label: "Slightly Behind", cls: "bg-amber-50 text-amber-600 border-amber-200", Icon: AlertTriangle }
          : status === "ahead"
            ? { label: "On Track", cls: "bg-brand-50 text-brand-700 border-brand-200", Icon: TrendingUp }
            : status === "paused"
              ? { label: "Paused", cls: "bg-zinc-50 text-zinc-600 border-zinc-200", Icon: Clock }
              : { label: "On Track", cls: "bg-brand-50 text-brand-700 border-brand-200", Icon: CheckCircle2 };
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.cls}`}>
      <Icon className="h-3.5 w-3.5" /> {meta.label}
    </span>
  );
}

export default async function FundraiserOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageFundraiser(id);
  if (!auth.ok) return notFound();
  const admin = createSupabaseAdmin();

  // — fetch fundraiser with resilient columns (beneficiary may not exist yet)
  let f: Record<string, unknown> | null = null;
  {
    const { data, error } = await admin.from("fundraisers").select("id, title, slug, story, category, goal, raised, raised_amount, organizer_id, organizer, status, created_at, deleted_at").eq("id", id).maybeSingle();
    if (error) {
      // try minimal columns if goal/raised split missing
      const { data: d2 } = await admin.from("fundraisers").select("id, title, slug, status, created_at, organizer_id, organizer").eq("id", id).maybeSingle();
      if (!d2) return notFound();
      f = d2 as Record<string, unknown>;
    } else if (!data) return notFound();
    else f = data as Record<string, unknown>;
  }
  if (!f) return notFound();

  // optional beneficiary (soft)
  let beneficiaryRaw: unknown = null;
  try {
    const { data: opt } = await admin.from("fundraisers").select("beneficiary").eq("id", id).maybeSingle();
    beneficiaryRaw = (opt as Record<string, unknown>)?.beneficiary ?? null;
  } catch {}

  const title = String(f.title ?? "Untitled Campaign");
  const slug = String(f.slug ?? id);
  const category = String(f.category ?? "General");
  const statusRaw = String(f.status ?? "published");
  const goal = Number((f as { goal?: unknown }).goal ?? (f as { goal_amount?: unknown }).goal_amount ?? (f as { goalAmount?: unknown }).goalAmount ?? 0);
  const raised = Number((f as { raised_amount?: unknown }).raised_amount ?? (f as { raised?: unknown }).raised ?? 0);
  const createdAt = String(f.created_at ?? new Date().toISOString());
  const organizerId = (f.organizer_id as string | null) ?? null;
  const organizerName = (f.organizer as string | null) ?? null;

  // organizer name fallback for beneficiary
  let orgName: string | null = organizerName;
  if (organizerId) {
    const { data: org } = await admin.from("organizers").select("name").eq("id", organizerId).maybeSingle();
    if (org?.name) orgName = org.name;
  }
  const beneficiary = resolveBeneficiary(beneficiaryRaw, orgName);

  // — donations scoped to this fundraiser only (succeeded only for stats)
  type DonRow = { id: string; donor_name: string | null; amount: number | string | null; created_at: string | null; status?: string | null; fundraiser_id: string };
  let rawDonations: DonRow[] = [];
  try {
    const { data } = await admin.from("donations").select("id, donor_name, amount, created_at, fundraiser_id, status").eq("fundraiser_id", id).order("created_at", { ascending: false }).limit(500);
    rawDonations = (data ?? []) as DonRow[];
  } catch {
    const { data } = await admin.from("donations").select("id, donor_name, amount, created_at, fundraiser_id").eq("fundraiser_id", id).order("created_at", { ascending: false }).limit(500);
    rawDonations = (data ?? []) as DonRow[];
  }
  // only succeeded counts toward raised/average if status exists
  const succeeded = rawDonations.filter((d) => !("status" in d) || d.status == null || d.status === "succeeded");
  // if no succeeded but there are donations, fall back to all (defensive)
  const donationsForStats = succeeded.length > 0 ? succeeded : rawDonations;

  // — updates
  let rawUpdates: { id: string; title: string | null; created_at: string | null; fundraiser_id: string }[] = [];
  try {
    const { data } = await admin.from("fundraiser_updates").select("id, title, created_at, fundraiser_id").eq("fundraiser_id", id).order("created_at", { ascending: false }).limit(10);
    rawUpdates = (data ?? []) as typeof rawUpdates;
  } catch {
    rawUpdates = [];
  }

  // — followers if organizer-owned
  let followerCount = 0;
  if (organizerId) {
    try {
      const { count } = await admin.from("organizer_follows").select("id", { count: "exact", head: true }).eq("organizer_id", organizerId);
      followerCount = count ?? 0;
    } catch {}
  }

  // — derived metrics (mirrors event-platform/app/dashboard/page.tsx)
  const now = new Date();
  const daysElapsed = Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
  const avgDaily = Math.round(raised / daysElapsed);
  const daysRemaining = 30; // no end_date column — honest default
  const dailyPaceRequired = daysRemaining > 0 ? Math.round((goal - raised) / daysRemaining) : undefined;
  const pct = calculateFundraisingPercentage(raised, goal);
  const remaining = Math.max(0, goal - raised);
  const status = statusRaw === "paused" ? "paused" as const : inferStatus(raised, goal, null);
  const healthScore = computeHealthScore(status, dailyPaceRequired, avgDaily);
  const projectedFinishDate = computeProjectedFinishDate(raised, goal, avgDaily);
  const recommended = buildRecommendedAction(status);

  const donorCount = new Set(donationsForStats.map((d) => (d.donor_name === "Anonymous" ? d.id : d.donor_name ?? d.id))).size;
  const averageDonation = donationsForStats.length > 0 ? Math.round(raised / donationsForStats.length) : 0;
  const todayDonations = donationsForStats.filter((d) => isSameUtcDay(new Date(d.created_at ?? 0), now));
  const todayAmount = todayDonations.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const todayCount = todayDonations.length;
  const hasDonations = raised > 0 || donationsForStats.length > 0;

  const lastUpdateDate = rawUpdates[0]?.created_at ?? null;
  const updateCount = rawUpdates.length;
  const insights = buildFundraiserInsights({
    status,
    raised,
    goal,
    dailyPaceRequired,
    averageDailyRaised: avgDaily,
    todayCount,
    todayAmount,
    lastUpdateDate,
    updateCount,
    donations: donationsForStats.map((d) => ({ amount: Number(d.amount ?? 0), timestamp: d.created_at ?? new Date().toISOString() })),
  });

  const dailyDonations = buildDailyDonations(donationsForStats.map((d) => ({ amount: Number(d.amount ?? 0), timestamp: d.created_at ?? new Date().toISOString() })));

  // recent lists
  const recentDonations = donationsForStats.slice(0, 5);
  const activities = [
    ...rawDonations.slice(0, 5).map((d) => ({ id: `don-${d.id}`, title: "Donation received", desc: `${d.donor_name === "Anonymous" ? "Anonymous" : d.donor_name ?? "Someone"} donated $${Number(d.amount ?? 0).toLocaleString()}`, ts: d.created_at ?? new Date().toISOString() })),
    ...rawUpdates.slice(0, 3).map((u) => ({ id: `upd-${u.id}`, title: "Update posted", desc: `"${u.title ?? "Campaign update"}" was published`, ts: u.created_at ?? new Date().toISOString() })),
  ]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 6);

  function formatProjectedFinish(): string {
    if (status === "completed") return "Goal reached";
    if (!projectedFinishDate) return "Not enough data yet";
    return new Date(projectedFinishDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const actionHref =
    recommended.type === "post_update"
      ? `/dashboard/fundraisers/${id}/updates`
      : recommended.type === "thank_donors"
        ? `/dashboard/fundraisers/${id}/donors`
        : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-600">{category}</span>
              <StatusBadge status={status} healthScore={healthScore} />
              {beneficiary && <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-600">For {beneficiary.name}</span>}
            </div>
            {organizerId && orgName && <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{orgName}</p>}
            <h1 className="mt-1 break-words text-xl font-bold leading-tight text-zinc-900 sm:text-2xl">{title}</h1>
            <p className="mt-1 text-sm text-zinc-500">{statusRaw} · Goal {goal ? `$${goal.toLocaleString()}` : "—"} · {pct}% funded</p>
          </div>
          <FundraiserHeaderActions fundraiserId={id} slug={slug} title={title} hasDonations={hasDonations} />
        </div>
        <div className="mt-5 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-extrabold tabular-nums text-zinc-900">{formatCurrency(raised)}</span>
            <span className="text-sm text-zinc-500">
              of <span className="font-semibold text-zinc-700">{formatCurrency(goal)}</span> goal
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% funded`}>
            <div className="h-full rounded-full bg-brand-700 transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Raised</dt>
            <dd className="truncate text-sm font-bold tabular-nums text-brand-700">{formatCurrency(raised)}</dd>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Funded</dt>
            <dd className="truncate text-sm font-bold tabular-nums text-zinc-900">{pct}%</dd>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Days Left</dt>
            <dd className="truncate text-sm font-bold tabular-nums text-zinc-900">{daysRemaining}</dd>
            <span className="text-[11px] leading-tight text-zinc-400">days remaining</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Avg / Day</dt>
            <dd className="truncate text-sm font-bold tabular-nums text-zinc-900">{formatCurrency(avgDaily)}/day</dd>
          </div>
        </dl>
      </div>

      {/* Health + KPIs */}
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Campaign Health</h2>
          <StatusBadge status={status} healthScore={healthScore} />
        </div>
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <div className="mx-auto shrink-0 sm:mx-0">
            <FundraisingProgressRing raised={raised} goal={goal || 1} size={112} strokeWidth={9} showDetails />
          </div>
          <div className="grid flex-1 grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-zinc-400">Health Score</span>
              <span className="truncate text-sm font-bold tabular-nums text-zinc-900">{healthScore}/100</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-zinc-400">Projected Finish</span>
              <span className="truncate text-sm font-bold tabular-nums text-zinc-900">{formatProjectedFinish()}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-zinc-400">Current Pace</span>
              <span className="truncate text-sm font-bold tabular-nums text-zinc-900">{formatCurrency(avgDaily)}/day</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-zinc-400">Required Pace</span>
              <span className="truncate text-sm font-bold tabular-nums text-zinc-900">{dailyPaceRequired ? `${formatCurrency(dailyPaceRequired)}/day` : "—"}</span>
            </div>
          </div>
        </div>
        <div className="border-t border-zinc-100 p-5">
          <div className={recommended.urgency === "high" ? "rounded-xl bg-red-50 p-4" : recommended.urgency === "medium" ? "rounded-xl bg-amber-50 p-4" : "rounded-xl bg-zinc-50 p-4"}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Recommended Action</span>
                <h3 className="text-sm font-semibold leading-snug text-zinc-900">{recommended.reason}</h3>
              </div>
              <span className={recommended.urgency === "high" ? "shrink-0 rounded-full border border-red-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-red-600" : recommended.urgency === "medium" ? "shrink-0 rounded-full border border-amber-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-amber-600" : "shrink-0 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-zinc-500"}>
                {recommended.urgency.charAt(0).toUpperCase() + recommended.urgency.slice(1)} priority
              </span>
            </div>
            {actionHref ? (
              <Link href={actionHref} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-brand-800">
                {recommended.label} <span aria-hidden>→</span>
              </Link>
            ) : (
              <Link href={`/fundraisers/${slug}`} target="_blank" className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-brand-800">
                {recommended.label} <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-zinc-500">Amount Raised</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50"><Wallet className="h-4 w-4 text-brand-700" /></div>
            </div>
            <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">{formatCurrency(raised)}</span>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-zinc-500">Today&apos;s Donations</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50"><Heart className="h-4 w-4 text-brand-700" /></div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">{formatCurrency(todayAmount)}</span>
              <span className="text-xs text-zinc-400">{todayCount} {todayCount === 1 ? "gift" : "gifts"} today</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-zinc-500">Donors</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50"><Users className="h-4 w-4 text-violet-600" /></div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">{donorCount.toLocaleString()}</span>
              <span className="text-xs text-zinc-400">people who gave</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-zinc-500">Average Donation</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50"><Receipt className="h-4 w-4 text-sky-600" /></div>
            </div>
            <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">{formatCurrency(averageDonation)}</span>
          </div>
        </div>
        <div>
          <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">More stats</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-zinc-500">Goal</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50"><Target className="h-4 w-4 text-indigo-600" /></div>
              </div>
              <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">{formatCurrency(goal)}</span>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-zinc-500">Remaining</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50"><PiggyBank className="h-4 w-4 text-amber-600" /></div>
              </div>
              <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">{formatCurrency(remaining)}</span>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-zinc-500">Followers</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50"><Heart className="h-4 w-4 text-rose-500" /></div>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">{followerCount.toLocaleString()}</span>
                <span className="text-xs text-zinc-400">following your org</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-zinc-500">Shares</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-50"><Share2 className="h-4 w-4 text-zinc-300" /></div>
              </div>
              <span className="text-lg font-semibold text-zinc-300">—</span>
              <span className="text-xs text-zinc-400">Not tracked yet</span>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-zinc-500">Conversion Rate</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-50"><MousePointerClick className="h-4 w-4 text-zinc-300" /></div>
              </div>
              <span className="text-lg font-semibold text-zinc-300">—</span>
              <span className="text-xs text-zinc-400">Not tracked yet</span>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-zinc-500">Page Views</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-50"><Eye className="h-4 w-4 text-zinc-300" /></div>
              </div>
              <span className="text-lg font-semibold text-zinc-300">—</span>
              <span className="text-xs text-zinc-400">Not tracked yet</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main grid: analytics + rail */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <FundraiserQuickActions fundraiserId={id} slug={slug} className="lg:col-start-2 lg:row-start-1" />
        <div className="rounded-xl border border-zinc-200 bg-white lg:col-start-2 lg:row-start-2">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-4">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-900">Fundraising Insights</h2>
          </div>
          {insights.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Lightbulb className="h-8 w-8 text-zinc-300" />
              <p className="text-sm font-semibold text-zinc-900">Not enough data yet</p>
              <p className="max-w-xs text-xs text-zinc-500">Insights will appear here as your campaign collects more donation history.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3 p-4">
              {insights.map((ins) => (
                <li key={ins.id} className="flex items-start gap-3 rounded-lg p-2">
                  <div className={ins.tone === "positive" ? "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50" : ins.tone === "warning" ? "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50" : "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50"}>
                    {ins.tone === "positive" ? <TrendingUp className="h-3.5 w-3.5 text-brand-700" /> : ins.tone === "warning" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> : <Info className="h-3.5 w-3.5 text-sky-600" />}
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-700">{ins.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-6 lg:col-start-1 lg:row-start-1">
          <FundraiserAnalytics dailyDonations={dailyDonations} />
          <div className="rounded-xl border border-zinc-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-zinc-900">Recent Donations</h2>
              <Link href={`/dashboard/fundraisers/${id}/donations`} className="text-xs font-medium text-brand-700 hover:text-brand-800">View all</Link>
            </div>
            {recentDonations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Heart className="h-8 w-8 text-zinc-300" />
                <p className="text-sm font-semibold text-zinc-900">No donations yet</p>
                <p className="text-xs text-zinc-500">When someone donates, they&apos;ll appear here.</p>
                <p className="text-xs font-semibold text-brand-700">{formatCurrency(0)} today</p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {recentDonations.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900">{d.donor_name ?? "Anonymous"}</p>
                      <p className="text-xs text-zinc-500">{d.created_at ? new Date(d.created_at).toLocaleDateString() : ""}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-zinc-900">${Number(d.amount ?? 0).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-zinc-900">Recent Activity</h2>
              <Link href={`/dashboard/fundraisers/${id}/updates`} className="text-xs font-medium text-brand-700 hover:text-brand-800">Updates</Link>
            </div>
            {activities.length === 0 ? (
              <div className="p-5 text-center text-sm text-zinc-500">Not enough data yet</div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {activities.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <p className="text-sm font-semibold text-zinc-900">{a.title}</p>
                    <p className="text-xs text-zinc-500">{a.desc}</p>
                    <p className="text-[11px] text-zinc-400">{new Date(a.ts).toLocaleDateString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 lg:col-start-2 lg:row-start-3">
          <h2 className="text-sm font-semibold text-zinc-900">Beneficiary</h2>
          {beneficiary ? (
            <div className="mt-3">
              <p className="text-sm font-bold text-zinc-900">{beneficiary.name}</p>
              <p className="text-xs text-zinc-500">{beneficiary.type !== "self" ? beneficiary.type : "Self"}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No beneficiary set — add one to build donor trust.</p>
          )}
          <Link href={`/dashboard/fundraisers/${id}/beneficiaries`} className="mt-3 inline-flex rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            Manage beneficiary
          </Link>
        </div>
      </div>
    </div>
  );
}
