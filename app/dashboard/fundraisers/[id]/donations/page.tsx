import { notFound } from "next/navigation";
import { assertCanManageFundraiser } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isSameUtcDay } from "@/lib/fundraiser-dashboard";
import DonationsClient from "./DonationsClient";

export type DonationRow = {
  id: string;
  donor_name: string | null;
  donor_email: string | null;
  user_id: string | null;
  amount: number;
  currency: string | null;
  status: string | null;
  payment_intent_id: string | null;
  created_at: string;
};

export type DonationMetrics = {
  total: number;
  totalAmount: number;
  avgAmount: number;
  todayAmount: number;
  todayCount: number;
};

const PAGE_SIZE = 25;
const VALID_SORTS = ["newest", "oldest", "amount_desc", "amount_asc"] as const;
const VALID_STATUSES = ["all", "pending", "succeeded", "failed", "refunded"] as const;

export default async function FundraiserDonationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; status?: string; sort?: string; page?: string }>;
}) {
  const { id } = await params;
  const auth = await assertCanManageFundraiser(id);
  if (!auth.ok) return notFound();

  const admin = createSupabaseAdmin();

  // Fetch fundraiser name for context header
  const { data: fundraiser } = await admin
    .from("fundraisers")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (!fundraiser) return notFound();

  // Parse searchParams safely
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const rawStatus = sp.status ?? "all";
  const status = VALID_STATUSES.includes(rawStatus as typeof VALID_STATUSES[number]) ? rawStatus : "all";
  const rawSort = sp.sort ?? "newest";
  const sort = VALID_SORTS.includes(rawSort as typeof VALID_SORTS[number]) ? rawSort : "newest";
  const pageNum = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const from = (pageNum - 1) * PAGE_SIZE;

  // ── Summary metrics: all succeeded donations (un-paginated) ──────────────
  let metricsRows: { amount: string | number; created_at: string }[] = [];
  try {
    const { data } = await admin
      .from("donations")
      .select("amount, created_at")
      .eq("fundraiser_id", id)
      .or("status.eq.succeeded,status.is.null");
    metricsRows = (data ?? []) as typeof metricsRows;
  } catch {
    // defensive: try without status filter
    try {
      const { data } = await admin
        .from("donations")
        .select("amount, created_at")
        .eq("fundraiser_id", id);
      metricsRows = (data ?? []) as typeof metricsRows;
    } catch {}
  }

  const now = new Date();
  const total = metricsRows.length;
  const totalAmount = metricsRows.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const avgAmount = total > 0 ? Math.round(totalAmount / total) : 0;
  const todayRows = metricsRows.filter((d) => isSameUtcDay(new Date(d.created_at ?? 0), now));
  const todayAmount = todayRows.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const todayCount = todayRows.length;

  const metrics: DonationMetrics = { total, totalAmount, avgAmount, todayAmount, todayCount };

  // ── Paginated donation query ──────────────────────────────────────────────
  let donationQuery = admin
    .from("donations")
    .select("id, donor_name, donor_email, user_id, amount, currency, status, payment_intent_id, created_at", { count: "exact" })
    .eq("fundraiser_id", id);

  if (status !== "all") {
    donationQuery = donationQuery.eq("status", status);
  }
  if (q) {
    donationQuery = donationQuery.or(`donor_name.ilike.%${q}%,donor_email.ilike.%${q}%`);
  }

  // Sort
  if (sort === "amount_desc") {
    donationQuery = donationQuery.order("amount", { ascending: false }).order("created_at", { ascending: false });
  } else if (sort === "amount_asc") {
    donationQuery = donationQuery.order("amount", { ascending: true }).order("created_at", { ascending: false });
  } else if (sort === "oldest") {
    donationQuery = donationQuery.order("created_at", { ascending: true });
  } else {
    // newest (default)
    donationQuery = donationQuery.order("created_at", { ascending: false });
  }

  donationQuery = donationQuery.range(from, from + PAGE_SIZE - 1);

  const { data: donations, count } = await donationQuery;

  return (
    <DonationsClient
      fundraiserId={id}
      fundraiserTitle={fundraiser.title ?? "Fundraiser"}
      donations={((donations ?? []) as DonationRow[])}
      totalCount={count ?? 0}
      pageSize={PAGE_SIZE}
      currentPage={pageNum}
      currentQ={q}
      currentStatus={status}
      currentSort={sort}
      metrics={metrics}
    />
  );
}
