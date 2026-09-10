import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json(
        { error: "You must be signed in to accept an invitation." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const token = body.token?.trim();

    if (!token) {
      return NextResponse.json({ error: "Missing invitation token." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const normalizedUserEmail = user.email.trim().toLowerCase();

    // 1. Fetch pending invitation by token
    const { data: invite, error: fetchErr } = await admin
      .from("event_team_invitations")
      .select("id, event_id, email, role, entrance_id, invited_by, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (fetchErr || !invite) {
      return NextResponse.json(
        { error: "Invitation link is invalid or does not exist." },
        { status: 404 }
      );
    }

    if (invite.status !== "pending") {
      return NextResponse.json(
        { error: `This invitation has already been ${invite.status}.` },
        { status: 409 }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      await admin
        .from("event_team_invitations")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", invite.id);

      return NextResponse.json({ error: "This invitation link has expired." }, { status: 410 });
    }

    // 2. Security Check: Authenticated user's verified email must match invitation email exactly
    if (invite.email.toLowerCase() !== normalizedUserEmail) {
      return NextResponse.json(
        { error: `This invitation was sent to ${invite.email}. Please sign in with that email address.` },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    // 3. Atomic conditional update of invitation status to prevent race conditions
    const { data: updatedInvite } = await admin
      .from("event_team_invitations")
      .update({
        status: "accepted",
        accepted_at: now,
        updated_at: now,
      })
      .eq("id", invite.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (!updatedInvite) {
      return NextResponse.json(
        { error: "This invitation link is no longer valid or has already been accepted." },
        { status: 409 }
      );
    }

    // 4. Upsert active member row into event_team_members
    const { data: member, error: memberErr } = await admin
      .from("event_team_members")
      .upsert(
        {
          event_id: invite.event_id,
          user_id: user.id,
          role: invite.role,
          entrance_id: invite.entrance_id,
          status: "active",
          invited_by: invite.invited_by,
          accepted_at: now,
          updated_at: now,
        },
        { onConflict: "event_id,user_id" }
      )
      .select("id")
      .single();

    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Invitation accepted successfully!",
      memberId: member.id,
      eventId: invite.event_id,
      role: invite.role,
    });
  } catch (err: unknown) {
    console.error("[events/team/accept]", err);
    return NextResponse.json({ error: "Could not accept the invitation. Please try again." }, { status: 500 });
  }
}
