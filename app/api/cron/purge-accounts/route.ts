import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/dashboard-context";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

/**
 * Ends the 14-day account-deletion grace period.
 *
 * SOFT DELETE, BY DESIGN. This job flips `pending_deletion` → `purged` and
 * nothing else. It deliberately does NOT:
 *   - scrub profile, organizer, fundraiser or event fields
 *   - call auth.admin.deleteUser()
 *
 * An earlier version did both. That was removed on purpose: the row and all
 * associated data are retained indefinitely for fraud and dispute
 * investigation, and destroying the auth user made the state irreversible even
 * for an admin. Inaccessibility is enforced at the application layer instead —
 * proxy.ts blocks `pending_deletion` and `purged` from signing in, and the
 * public queries already filter on `deleted_at`.
 *
 * This is a deliberate retention decision, not an oversight. A longer-term
 * purge policy can be layered on later if compliance requires it; that is
 * explicitly out of scope here. Do not "restore" the scrubbing without one.
 *
 * `deleted_at` is left in place as the tombstone. `purge_at` is cleared so the
 * row stops matching this job's selector on subsequent nightly runs.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  try {
    // Scoped to pending_deletion so a row that an admin revoked mid-window is
    // never caught by a later run, even if purge_at was somehow left behind.
    const { data: due, error: dueError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("status", "pending_deletion")
      .not("purge_at", "is", null)
      .lte("purge_at", now);

    if (dueError) {
      throw new Error(`Failed to query profiles: ${dueError.message}`);
    }

    const ids = (due ?? []).map((row) => row.id);
    console.log(`[PurgeAccounts Cron] ${ids.length} account(s) past their grace period.`);

    if (ids.length === 0) {
      return NextResponse.json({ success: true, purged: 0, failed: 0 });
    }

    // Single statement rather than a loop: there is only one write per account
    // now, so there is nothing to sequence and nothing to partially fail.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        status: "purged",
        // deleted_at stays — it is the tombstone the public queries filter on.
        purge_at: null,
        updated_at: now,
      })
      .in("id", ids)
      .select("id");

    // Checked, not swallowed. supabase-js resolves with { data, error } rather
    // than throwing, so an unchecked write here would report a clean run while
    // leaving every account stuck in pending_deletion forever.
    if (updateError) {
      throw new Error(`Failed to mark accounts purged: ${updateError.message}`);
    }

    const purged = updated?.length ?? 0;
    console.log(`[PurgeAccounts Cron] Marked ${purged} account(s) purged.`);

    return NextResponse.json({
      success: purged === ids.length,
      purged,
      failed: ids.length - purged,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PurgeAccounts Cron] Fatal error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
