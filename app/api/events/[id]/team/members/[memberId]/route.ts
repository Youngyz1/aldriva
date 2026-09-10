import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: eventId, memberId } = await params;
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
        { error: "You do not have permission to remove team members from this event." },
        { status: 403 }
      );
    }

    const admin = createSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: updatedMember, error: updateErr } = await admin
      .from("event_team_members")
      .update({
        status: "removed",
        removed_at: now,
        updated_at: now,
      })
      .eq("id", memberId)
      .eq("event_id", eventId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    if (!updatedMember) {
      return NextResponse.json(
        { error: "Member not found or already removed." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Team member access revoked successfully." });
  } catch (err: unknown) {
    console.error("[events/[id]/team/members]", err);
    return NextResponse.json({ error: "Could not process the team member. Please try again." }, { status: 500 });
  }
}
