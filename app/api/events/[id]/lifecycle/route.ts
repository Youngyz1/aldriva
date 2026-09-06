import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { logEventAction } from "@/lib/event-audit";

async function getAuthorizedEventId(
  req: NextRequest,
  params: { id: string }
): Promise<{ userId: string; eventId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventId = params.id;
  const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return { userId: user.id, eventId };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthorizedEventId(req, resolvedParams);
  if (auth instanceof NextResponse) return auth;
  const { userId, eventId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }

  const op = body.op as string | undefined;
  const admin = createSupabaseAdmin();

  // ── op: end_event ──────────────────────────────────────────────────────────
  if (op === "end_event") {
    const { error } = await admin
      .from("event_invitations")
      .update({ lifecycle_state: "EVENT_ENDED" })
      .eq("event_id", eventId)
      .neq("lifecycle_state", "PURGED");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also update event status if needed
    await admin.from("events").update({ status: "completed" }).eq("id", eventId);

    await logEventAction({
      eventId,
      actorUserId: userId,
      actorRole: "event_manager",
      action: "lifecycle_transition",
      targetType: "event",
      targetId: eventId,
      metadata: { transition: "EVENT_ENDED" },
    });

    return NextResponse.json({
      success: true,
      message: "Event marked as ended. Invitations transitioned to EVENT_ENDED state.",
    });
  }

  // ── op: retention_purge ────────────────────────────────────────────────────
  if (op === "retention_purge") {
    // Purges private notes and tokens for completed/purged events while preserving ticket instances and financial ledger
    const { error } = await admin
      .from("event_invitations")
      .update({
        lifecycle_state: "PURGED",
        notes: null,
        phone: null,
      })
      .eq("event_id", eventId)
      .eq("lifecycle_state", "EVENT_ENDED");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logEventAction({
      eventId,
      actorUserId: userId,
      actorRole: "event_manager",
      action: "retention_purge",
      targetType: "event",
      targetId: eventId,
      metadata: { retentionPolicy: "post_event_pii_purge" },
    });

    return NextResponse.json({
      success: true,
      message: "Retention purge completed. Private invitation metadata safely cleared while preserving historical records.",
    });
  }

  return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 422 });
}
