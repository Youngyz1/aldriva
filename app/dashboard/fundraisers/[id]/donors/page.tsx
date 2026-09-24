import { notFound } from "next/navigation";
import { assertCanManageFundraiser } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import DonorsClient from "./DonorsClient";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DonorDonation = {
  id: string;
  amount: number;
  status: string | null;
  created_at: string;
};

export type DonorRecord = {
  key: string;           // grouping key (internal, not displayed)
  displayName: string;   // donor_name or 'Anonymous'
  isAnonymous: boolean;
  donationCount: number;
  totalGiven: number;    // sum of succeeded amounts
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
};

// ── Donor aggregation (server-side) ──────────────────────────────────────────

type RawDonation = {
  id: string;
  donor_name: string | null;
  donor_email: string | null;
  user_id: string | null;
  amount: number | string;
  status: string | null;
  created_at: string;
};

function buildGroupKey(d: RawDonation): string {
  if (d.user_id) return `user:${d.user_id}`;
  if (d.donor_name === "Anonymous" || !d.donor_name) return `anon:${d.id}`;
  return `named:${(d.donor_name ?? "").toLowerCase()}::${(d.donor_email ?? "").toLowerCase()}`;
}

export function aggregateDonors(rawDonations: RawDonation[]): DonorRecord[] {
  const map = new Map<string, DonorRecord>();

  for (const d of rawDonations) {
    const key = buildGroupKey(d);
    const amount = Number(d.amount ?? 0);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        key,
        displayName: d.donor_name === "Anonymous" || !d.donor_name ? "Anonymous" : d.donor_name,
        isAnonymous: d.donor_name === "Anonymous" || !d.donor_name,
        donationCount: 1,
        totalGiven: amount,
        avgGift: amount,
        firstDonation: d.created_at,
        lastDonation: d.created_at,
        isRepeat: false,
        donations: [{ id: d.id, amount, status: d.status, created_at: d.created_at }],
      });
    } else {
      existing.donationCount += 1;
      existing.totalGiven += amount;
      existing.donations.push({ id: d.id, amount, status: d.status, created_at: d.created_at });
      if (d.created_at < existing.firstDonation) existing.firstDonation = d.created_at;
      if (d.created_at > existing.lastDonation) existing.lastDonation = d.created_at;
    }
  }

  // Finalize averages and repeat flag
  for (const rec of map.values()) {
    rec.avgGift = rec.donationCount > 0 ? Math.round(rec.totalGiven / rec.donationCount) : 0;
    rec.isRepeat = rec.donationCount > 1;
    // Sort this donor's own donations newest-first for the detail view
    rec.donations.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  return Array.from(map.values());
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

  // Fetch all donations for this fundraiser (needed for full aggregation)
  // Limit 2000 as practical bound — large fundraisers should use an RPC in future
  const { data: rawData } = await admin
    .from("donations")
    .select("id, donor_name, donor_email, user_id, amount, status, created_at")
    .eq("fundraiser_id", id)
    .or("status.eq.succeeded,status.is.null")
    .order("created_at", { ascending: false })
    .limit(2000);

  const rawDonations = (rawData ?? []) as RawDonation[];

  // Aggregate into donor records (server-side)
  let allDonors = aggregateDonors(rawDonations);

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

  // Summary metrics (from full un-filtered donor list for the fundraiser)
  const allDonorsForMetrics = aggregateDonors(rawDonations);
  const totalDonors = allDonorsForMetrics.length;
  const totalGiven = allDonorsForMetrics.reduce((s, d) => s + d.totalGiven, 0);
  const avgDonorValue = totalDonors > 0 ? Math.round(totalGiven / totalDonors) : 0;
  const repeatDonors = allDonorsForMetrics.filter((d) => d.isRepeat).length;

  const metrics: DonorMetrics = { totalDonors, totalGiven, avgDonorValue, repeatDonors };

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
