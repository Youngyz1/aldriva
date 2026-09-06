import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Idempotent cron/scheduled retention job for completed events.
 * Purges private invitation PII, photos, and secrets while preserving
 * immutable audit history (event_id, ticket_instance_id, checked_in_at, seat_id, status).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const defaultRetentionDays = 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - defaultRetentionDays);

  try {
    // 1. Find ended events past retention threshold
    const { data: expiredInvitations, error: fetchErr } = await admin
      .from("event_invitations")
      .select("id, event_id, image_url, token, created_at")
      .in("lifecycle_state", ["EVENT_ENDED", "RETENTION"])
      .lt("created_at", cutoffDate.toISOString());

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!expiredInvitations || expiredInvitations.length === 0) {
      return NextResponse.json({
        success: true,
        purgedCount: 0,
        message: "No expired invitations eligible for retention purge.",
      });
    }

    const invitationIds = expiredInvitations.map((i) => i.id);

    // 2. Anonymize/purge private fields while keeping foreign keys and audit history intact
    const { error: updateErr } = await admin
      .from("event_invitations")
      .update({
        email: null,
        phone: null,
        image_url: null,
        personal_message: null,
        notes: "[PURGED_AFTER_RETENTION]",
        lifecycle_state: "PURGED",
      })
      .in("id", invitationIds);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      purgedCount: invitationIds.length,
      message: `Successfully purged private invitation data for ${invitationIds.length} expired records.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Retention cleanup failed." }, { status: 500 });
  }
}
