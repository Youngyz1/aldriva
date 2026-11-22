import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess, EVENT_SCAN_ENTITY_ROLES } from "@/lib/event-auth";
import { resolveScannerPrincipal } from "@/lib/scanner/resolve-principal";

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
  const requestId = randomUUID();
  try {
    const { id: eventId } = await params;
    const admin = createSupabaseAdmin();

    const resolved = await resolveScannerPrincipal(req, {
      eventId,
      requires: { codeType: "ticket", action: "check_in" },
      requestId,
    });
    if (!resolved.ok) {
      const msg = resolved.code === "scanner_token_revoked"
        ? "Scanner access was revoked. Ask the organizer for a new invitation."
        : resolved.code === "not_signed_in" ? "Not signed in." : "Permission denied.";
      return NextResponse.json(
        resolved.code === "scanner_token_revoked"
          ? { error: msg, code: "scanner_token_revoked" }
          : { error: msg },
        { status: resolved.status, headers: { "Cache-Control": "no-store, private" } }
      );
    }
    // user_id must only ever carry an auth.users id. A guest (account-less)
    // principal has no such id - its staff identity is returned separately
    // as staff_member_id, never disguised as user_id downstream consumers
    // may feed into a column with an auth.users foreign key.
    const userId = resolved.principal.userId ?? null;
    const staffMemberId = resolved.principal.userId ? null : resolved.principal.staffMemberId ?? null;

    // Check if user has event_manager or higher access (for PII / email suppression).
    // A staff-member/guest principal has no account id to check; it never has
    // manager-level access, so email stays suppressed for it.
    const hasManagerAccess = resolved.principal.userId
      ? await hasEventOrOrganizerAccess(resolved.principal.userId, eventId, ["event_manager"], EVENT_SCAN_ENTITY_ROLES)
      : false;
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
      const order = Array.isArray(inst.ticket_orders) ? inst.ticket_orders[0] : inst.ticket_orders;
      const invitation = Array.isArray(inst.event_invitations) ? inst.event_invitations[0] : inst.event_invitations;

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
      staff_member_id: staffMemberId,
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
