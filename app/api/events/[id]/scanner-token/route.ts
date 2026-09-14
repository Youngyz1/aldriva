import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess, getEventTeamRole } from "@/lib/event-auth";
import { signScannerToken } from "@/lib/offline-scanner-token";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const admin = createSupabaseAdmin();

    let user: { id: string } | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      const { data: authData } = await admin.auth.getUser(token);
      if (authData?.user) user = authData.user;
    }

    if (!user) {
      const supabase = await createSupabaseServer();
      const { data: serverAuth } = await supabase.auth.getUser();
      user = serverAuth?.user ?? null;
    }

    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const canScan = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager", "ticket_scanner"]);
    if (!canScan) {
      return NextResponse.json(
        { error: "You do not have permission to scan tickets for this event." },
        { status: 403 }
      );
    }

    // Resolve assigned role & entrance_id if part of event_team_members
    const role = (await getEventTeamRole(user.id, eventId)) || "event_manager";
    const { data: memberRow } = await admin
      .from("event_team_members")
      .select("entrance_id")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .maybeSingle();

    const entranceId = memberRow?.entrance_id || null;

    // Issue signed 8-hour token
    const { token, expiresAt } = signScannerToken({
      userId: user.id,
      eventId,
      role,
      entranceId,
      durationHours: 8,
    });

    return NextResponse.json({
      success: true,
      token,
      expires_at: new Date(expiresAt).toISOString(),
      user_id: user.id,
      event_id: eventId,
      role,
      entrance_id: entranceId,
    });
  } catch (err: unknown) {
    console.error("[scanner-token]", err);
    return NextResponse.json({ error: "Could not generate scanner token." }, { status: 500 });
  }
}
