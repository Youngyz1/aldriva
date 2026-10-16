import { notFound } from "next/navigation";
import { assertCanManageFundraiser } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getFundraiserDonationStats,
  type CurrencyTotal,
  type StatsDonorRecord,
} from "@/lib/fundraiser-dashboard";
import DonorsClient from "./DonorsClient";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DonorDonation = {
  id: string;
  amount: number;
  currency: string;
  status: string | null;
  created_at: string;
};

export type DonorRecord = {
  key: string;           // grouping key (internal, not displayed)
  displayName: string;   // donor_name or 'Anonymous'
  isAnonymous: boolean;
  donationCount: number;
  totalGiven: number;    // sum of primary-currency gifts
  totalsPerCurrency: CurrencyTotal[];
  avgGift: number;
  firstDonation: string;
  lastDonation: string;
  isRepeat: boolean;
  donations: DonorDonation[];
};

export type DonorMetrics = {
  totalDonors: number;
  totalGiven: number;
  avgDonorValue: number;
  repeatDonors: number;
  primaryCurrency: string;
  totalsPerCurrency: CurrencyTotal[];
};

// ── Donor aggregation now lives in the shared stats computer ───────────────
// (lib/fundraiser-dashboard.ts): one rule — user_id, else normalized email,
// else normalized name, else per-row anonymous. Kept here as a thin adapter
// so donor rows carry the page's display shape.
function toDonorRecord(rec: StatsDonorRecord): DonorRecord {
  return {
    key: rec.key,
    displayName: rec.displayName,
    isAnonymous: rec.isAnonymous,
    donationCount: rec.donationCount,
    totalGiven: rec.totalGiven,
    totalsPerCurrency: rec.totalsPerCurrency,
    avgGift: rec.avgGift,
    firstDonation: rec.firstDonation,
    lastDonation: rec.lastDonation,
    isRepeat: rec.isRepeat,
    donations: rec.donations.map((d) => ({
      id: d.id,
      amount: d.amount,
      currency: d.currency,
      status: d.status,
      created_at: d.created_at,
    })),
  };
}

// ── Sort ─────────────────────────────────────────────────────────────────────

const VALID_SORTS = ["total_desc", "total_asc", "count_desc", "newest", "oldest"] as const;

function sortDonors(donors: DonorRecord[], sort: string): DonorRecord[] {
  return [...donors].sort((a, b) => {
    switch (sort) {
      case "total_asc":   return a.totalGiven - b.totalGiven;
      case "count_desc":  return b.donationCount - a.donationCount;
      case "newest":      return new Date(b.lastDonation).getTime() - new Date(a.lastDonation).getTime();
      case "oldest":      return new Date(a.firstDonation).getTime() - new Date(b.firstDonation).getTime();
      case "total_desc":
      default:            return b.totalGiven - a.totalGiven;
    }
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default async function FundraiserDonorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const { id } = await params;
  const auth = await assertCanManageFundraiser(id);
  if (!auth.ok) return notFound();

  const admin = createSupabaseAdmin();

  // Fundraiser name for header
  const { data: fundraiser } = await admin
    .from("fundraisers")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (!fundraiser) return notFound();

  // Fetch + aggregate through the ONE shared stats computer (completed /
  // succeeded only — the same rows the overview and donations pages count).
  // Limit 2000 as practical bound — large fundraisers should use an RPC in future
  const stats = await getFundraiserDonationStats(admin, id);

  // Aggregate into donor records (server-side, shared grouping rule)
  let allDonors = stats.donorRecords.map(toDonorRecord);

  // Parse searchParams
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const rawSort = sp.sort ?? "total_desc";
  const sort = VALID_SORTS.includes(rawSort as typeof VALID_SORTS[number]) ? rawSort : "total_desc";
  const pageNum = Math.max(1, parseInt(sp.page ?? "1") || 1);

  // Apply search
  if (q) {
    allDonors = allDonors.filter((d) => d.displayName.toLowerCase().includes(q));
  }

  // Apply sort
  allDonors = sortDonors(allDonors, sort);

  // Summary metrics (from the shared stats for the fundraiser)
  const totalDonors = stats.donorCount;
  const totalGiven = stats.totalsPerCurrency[0]?.total ?? 0;
  const avgDonorValue = totalDonors > 0 ? Math.round(totalGiven / totalDonors) : 0;
  const repeatDonors = stats.donorRecords.filter((d) => d.isRepeat).length;

  const metrics: DonorMetrics = {
    totalDonors,
    totalGiven,
    avgDonorValue,
    repeatDonors,
    primaryCurrency: stats.primaryCurrency,
    totalsPerCurrency: stats.totalsPerCurrency,
  };

  // Paginate AFTER aggregation + search + sort
  const totalCount = allDonors.length;
  const from = (pageNum - 1) * PAGE_SIZE;
  const donors = allDonors.slice(from, from + PAGE_SIZE);

  return (
    <DonorsClient
      fundraiserId={id}
      fundraiserTitle={fundraiser.title ?? "Fundraiser"}
      donors={donors}
      totalCount={totalCount}
      pageSize={PAGE_SIZE}
      currentPage={pageNum}
      currentQ={sp.q ?? ""}
      currentSort={sort}
      metrics={metrics}
    />
  );
}
