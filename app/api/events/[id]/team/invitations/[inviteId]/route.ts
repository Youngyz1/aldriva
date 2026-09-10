import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    const { id: eventId, inviteId } = await params;
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
    if (!canManage) {
      return NextResponse.json(
        { error: "You do not have permission to cancel invitations for this event." },
        { status: 403 }
      );
    }

    const admin = createSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: updatedInvite, error: updateErr } = await admin
      .from("event_team_invitations")
      .update({
        status: "revoked",
        updated_at: now,
      })
      .eq("id", inviteId)
      .eq("event_id", eventId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    if (!updatedInvite) {
      return NextResponse.json(
        { error: "Invitation not found or no longer pending." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Invitation cancelled successfully." });
  } catch (err: unknown) {
    console.error("[events/[id]/team/invitations]", err);
    return NextResponse.json({ error: "Could not process the invitation. Please try again." }, { status: 500 });
  }
}
