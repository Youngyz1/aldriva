import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isInvitationEvent } from "@/lib/invitation-events";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: eventId } = await params;
    const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
    if (!canManage) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to manage this event's invitation design." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { invitationTemplateId } = body;

    const admin = createSupabaseAdmin();

    // Round 4 Rule 1: invitation design serves invitation-kind events only.
    const { data: kindRow } = await admin.from("events").select("kind").eq("id", eventId).maybeSingle();
    if (!isInvitationEvent(kindRow as { kind?: string | null } | null)) {
      return NextResponse.json(
        { error: "Invitation design is available only for invitation events." },
        { status: 404 }
      );
    }

    const { error: updateErr } = await admin
      .from("events")
      .update({
        invitation_template_id: invitationTemplateId || null,
      })
      .eq("id", eventId);

    if (updateErr) {
      console.error("[invitation-design] Update failed:", updateErr);
      return NextResponse.json(
        { error: "Failed to update invitation template." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      invitationTemplateId: invitationTemplateId || null,
      message: "Invitation design template updated successfully.",
    });
  } catch (err: any) {
    console.error("[invitation-design] Unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
