import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
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
        { error: "You do not have permission to view team members for this event." },
        { status: 403 }
      );
    }

    const admin = createSupabaseAdmin();

    // Fetch team members
    const { data: rawMembers, error: membersErr } = await admin
      .from("event_team_members")
      .select(`
        id,
        event_id,
        user_id,
        role,
        status,
        invited_by,
        invited_at,
        accepted_at,
        removed_at,
        created_at
      `)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (membersErr) {
      return NextResponse.json({ error: membersErr.message }, { status: 500 });
    }

    // Enrich member profile data
    const userIds = (rawMembers ?? []).map((m) => m.user_id).filter(Boolean) as string[];
    let profilesMap: Record<string, { full_name?: string; email?: string; avatar_url?: string }> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", userIds);

      for (const p of profiles ?? []) {
        profilesMap[p.id] = p;
      }
    }

    const members = (rawMembers ?? []).map((m) => ({
      ...m,
      user_name: m.user_id ? profilesMap[m.user_id]?.full_name || "Team Member" : "Team Member",
      user_email: m.user_id ? profilesMap[m.user_id]?.email || null : null,
      user_avatar: m.user_id ? profilesMap[m.user_id]?.avatar_url || null : null,
    }));

    // Fetch team invitations
    const { data: invitations, error: invErr } = await admin
      .from("event_team_invitations")
      .select(`
        id,
        event_id,
        email,
        role,
        invited_by,
        status,
        expires_at,
        accepted_at,
        created_at,
        updated_at
      `)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (invErr) {
      return NextResponse.json({ error: invErr.message }, { status: 500 });
    }

    return NextResponse.json({
      members,
      invitations: invitations ?? [],
    });
  } catch (err: unknown) {
    console.error("[events/[id]/team]", err);
    return NextResponse.json({ error: "Could not load the team. Please try again." }, { status: 500 });
  }
}
