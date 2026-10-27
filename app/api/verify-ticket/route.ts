import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { MEMORY_QR_SCANNER_MESSAGE, isMemoryQrScan } from "@/lib/memories/tokens";
import {
  eventStaffSessionCookieName,
  EVENT_STAFF_SESSION_COOKIE_PREFIX,
  hashEventStaffSessionToken,
  validateEventStaffSession,
} from "@/lib/staff/guest-session";
import { recordRejectedTicketScan, type TicketScanRejectionReason } from "@/lib/staff/scan-attempts";

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
  const { data: inst, error: instanceError } = await supabaseAdmin
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
  if (instanceError) throw new Error("Ticket lookup unavailable.");

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
  const { data: legacyOrder, error: legacyOrderError } = await supabaseAdmin
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
  if (legacyOrderError) throw new Error("Ticket lookup unavailable.");

  if (!legacyOrder) return null;

  // Check if ticket_instances row exists for this legacy order
  const { data: legacyInst, error: legacyInstanceError } = await supabaseAdmin
    .from("ticket_instances")
    .select("id, status, checked_in_at")
    .eq("order_id", legacyOrder.id)
    .maybeSingle();
  if (legacyInstanceError) throw new Error("Ticket lookup unavailable.");

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

  let ticketData: Awaited<ReturnType<typeof findTicketByCode>>;
  try {
    ticketData = await findTicketByCode(code);
  } catch (err) {
    const errorName = err instanceof Error ? err.name : "UnknownError";
    console.error("[verify-ticket]", { requestId: randomUUID(), stage: "lookup_ticket", errorName });
    return NextResponse.json({ error: "Ticket verification is temporarily unavailable." }, { status: 503 });
  }

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
  const requestId = randomUUID();
  let stage = "parse_request";
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Ticket verification is not configured." }, { status: 500 });
    }

    stage = "parse_body";
    const body = await req.json();
    const { code, action, eventId, entrance } = body;
    if (action !== "checkin") {
      return NextResponse.json({ error: "Unknown action.", requestId }, { status: 400 });
    }
    if (typeof eventId !== "string" || !eventId) {
      return NextResponse.json({ success: false, message: "Event context is required.", requestId }, { status: 400 });
    }

    stage = "authenticate_staff";
    let guestSession: Awaited<ReturnType<typeof validateEventStaffSession>> = null;
    let guestSessionToken: string | null = null;
    const hasGuestCookie = req.cookies.getAll().some((cookie) => cookie.name.startsWith(EVENT_STAFF_SESSION_COOKIE_PREFIX));
    guestSessionToken = req.cookies.get(eventStaffSessionCookieName(eventId))?.value || null;
    if (guestSessionToken) {
      guestSession = await validateEventStaffSession(eventId, guestSessionToken);
      if (!guestSession) {
        return NextResponse.json(
          { success: false, status: "expired_session", message: "Staff access has expired or was revoked.", requestId },
          { status: 401, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } }
        );
      }
    } else if (hasGuestCookie) {
      return NextResponse.json(
        { success: false, status: "expired_session", message: "Staff access has expired or was revoked.", requestId },
        { status: 401, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } }
      );
    }

    const userId = guestSession ? null : await getCurrentUserId(req);
    if (!guestSession && !userId) {
      return NextResponse.json(
        { success: false, message: "Log in as authorized door staff or event organizer to check in guests.", requestId },
        { status: 401, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } }
      );
    }
    if (guestSession && !["event_manager", "ticket_scanner"].includes(guestSession.role)) {
      return NextResponse.json({ success: false, message: "You do not have permission to check in this ticket.", requestId }, { status: 403 });
    }
    if (userId && !(await canManageEvent(userId, eventId))) {
      return NextResponse.json({ success: false, message: "You do not have permission to check in this ticket.", requestId }, { status: 403 });
    }

    let staffMemberId = guestSession?.staffMemberId ?? null;
    let assignedEntranceId = guestSession?.entranceId ?? null;
    if (userId) {
      const { data: member, error: memberError } = await supabaseAdmin
        .from("event_team_members")
        .select("id, entrance_id, role")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (memberError) {
        console.error("[verify-ticket]", { requestId, stage, errorCode: memberError.code || "UNKNOWN" });
        return NextResponse.json(
          { success: false, status: "error", message: "Could not verify staff access. Please retry.", requestId },
          { status: 503, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } }
        );
      }
      staffMemberId = member?.id ?? null;
      assignedEntranceId = member?.entrance_id ?? null;
    }

    const requestedEntranceId = typeof entrance === "string" ? entrance : null;
    if (assignedEntranceId && requestedEntranceId !== assignedEntranceId) {
      stage = "validate_entrance";
      const logged = await recordRejectedTicketScan(supabaseAdmin, {
        eventId,
        staffMemberId,
        scannedByUserId: userId,
        ticketInstanceId: null,
        entranceId: assignedEntranceId,
        scanSource: "online",
        reason: "unauthorized_entrance",
      }, requestId);
      return NextResponse.json(
        logged
          ? { success: false, status: "unauthorized_entrance", message: "You are not assigned to that entrance.", requestId }
          : { success: false, status: "error", message: "The scan could not be recorded. Please retry.", requestId },
        { status: logged ? 403 : 503, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } }
      );
    }
    // The client may report a selected entrance, but only the server-side
    // staff assignment is authoritative for check-in attribution.
    const entranceId = assignedEntranceId;

    const recordRejection = async (
      reason: TicketScanRejectionReason,
      message: string,
      status: number,
      ticketInstanceId: string | null = null,
    ) => {
      const logged = await recordRejectedTicketScan(supabaseAdmin, {
        eventId,
        staffMemberId,
        scannedByUserId: userId,
        ticketInstanceId,
        entranceId,
        scanSource: "online",
        reason,
      }, requestId);
      if (!logged) {
        return NextResponse.json(
          { success: false, status: "error", message: "The scan could not be recorded. Please retry.", requestId },
          { status: 503, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } }
        );
      }
      if (reason === "unsupported_code") {
        return NextResponse.json(
          { success: false, message, status: "memory_code", reasonCode: reason, requestId },
          { status, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } }
        );
      }
      const clientStatus = reason === "already_checked_in"
        ? "used"
        : reason === "ticket_not_found"
          ? "not_found"
          : reason === "ticket_cancelled"
            ? "cancelled"
            : reason === "ticket_refunded"
              ? "refunded"
              : reason === "ticket_not_valid" || reason === "ticket_ineligible"
                ? "invalid"
                : reason;
      return NextResponse.json(
        { success: false, message, status: clientStatus, reasonCode: reason, requestId },
        { status, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } }
      );
    };

    if (!code || typeof code !== "string") {
      return await recordRejection("invalid_scan", "No ticket code was provided.", 400);
    }
    if (isMemoryQrScan(code)) {
      return await recordRejection("unsupported_code", MEMORY_QR_SCANNER_MESSAGE, 400);
    }

    stage = "lookup_ticket";
    const ticketData = await findTicketByCode(code);
    if (!ticketData) {
      return await recordRejection("ticket_not_found", "Ticket not found.", 404);
    }
    if (ticketData.eventId !== eventId) {
      // Do not return another event's ticket data or associate it with this event's audit row.
      return await recordRejection("wrong_event", "This ticket belongs to a different event.", 400);
    }

    stage = "atomic_checkin";
    const { error: rpcError } = await supabaseAdmin.rpc("check_in_ticket", {
      p_ticket_instance_id: ticketData.instanceId,
      p_event_id: eventId,
      p_scanned_by_user_id: userId,
      p_delegating_user_id: null,
      p_staff_member_id: guestSession?.staffMemberId ?? null,
      p_session_token_hash: guestSessionToken ? hashEventStaffSessionToken(guestSessionToken) : null,
      p_scan_source: "online",
      p_offline_scan_id: null,
      p_scanned_at: new Date().toISOString(),
      p_device_id: null,
      p_entrance_id: entranceId,
    });

    if (rpcError) {
      const msg = rpcError.message || "";
      if (msg.includes("STAFF_SESSION_INVALID")) {
        return NextResponse.json(
          { success: false, status: "expired_session", message: "Staff access has expired or was revoked.", requestId },
          { status: 401, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } }
        );
      }
      if (msg.includes("SCANNER_PERMISSION_DENIED")) {
        return NextResponse.json({ success: false, message: "You do not have permission to check in this ticket.", requestId }, { status: 403 });
      }
      const expectedRejection: { code: string; reason: TicketScanRejectionReason; message: string; status: number }[] = [
        { code: "ALREADY_CHECKED_IN", reason: "already_checked_in", message: "Ticket already used.", status: 200 },
        { code: "TICKET_CANCELLED", reason: "ticket_cancelled", message: "Ticket is cancelled.", status: 200 },
        { code: "TICKET_REFUNDED", reason: "ticket_refunded", message: "Ticket is refunded.", status: 200 },
        { code: "TICKET_NOT_VALID", reason: "ticket_not_valid", message: "Ticket is not valid for check-in.", status: 400 },
        { code: "TICKET_NOT_FOUND", reason: "ticket_not_found", message: "Ticket not found.", status: 404 },
        { code: "WRONG_EVENT", reason: "wrong_event", message: "This ticket belongs to a different event.", status: 400 },
      ];
      const rejected = expectedRejection.find((entry) => msg.includes(entry.code));
      if (rejected) {
        return await recordRejection(
          rejected.reason,
          rejected.message,
          rejected.status,
          rejected.reason === "wrong_event" ? null : ticketData.instanceId,
        );
      }
      console.error("[verify-ticket]", { requestId, stage, errorCode: rpcError.code || "UNKNOWN" });
      return await recordRejection("verification_error", "Could not check in this ticket.", 503, ticketData.instanceId);
    }

    return NextResponse.json({
      success: true,
      message: "Ticket checked in successfully!",
      status: "used",
      requestId,
      order: { ...ticketData.order, status: "used", checked_in_at: new Date().toISOString() },
    }, { headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } });
  } catch (err: unknown) {
    const errorName = err instanceof Error ? err.name : "UnknownError";
    console.error("[verify-ticket]", { requestId, stage, errorName });
    return NextResponse.json(
      { error: "Could not verify the ticket. Please try again.", requestId },
      { status: 500, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } }
    );
  }
}
