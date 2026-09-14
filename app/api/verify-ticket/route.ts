import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — server misconfiguration.");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getCurrentUserId(req: NextRequest) {
  // Check Authorization Bearer header first (useful for API & scanner tests)
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) return user.id;
  }

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function canManageEvent(userId: string | null, eventId: string | null) {
  if (!userId || !eventId) return false;
  return await hasEventOrOrganizerAccess(userId, eventId);
}

// Helper to look up ticket_instance (or legacy ticket_order) by QR code
async function findTicketByCode(code: string) {
  const cleanCode = code.trim().replace(/\/+$/, "").toUpperCase();

  // 1. Try querying ticket_instances first
  const { data: inst } = await supabaseAdmin
    .from("ticket_instances")
    .select(`
      id,
      order_id,
      invitation_id,
      source,
      event_id,
      ticket_id,
      seat_label,
      qr_code,
      status,
      checked_in_at,
      created_at,
      ticket_orders (
        id,
        buyer_name,
        buyer_email,
        total_amount,
        quantity
      ),
      event_invitations (
        id,
        guest_name,
        guest_title,
        organization,
        email,
        phone,
        image_url
      ),
      events (
        title,
        event_date,
        venue,
        city,
        banner,
        ticket_template
      )
    `)
    .eq("qr_code", cleanCode)
    .maybeSingle();

  if (inst) {
    const isInvitation = inst.source === "invitation" || !!inst.invitation_id;
    const orderData = inst.ticket_orders as any;
    const invitationData = inst.event_invitations as any;
    const eventData = inst.events as any;

    let tierName = isInvitation ? "Guest Invitation" : "Standard Entry";
    if (inst.ticket_id) {
      const { data: t } = await supabaseAdmin
        .from("tickets")
        .select("name")
        .eq("id", inst.ticket_id)
        .maybeSingle();
      if (t?.name) tierName = t.name;
    } else if (isInvitation && invitationData?.guest_title) {
      tierName = `VIP Guest (${invitationData.guest_title})`;
    }

    const displayName = isInvitation
      ? (invitationData?.guest_name || "Invited Guest")
      : (orderData?.buyer_name || null);
    const displayEmail = isInvitation
      ? (invitationData?.email || null)
      : (orderData?.buyer_email || null);

    return {
      instanceId: inst.id,
      orderId: inst.order_id,
      invitationId: inst.invitation_id || null,
      source: isInvitation ? "invitation" : "purchase",
      eventId: inst.event_id,
      qrCode: inst.qr_code,
      status: inst.status,
      checkedInAt: inst.checked_in_at,
      seatLabel: inst.seat_label,
      tierName,
      buyerName: displayName,
      buyerEmail: displayEmail,
      invitation: isInvitation ? invitationData : null,
      order: {
        id: inst.order_id || inst.invitation_id || inst.id,
        instance_id: inst.id,
        status: inst.status,
        seat_label: inst.seat_label,
        quantity: 1,
        tier_name: tierName,
        source: isInvitation ? "invitation" : "purchase",
        buyer_name: displayName,
        buyer_email: displayEmail,
        guest_title: invitationData?.guest_title || null,
        organization: invitationData?.organization || null,
        phone: invitationData?.phone || null,
        image_url: invitationData?.image_url || null,
        total_amount: orderData?.total_amount || 0,
        created_at: inst.created_at,
        checked_in_at: inst.checked_in_at,
        event_id: inst.event_id,
        events: eventData || null,
      },
    };
  }

  // 2. Legacy fallback to ticket_orders.qr_code
  const { data: legacyOrder } = await supabaseAdmin
    .from("ticket_orders")
    .select(`
      id,
      status,
      seat_label,
      quantity,
      buyer_name,
      buyer_email,
      total_amount,
      created_at,
      checked_in_at,
      event_id,
      ticket_id,
      events (
        title,
        event_date,
        venue,
        city,
        banner,
        ticket_template
      )
    `)
    .eq("qr_code", cleanCode)
    .maybeSingle();

  if (!legacyOrder) return null;

  // Check if ticket_instances row exists for this legacy order
  const { data: legacyInst } = await supabaseAdmin
    .from("ticket_instances")
    .select("id, status, checked_in_at")
    .eq("order_id", legacyOrder.id)
    .maybeSingle();

  let tierName = "Standard Entry";
  if (legacyOrder.ticket_id) {
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select("name")
      .eq("id", legacyOrder.ticket_id)
      .maybeSingle();
    if (t?.name) tierName = t.name;
  }

  const eventData = legacyOrder.events as any;

  return {
    instanceId: legacyInst?.id || legacyOrder.id,
    orderId: legacyOrder.id,
    eventId: legacyOrder.event_id,
    qrCode: code,
    status: legacyInst?.status || legacyOrder.status,
    checkedInAt: legacyInst?.checked_in_at || legacyOrder.checked_in_at,
    seatLabel: legacyOrder.seat_label,
    tierName,
    buyerName: legacyOrder.buyer_name || null,
    buyerEmail: legacyOrder.buyer_email || null,
    order: {
      id: legacyOrder.id,
      instance_id: legacyInst?.id || legacyOrder.id,
      status: legacyInst?.status || legacyOrder.status,
      seat_label: legacyOrder.seat_label,
      quantity: legacyOrder.quantity,
      tier_name: tierName,
      buyer_name: legacyOrder.buyer_name || null,
      buyer_email: legacyOrder.buyer_email || null,
      total_amount: legacyOrder.total_amount || 0,
      created_at: legacyOrder.created_at,
      checked_in_at: legacyInst?.checked_in_at || legacyOrder.checked_in_at,
      event_id: legacyOrder.event_id,
      events: eventData || null,
    },
  };
}

// GET /api/verify-ticket?code=XXXXX — look up ticket status
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") || req.nextUrl.searchParams.get("qr");

  if (!code) {
    return NextResponse.json({ error: "No code provided." }, { status: 400 });
  }

  const ticketData = await findTicketByCode(code);

  if (!ticketData) {
    return NextResponse.json({ error: "Ticket not found.", valid: false }, { status: 404 });
  }

  const userId = await getCurrentUserId(req);
  const canCheckIn = await canManageEvent(userId, ticketData.eventId);
  const hasFullManagerAccess = userId ? await hasEventOrOrganizerAccess(userId, ticketData.eventId, ["event_manager"]) : false;

  // Scanner PII suppression: suppress email, phone, and financial amounts for scanner-only or unauthenticated lookups
  const sanitizedOrder = { ...ticketData.order };
  if (!hasFullManagerAccess) {
    sanitizedOrder.buyer_email = null;
    sanitizedOrder.phone = null;
    sanitizedOrder.total_amount = 0;
  }

  return NextResponse.json({
    valid: ticketData.status === "valid",
    order: sanitizedOrder,
    authenticated: Boolean(userId),
    can_check_in: canCheckIn,
  });
}

// POST /api/verify-ticket — check in a ticket (mark as used)
export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Ticket verification is not configured." }, { status: 500 });
    }

    const { code, action, eventId } = await req.json();

    if (!code) {
      return NextResponse.json({ error: "No code provided." }, { status: 400 });
    }

    const ticketData = await findTicketByCode(code);

    if (!ticketData) {
      return NextResponse.json({ error: "Ticket not found.", valid: false }, { status: 404 });
    }

    if (eventId && ticketData.eventId !== eventId) {
      return NextResponse.json(
        {
          success: false,
          error: "WRONG_EVENT",
          message: "This ticket belongs to a different event.",
          status: "wrong_event",
          order: ticketData.order,
        },
        { status: 400 }
      );
    }

    if (action === "checkin") {
      const userId = await getCurrentUserId(req);

      if (!userId) {
        return NextResponse.json(
          { success: false, message: "Log in as authorized door staff or event organizer to check in guests." },
          { status: 401 }
        );
      }

      const canCheckIn = await canManageEvent(userId, ticketData.eventId);

      if (!canCheckIn) {
        return NextResponse.json(
          { success: false, message: "You do not have permission to check in this ticket." },
          { status: 403 }
        );
      }

      // Call atomic check_in_ticket RPC with ticket_instance_id and scanner user attribution
      const { error: rpcError } = await supabaseAdmin.rpc("check_in_ticket", {
        p_ticket_instance_id: ticketData.instanceId,
        p_scanned_by_user_id: userId,
      });

      if (rpcError) {
        const msg = rpcError.message || "";
        if (msg.includes("ALREADY_CHECKED_IN")) {
          return NextResponse.json({
            success: false,
            message: "Ticket already used.",
            status: "used",
            order: ticketData.order,
          });
        }
        if (msg.includes("TICKET_CANCELLED")) {
          return NextResponse.json({
            success: false,
            message: "Ticket is cancelled.",
            status: "cancelled",
            order: ticketData.order,
          });
        }
        if (msg.includes("TICKET_REFUNDED")) {
          return NextResponse.json({
            success: false,
            message: "Ticket is refunded.",
            status: "refunded",
            order: ticketData.order,
          });
        }
        if (msg.includes("TICKET_NOT_FOUND")) {
          return NextResponse.json({ error: "Ticket not found.", valid: false }, { status: 404 });
        }
        return NextResponse.json(
          { success: false, message: "Could not check in this ticket." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Ticket checked in successfully!",
        status: "used",
        order: { ...ticketData.order, status: "used", checked_in_at: new Date().toISOString() },
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err: unknown) {
    console.error("[verify-ticket]", err);
    return NextResponse.json({ error: "Could not verify the ticket. Please try again." }, { status: 500 });
  }
}
