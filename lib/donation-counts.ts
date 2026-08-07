import { createSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Donation counts for a batch of fundraisers, keyed by fundraiser id. One
 * query for the whole batch, not an N+1 per-fundraiser count query.
 *
 * Server-only: uses the service-role client because the anon client (what
 * app/page.tsx's homepage uses for this same query) is blocked by RLS from
 * reading `donations` — that's a pre-existing bug there (homepage donor-count
 * badges never render), not something introduced here. Deliberately kept out
 * of lib/fundraiser-data.ts, which is also imported by a "use client"
 * component (RelatedFundraiserCarousel) — the service-role client must never
 * end up reachable from a client bundle.
 */
export async function getDonationCounts(
  fundraiserIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (fundraiserIds.length === 0) return counts;

  const supabaseAdmin = createSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("donations")
    .select("fundraiser_id")
    .in("fundraiser_id", fundraiserIds)
    .in("status", ["succeeded", "completed"]);

  for (const row of data ?? []) {
    if (row.fundraiser_id) {
      counts.set(row.fundraiser_id, (counts.get(row.fundraiser_id) ?? 0) + 1);
    }
  }

  return counts;
}
