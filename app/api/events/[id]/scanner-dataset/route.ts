import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { verifyScannerToken } from "@/lib/offline-scanner-token";

export interface OfflineTicketRecord {
  instance_id: string;
  order_id?: string | null;
  qr_code: string;
  status: "valid" | "used" | "cancelled" | "refunded";
  checked_in_at?: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  guest_title: string | null;
  organization: string | null;
  tier_name: string | null;
  seat_label: string | null;
  image_url: string | null;
  source: "purchase" | "invitation";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const admin = createSupabaseAdmin();

    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");

    // 1. Try Bearer token (first as Supabase Auth token, then as signed scanner-token)
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      const { data: authData } = await admin.auth.getUser(token);
      if (authData?.user) {
        userId = authData.user.id;
      } else {
        const verifiedScannerToken = verifyScannerToken(token, eventId);
        if (verifiedScannerToken.valid && verifiedScannerToken.payload && verifiedScannerToken.payload.eventId === eventId) {
          userId = verifiedScannerToken.payload.userId;
        }
      }
    }

    // 2. Fall back to cookie session
    if (!userId) {
      const supabase = await createSupabaseServer();
      const { data: serverAuth } = await supabase.auth.getUser();
      userId = serverAuth?.user?.id ?? null;
    }

    if (!userId) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    // 3. Check access
    const canScan = await hasEventOrOrganizerAccess(userId, eventId, ["event_manager", "ticket_scanner"]);
    if (!canScan) {
      return NextResponse.json(
        { error: "You do not have permission to download ticket dataset for this event." },
        { status: 403 }
      );
    }

    // Check if user has event_manager or higher access (for PII / email suppression)
    const hasManagerAccess = await hasEventOrOrganizerAccess(userId, eventId, ["event_manager"]);
    const suppressEmail = !hasManagerAccess;

    // 4. Fetch event info
    const { data: event, error: eventErr } = await admin
      .from("events")
      .select("id, title, event_date, venue, city")
      .eq("id", eventId)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    // 5. Fetch all ticket_instances for event
    const { data: instances, error: instErr } = await admin
      .from("ticket_instances")
      .select(`
        id,
        qr_code,
        status,
        checked_in_at,
        seat_label,
        source,
        ticket_id,
        order_id,
        invitation_id,
        ticket_orders (
          id,
          buyer_name,
          buyer_email
        ),
        event_invitations (
          id,
          guest_name,
          guest_title,
          organization,
          email,
          phone,
          image_url
        )
      `)
      .eq("event_id", eventId);

    if (instErr) {
      return NextResponse.json({ error: instErr.message }, { status: 500 });
    }

    // 6. Hydrate ticket tier names
    const ticketIds = Array.from(
      new Set((instances || []).map((i) => i.ticket_id).filter(Boolean) as string[])
    );
    const { data: dbTickets } = ticketIds.length
      ? await admin.from("tickets").select("id, name").in("id", ticketIds)
      : { data: [] };

    const ticketNameMap = new Map((dbTickets || []).map((t) => [t.id, t.name]));

    // 7. Transform to minimal offline shape
    const tickets: OfflineTicketRecord[] = (instances || []).map((inst) => {
      const isInvitation = inst.source === "invitation" || !!inst.invitation_id;
      const order = inst.ticket_orders as any;
      const invitation = inst.event_invitations as any;

      let tierName = "Standard Entry";
      if (inst.ticket_id && ticketNameMap.has(inst.ticket_id)) {
        tierName = ticketNameMap.get(inst.ticket_id)!;
      } else if (isInvitation) {
        tierName = invitation?.guest_title ? `VIP Guest (${invitation.guest_title})` : "Guest Invitation";
      }

      const buyerName = isInvitation
        ? (invitation?.guest_name || "Invited Guest")
        : (order?.buyer_name || "Guest");

      const buyerEmail = suppressEmail
        ? null
        : isInvitation
        ? (invitation?.email || null)
        : (order?.buyer_email || null);

      return {
        instance_id: inst.id,
        order_id: inst.order_id || null,
        qr_code: inst.qr_code ? inst.qr_code.trim().toUpperCase() : "",
        status: inst.status as OfflineTicketRecord["status"],
        checked_in_at: inst.checked_in_at || null,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        guest_title: isInvitation ? (invitation?.guest_title || null) : null,
        organization: isInvitation ? (invitation?.organization || null) : null,
        tier_name: tierName,
        seat_label: inst.seat_label || null,
        image_url: isInvitation ? (invitation?.image_url || null) : null,
        source: isInvitation ? "invitation" : "purchase",
      };
    });

    // 8. Compute expires_at: max(event_date + 6h, download_time + 24h)
    const downloadTime = Date.now();
    let eventTime = downloadTime;
    if (event.event_date) {
      const parsed = new Date(event.event_date).getTime();
      if (!isNaN(parsed)) eventTime = parsed;
    }
    const expiresAt = Math.max(eventTime + 6 * 3600 * 1000, downloadTime + 24 * 3600 * 1000);

    return NextResponse.json({
      success: true,
      user_id: userId,
      event_id: event.id,
      event_title: event.title,
      event_date: event.event_date,
      venue: event.venue,
      city: event.city,
      total_count: tickets.length,
      downloaded_at: new Date(downloadTime).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
      tickets,
    });
  } catch (err: unknown) {
    console.error("[scanner-dataset]", err);
    return NextResponse.json({ error: "Could not generate scanner dataset." }, { status: 500 });
  }
}
