import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess, getEventTeamRole, EVENT_SCAN_ENTITY_ROLES } from "@/lib/event-auth";
import { signScannerToken, signScannerTokenV2 } from "@/lib/offline-scanner-token";

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

    const canScan = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager", "ticket_scanner"], EVENT_SCAN_ENTITY_ROLES);
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

    const { data: ev } = await admin.from("events").select("organizer_id").eq("id", eventId).maybeSingle();
    const orgId = ev?.organizer_id ?? null;

    // Issue signed 8-hour token. v2 minting is gated by env flag; capabilities
    // are computed server-side from the caller's role and cannot be requested.
    const v2 = process.env.SCANNER_TOKEN_V2_MINT === "1";
    let token: string;
    let expiresAt: number;
    if (v2) {
      const { token: t, expiresAt: e } = signScannerTokenV2({
        codeType: ["ticket"],
        scope: { event_id: eventId, ...(orgId ? { tenant_id: orgId } : {}) },
        actor: { user_id: user.id, role },
        actions: ["check_in"],
        entranceId,
        durationHours: 8,
      });
      token = t;
      expiresAt = e;
    } else {
      const r = signScannerToken({ userId: user.id, eventId, role, entranceId, durationHours: 8 });
      token = r.token;
      expiresAt = r.expiresAt;
    }

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
