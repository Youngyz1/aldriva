import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { hasEventOrOrganizerAccess, EVENT_SCAN_ENTITY_ROLES, EVENT_TEAM_ROLES_SCANNER } from "@/lib/event-auth";
import { MEMORY_QR_SCANNER_MESSAGE, isMemoryQrScan } from "@/lib/memories/tokens";
import {
  recordRejectedTicketScan,
  type TicketScanRejectionReason,
} from "@/lib/staff/scan-attempts";
import { isUuid } from "@/lib/staff/entrance";
import {
  eventStaffSessionCookieName,
  hashEventStaffSessionToken,
  validateEventStaffSession,
} from "@/lib/staff/guest-session";
import { isGuestScannerEnabled } from "@/lib/staff/guest-scanner-flag";

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

// Gates check-in authority only. The PII/manager-access decision at line
// ~290 (hasFullManagerAccess) is a separate, unchanged check.
async function canManageEvent(userId: string | null, eventId: string | null) {
  if (!userId || !eventId) return false;
  return await hasEventOrOrganizerAccess(userId, eventId, EVENT_TEAM_ROLES_SCANNER, EVENT_SCAN_ENTITY_ROLES);
}

type RejectionLog = {
  eventId: string | null | undefined;
  reason: TicketScanRejectionReason;
  userId?: string | null;
  staffMemberId?: string | null;
  ticketInstanceId?: string | null;
  entrance?: string | null;
  requestId: string;
};

/**
 * Every rejection is recorded for the scanner activity screen. This is
 * deliberately fire-and-forget: a slow or failing audit insert must never
 * change the response the door staff see, add latency, or surface an error.
 * Rows also require an attributable identity (event_ticket_scan_attempts
 * enforces one), so anonymous 401s are intentionally skipped.
 */
function logRejection(attempt: RejectionLog): void {
  if (!isUuid(attempt.eventId)) return;
  if (!attempt.userId && !attempt.staffMemberId) return;

  void recordRejectedTicketScan(
    supabaseAdmin,
    {
      eventId: attempt.eventId,
      staffMemberId: attempt.staffMemberId ?? null,
      scannedByUserId: attempt.userId ?? null,
      ticketInstanceId: attempt.ticketInstanceId ?? null,
      entranceId: attempt.entrance ?? null,
      scanSource: "online",
      reason: attempt.reason,
    },
    attempt.requestId,
  ).catch(() => false);
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

  // Round 4: memory photo-upload QRs are not admission tickets. The prefix
  // can never match a ticket_instances.qr_code, but answer explicitly so
  // door staff get guidance instead of a bare "not found".
  if (isMemoryQrScan(code)) {
    return NextResponse.json({ error: MEMORY_QR_SCANNER_MESSAGE, valid: false }, { status: 400 });
  }

  const ticketData = await findTicketByCode(code);

  if (!ticketData) {
    return NextResponse.json({ error: "Ticket not found.", valid: false }, { status: 404 });
  }

  const userId = await getCurrentUserId(req);
  const canCheckIn = await canManageEvent(userId, ticketData.eventId);
  const hasFullManagerAccess = userId
    ? await hasEventOrOrganizerAccess(userId, ticketData.eventId, ["event_manager"], EVENT_SCAN_ENTITY_ROLES)
    : false;

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
  const requestId = randomUUID();
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Ticket verification is not configured." }, { status: 500 });
    }

    const { code, action, eventId, entrance } = await req.json();

    if (!code) {
      return NextResponse.json({ error: "No code provided." }, { status: 400 });
    }

    // Resolve the caller once, before any rejection branch: rejected scans need
    // an attributable identity to be recorded, and the check-in branch reuses it.
    const actorUserId = await getCurrentUserId(req);

    // Guest (account-less) staff session, scoped to the event named in THIS
    // request only - never guessed from the ticket's own event, and never
    // consulted at all when an account already resolved above. An expired or
    // revoked session is reported immediately, distinctly, and is never
    // allowed to fall through toward the "not signed in" / account path below.
    let guestActor: { staffMemberId: string; role: "event_manager" | "ticket_scanner"; entranceId: string | null } | null = null;
    let guestSessionToken: string | null = null;

    if (!actorUserId && isGuestScannerEnabled() && typeof eventId === "string" && isUuid(eventId)) {
      guestSessionToken = req.cookies.get(eventStaffSessionCookieName(eventId))?.value ?? null;
      if (guestSessionToken) {
        const session = await validateEventStaffSession(eventId, guestSessionToken);
        if (!session) {
          return NextResponse.json(
            {
              success: false,
              message: "Your access has ended. Ask the organizer for a new invitation.",
              code: "staff_session_invalid",
            },
            { status: 401 }
          );
        }
        guestActor = {
          staffMemberId: session.staffMemberId,
          role: session.role,
          entranceId: session.entranceId,
        };
      }
    }

    const staffMemberId = guestActor?.staffMemberId ?? null;

    // Round 4: never route a photo-upload code into the check-in RPC.
    if (isMemoryQrScan(code)) {
      logRejection({
        eventId,
        reason: "unsupported_code",
        userId: actorUserId,
        staffMemberId,
        ticketInstanceId: null,
        entrance: typeof entrance === "string" ? entrance : null,
        requestId,
      });
      return NextResponse.json(
        { success: false, message: MEMORY_QR_SCANNER_MESSAGE, status: "memory_code" },
        { status: 400 }
      );
    }

    const ticketData = await findTicketByCode(code);

    if (!ticketData) {
      logRejection({
        eventId,
        reason: "ticket_not_found",
        userId: actorUserId,
        staffMemberId,
        ticketInstanceId: null,
        entrance: typeof entrance === "string" ? entrance : null,
        requestId,
      });
      return NextResponse.json({ error: "Ticket not found.", valid: false }, { status: 404 });
    }

    // Every caller below manager level — guest, ticket_scanner account, or
    // an entity editor — never gets attendee PII on POST, same gate as
    // GET's hasFullManagerAccess: every response path below that echoes
    // order data uses this sanitized copy instead of the raw one.
    const hasFullManagerAccess = actorUserId
      ? await hasEventOrOrganizerAccess(actorUserId, ticketData.eventId, ["event_manager"], EVENT_SCAN_ENTITY_ROLES)
      : false;
    const responseOrder = hasFullManagerAccess
      ? ticketData.order
      : { ...ticketData.order, buyer_email: null, phone: null, total_amount: 0 };

    // A guest's session is scoped to one event (the cookie is keyed by it),
    // so this is also where a guest of event A scanning a ticket of event B
    // is caught: ticketData.eventId can never equal the guest's own eventId.
    if (eventId && ticketData.eventId !== eventId) {
      logRejection({
        eventId,
        reason: "wrong_event",
        userId: actorUserId,
        staffMemberId,
        ticketInstanceId: ticketData.instanceId,
        entrance: typeof entrance === "string" ? entrance : null,
        requestId,
      });
      return NextResponse.json(
        {
          success: false,
          error: "WRONG_EVENT",
          message: "This ticket belongs to a different event.",
          status: "wrong_event",
          order: responseOrder,
        },
        { status: 400 }
      );
    }

    if (action === "checkin") {
      const userId = actorUserId;

      if (!userId && !guestActor) {
        return NextResponse.json(
          { success: false, message: "Log in as authorized door staff or event organizer to check in guests." },
          { status: 401 }
        );
      }

      // A guest's role comes straight from its validated session - the
      // underlying event_team_members.role CHECK constraint already limits
      // it to these two values, but this mirrors resolve-principal's
      // defensive re-check rather than trusting that invariant blindly.
      const canCheckIn = guestActor
        ? guestActor.role === "event_manager" || guestActor.role === "ticket_scanner"
        : await canManageEvent(userId, ticketData.eventId);

      if (!canCheckIn) {
        // `ticket_ineligible` is the closest persisted reason for "this person
        // may not admit tickets here"; the attempt is still attributable.
        logRejection({
          eventId: eventId || ticketData.eventId,
          reason: "ticket_ineligible",
          userId,
          staffMemberId,
          ticketInstanceId: ticketData.instanceId,
          entrance: typeof entrance === "string" ? entrance : null,
          requestId,
        });
        return NextResponse.json(
          { success: false, message: "You do not have permission to check in this ticket." },
          { status: 403 }
        );
      }

      // Entrance enforcement is guest-only, and only when the session itself
      // carries an assigned entrance: the account path's entrance handling
      // is untouched (entrance is recorded as metadata only, never enforced).
      if (guestActor?.entranceId) {
        const requestedEntrance = typeof entrance === "string" ? entrance : null;
        if (requestedEntrance !== guestActor.entranceId) {
          logRejection({
            eventId: eventId || ticketData.eventId,
            reason: "unauthorized_entrance",
            userId,
            staffMemberId,
            ticketInstanceId: ticketData.instanceId,
            entrance: requestedEntrance,
            requestId,
          });
          return NextResponse.json(
            { success: false, status: "unauthorized_entrance", message: "You are not assigned to that entrance." },
            { status: 403 }
          );
        }
      }

      // Call the atomic check_in_ticket RPC. A guest always calls the
      // eleven-argument overload (migration 196) with every named parameter
      // supplied explicitly - null for whatever this scan doesn't use - so
      // the call can never partially match a different overload. The
      // account path keeps the existing two-argument call, byte-for-byte.
      const { error: rpcError } = guestActor
        ? await supabaseAdmin.rpc("check_in_ticket", {
            p_ticket_instance_id: ticketData.instanceId,
            p_event_id: ticketData.eventId,
            p_scanned_by_user_id: null,
            p_delegating_user_id: null,
            p_staff_member_id: guestActor.staffMemberId,
            p_session_token_hash: guestSessionToken ? hashEventStaffSessionToken(guestSessionToken) : null,
            p_scan_source: "online",
            p_offline_scan_id: null,
            p_scanned_at: null,
            p_device_id: null,
            p_entrance_id: guestActor.entranceId,
          })
        : await supabaseAdmin.rpc("check_in_ticket", {
            p_ticket_instance_id: ticketData.instanceId,
            p_scanned_by_user_id: userId,
          });

      if (rpcError) {
        const msg = rpcError.message || "";
        const logAttempt = (reason: TicketScanRejectionReason) =>
          logRejection({
            eventId: eventId || ticketData.eventId,
            reason,
            userId,
            staffMemberId,
            ticketInstanceId: ticketData.instanceId,
            entrance: typeof entrance === "string" ? entrance : null,
            requestId,
          });

        if (msg.includes("ALREADY_CHECKED_IN")) {
          logAttempt("already_checked_in");
          return NextResponse.json({
            success: false,
            message: "Ticket already used.",
            status: "used",
            order: responseOrder,
          });
        }
        if (msg.includes("TICKET_CANCELLED")) {
          logAttempt("ticket_cancelled");
          return NextResponse.json({
            success: false,
            message: "Ticket is cancelled.",
            status: "cancelled",
            order: responseOrder,
          });
        }
        if (msg.includes("TICKET_REFUNDED")) {
          logAttempt("ticket_refunded");
          return NextResponse.json({
            success: false,
            message: "Ticket is refunded.",
            status: "refunded",
            order: responseOrder,
          });
        }
        if (msg.includes("TICKET_NOT_FOUND")) {
          logAttempt("ticket_not_found");
          return NextResponse.json({ error: "Ticket not found.", valid: false }, { status: 404 });
        }
        logAttempt("verification_error");
        return NextResponse.json(
          { success: false, message: "Could not check in this ticket." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Ticket checked in successfully!",
        status: "used",
        order: { ...responseOrder, status: "used", checked_in_at: new Date().toISOString() },
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err: unknown) {
    console.error("[verify-ticket]", err);
    return NextResponse.json({ error: "Could not verify the ticket. Please try again." }, { status: 500 });
  }
}
