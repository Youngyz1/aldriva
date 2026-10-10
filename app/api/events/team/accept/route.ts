import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { sanitizeOptionalLabel, STAFF_NAME_MAX } from "@/lib/staff/staff-labels";
import { hashInviteToken } from "@/lib/staff/invite-tokens";

type InviteRow = {
  id: string;
  event_id: string;
  email: string;
  role: string;
  role_label: string | null;
  position_label: string | null;
  staff_name: string | null;
  entrance_id: string | null;
  invited_by: string | null;
  status: string;
  expires_at: string;
};

async function getSessionUser() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Shared guards: pending + unexpired + email match. No state change.
function guardInvite(invite: InviteRow, userEmail: string) {
  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: `This invitation has already been ${invite.status}.` },
      { status: 409 }
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invitation link has expired." }, { status: 410 });
  }

  if (invite.email.toLowerCase() !== userEmail) {
    return NextResponse.json(
      { error: `This invitation was sent to ${invite.email}. Please sign in with that email address.` },
      { status: 403 }
    );
  }

  return null;
}

// GET /api/events/team/accept?token=… — preview the invitation (email,
// permission, labels, organizer-entered name) before accepting. Same
// guards as POST, no state change. The invitee confirms or edits only
// their display name on the accept page.
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();

    if (!user || !user.email) {
      return NextResponse.json(
        { error: "You must be signed in to view an invitation." },
        { status: 401 }
      );
    }

    const token = req.nextUrl.searchParams.get("token")?.trim();

    if (!token) {
      return NextResponse.json({ error: "Missing invitation token." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const normalizedUserEmail = user.email.trim().toLowerCase();

    // Hash-compare: only token_hash is stored (migration 166).
    const { data: invite, error: fetchErr } = await admin
      .from("event_team_invitations")
      .select("id, event_id, email, role, role_label, position_label, staff_name, entrance_id, invited_by, status, expires_at")
      .eq("token_hash", hashInviteToken(token))
      .maybeSingle();

    if (fetchErr || !invite) {
      return NextResponse.json(
        { error: "Invitation link is invalid or does not exist." },
        { status: 404 }
      );
    }

    const blocked = guardInvite(invite as InviteRow, normalizedUserEmail);
    if (blocked) return blocked;

    const row = invite as InviteRow;
    return NextResponse.json({
      ok: true,
      email: row.email,
      eventId: row.event_id,
      role: row.role,
      roleLabel: row.role_label,
      positionLabel: row.position_label,
      staffName: row.staff_name,
    });
  } catch (err: unknown) {
    console.error("[events/team/accept]", err);
    return NextResponse.json({ error: "Could not load the invitation. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();

    if (!user || !user.email) {
      return NextResponse.json(
        { error: "You must be signed in to accept an invitation." },
        { status: 401 }
      );
    }

    const body = await req.json();
    // Only the link token and the invitee's own display name are honored.
    // role / roleLabel / positionLabel in the body are ignored: the
    // permission level and labels come from the invitation row, never
    // from the invitee.
    const token = body.token?.trim();
    const staffNameInput = sanitizeOptionalLabel(body.staffName, STAFF_NAME_MAX);

    if (!token) {
      return NextResponse.json({ error: "Missing invitation token." }, { status: 400 });
    }

    if (!staffNameInput.ok) {
      return NextResponse.json(
        { error: "Staff name must be 120 characters or fewer." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdmin();
    const normalizedUserEmail = user.email.trim().toLowerCase();

    // 1. Fetch pending invitation by token hash (migration 166).
    const { data: invite, error: fetchErr } = await admin
      .from("event_team_invitations")
      .select("id, event_id, email, role, role_label, position_label, staff_name, entrance_id, invited_by, status, expires_at")
      .eq("token_hash", hashInviteToken(token))
      .maybeSingle();

    if (fetchErr || !invite) {
      return NextResponse.json(
        { error: "Invitation link is invalid or does not exist." },
        { status: 404 }
      );
    }

    const row = invite as InviteRow;

    if (row.status !== "pending") {
      return NextResponse.json(
        { error: `This invitation has already been ${row.status}.` },
        { status: 409 }
      );
    }

    if (new Date(row.expires_at) < new Date()) {
      await admin
        .from("event_team_invitations")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", row.id);

      return NextResponse.json({ error: "This invitation link has expired." }, { status: 410 });
    }

    // 2. Security Check: Authenticated user's verified email must match invitation email exactly
    if (row.email.toLowerCase() !== normalizedUserEmail) {
      return NextResponse.json(
        { error: `This invitation was sent to ${row.email}. Please sign in with that email address.` },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    // Invitee-confirmed display name wins; otherwise the organizer value.
    const staffName = staffNameInput.value ?? row.staff_name;

    // 3. Atomic conditional update of invitation status to prevent race conditions
    const { data: updatedInvite } = await admin
      .from("event_team_invitations")
      .update({
        status: "accepted",
        staff_name: staffName,
        accepted_at: now,
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (!updatedInvite) {
      return NextResponse.json(
        { error: "This invitation link is no longer valid or has already been accepted." },
        { status: 409 }
      );
    }

    // 4. Upsert active member row into event_team_members (labels + name
    // copied; permission level copied from the fixed role enum; no badge).
    const { data: member, error: memberErr } = await admin
      .from("event_team_members")
      .upsert(
        {
          event_id: row.event_id,
          user_id: user.id,
          role: row.role,
          role_label: row.role_label,
          position_label: row.position_label,
          staff_name: staffName,
          entrance_id: row.entrance_id,
          status: "active",
          invited_by: row.invited_by,
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
      eventId: row.event_id,
      role: row.role,
      roleLabel: row.role_label,
      positionLabel: row.position_label,
      staffName,
    });
  } catch (err: unknown) {
    console.error("[events/team/accept]", err);
    return NextResponse.json({ error: "Could not accept the invitation. Please try again." }, { status: 500 });
  }
}
