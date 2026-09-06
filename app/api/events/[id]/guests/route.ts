import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import {
  createInvitationCredential,
  sendInvitationEmail,
  cancelInvitation,
  restoreInvitation,
  updateInvitationGuest,
  assignSeatToInvitation,
  removeSeatFromInvitation,
} from "@/lib/invitations";
import { logEventAction } from "@/lib/event-audit";

const admin = createSupabaseAdmin();

async function getAuthorizedEventId(
  req: NextRequest,
  params: { id: string }
): Promise<{ userId: string; eventId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventId = params.id;
  const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return { userId: user.id, eventId };
}

// GET /api/events/[id]/guests — list event guests with credential and seat metadata
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthorizedEventId(req, resolvedParams);
  if (auth instanceof NextResponse) return auth;
  const { eventId } = auth;

  const url = req.nextUrl;
  const search = url.searchParams.get("search")?.trim().toLowerCase() || "";
  const rsvpFilter = url.searchParams.get("rsvp_status") || "";
  const statusFilter = url.searchParams.get("status") || "";
  const isVipFilter = url.searchParams.get("is_vip") || "";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const perPage = parseInt(url.searchParams.get("per_page") || "50", 10);
  const usePagination = url.searchParams.has("page");

  // 1. Fetch invitations (safe fields only — no token)
  let query = admin
    .from("event_invitations")
    .select(
      "id, event_id, guest_name, guest_title, organization, email, phone, invitation_status, rsvp_status, rsvp_at, notes, created_at, updated_at",
      { count: "exact" }
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (rsvpFilter && ["pending", "accepted", "declined"].includes(rsvpFilter)) {
    query = query.eq("rsvp_status", rsvpFilter);
  }

  if (statusFilter && ["draft", "sent", "cancelled", "revoked", "expired"].includes(statusFilter)) {
    query = query.eq("invitation_status", statusFilter);
  }

  if (usePagination) {
    const offset = (Math.max(page, 1) - 1) * perPage;
    query = query.range(offset, offset + perPage - 1);
  }

  const { data: invitations, count, error: invErr } = await query;

  if (invErr) {
    return NextResponse.json({ error: "Failed to load guest list." }, { status: 500 });
  }

  const invitationIds = (invitations || []).map((i) => i.id);

  // 2. Fetch linked ticket instances
  const ticketMap = new Map<string, any>();
  if (invitationIds.length > 0) {
    const { data: instances } = await admin
      .from("ticket_instances")
      .select("id, invitation_id, qr_code, status, seat_id, seat_label, checked_in_at")
      .in("invitation_id", invitationIds)
      .eq("event_id", eventId);

    (instances || []).forEach((inst) => {
      if (inst.invitation_id) ticketMap.set(inst.invitation_id, inst);
    });
  }

  // 3. Fetch seats linked to invitations
  const seatMap = new Map<string, any>();
  if (invitationIds.length > 0) {
    const { data: assignedSeats } = await admin
      .from("seats")
      .select("id, section, row_label, seat_number, table_number, table_name, table_capacity, is_vip, status, assigned_invitation_id")
      .in("assigned_invitation_id", invitationIds)
      .eq("event_id", eventId);

    (assignedSeats || []).forEach((seat) => {
      if (seat.assigned_invitation_id) seatMap.set(seat.assigned_invitation_id, seat);
    });
  }

  // 4. Fetch available seats for assignment picker
  const { data: availableSeats } = await admin
    .from("seats")
    .select("id, section, row_label, seat_number, table_number, table_name, is_vip, status, price_override, assigned_invitation_id")
    .eq("event_id", eventId)
    .eq("status", "available")
    .is("assigned_invitation_id", null)
    .order("section")
    .order("row_label")
    .order("seat_number");

  let guests = (invitations || []).map((inv) => {
    const ticket = ticketMap.get(inv.id) || null;
    const seat = seatMap.get(inv.id) || null;
    return {
      ...inv,
      ticketInstance: ticket
        ? {
            id: ticket.id,
            qr_code: ticket.qr_code,
            status: ticket.status,
            checked_in_at: ticket.checked_in_at,
            seat_label: ticket.seat_label,
          }
        : null,
      seat: seat
        ? {
            id: seat.id,
            section: seat.section,
            row_label: seat.row_label,
            seat_number: seat.seat_number,
            table_number: seat.table_number,
            table_name: seat.table_name,
            table_capacity: seat.table_capacity,
            is_vip: seat.is_vip,
          }
        : null,
    };
  });

  // Client-compatible in-memory filtering for search & VIP filter if search string provided
  if (search) {
    guests = guests.filter((g) =>
      g.guest_name.toLowerCase().includes(search) ||
      (g.email && g.email.toLowerCase().includes(search)) ||
      (g.organization && g.organization.toLowerCase().includes(search))
    );
  }

  if (isVipFilter === "true") {
    guests = guests.filter((g) => Boolean(g.guest_title) || Boolean(g.seat?.is_vip));
  }

  return NextResponse.json({
    guests,
    total: count ?? guests.length,
    page: usePagination ? page : 1,
    per_page: usePagination ? perPage : guests.length,
    availableSeats: availableSeats || [],
  });
}

// POST /api/events/[id]/guests — create a new invited guest
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthorizedEventId(req, resolvedParams);
  if (auth instanceof NextResponse) return auth;
  const { userId, eventId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }

  const guestName = (body.guestName as string)?.trim();
  const guestTitle = (body.guestTitle as string)?.trim() || null;
  const organization = (body.organization as string)?.trim() || null;
  const email = (body.email as string)?.trim().toLowerCase() || null;
  const phone = (body.phone as string)?.trim() || null;
  const notes = (body.notes as string)?.trim() || null;
  const seatId = (body.seatId as string)?.trim() || null;
  const sendEmail = Boolean(body.sendEmail);

  if (!guestName) {
    return NextResponse.json({ error: "Guest name is required." }, { status: 422 });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 422 });
  }

  try {
    // 1. Create invitation credential & polymorphic ticket instance
    const credential = await createInvitationCredential({
      eventId,
      guestName,
      guestTitle,
      organization,
      email,
      phone,
      notes,
      createdBy: userId,
    });

    const invitationId = credential.invitation.id;

    // 2. Optionally assign seat
    let assignedSeatLabel: string | null = null;
    if (seatId) {
      try {
        const seatResult = await assignSeatToInvitation({
          eventId,
          invitationId,
          seatId,
        });
        assignedSeatLabel = seatResult.seatLabel;
      } catch (seatErr: unknown) {
        console.warn("[guests/create] Seat assignment failed:", seatErr);
      }
    }

    // 3. Optionally send invitation email
    let emailSent = false;
    let emailMessage: string | null = null;
    if (sendEmail && email) {
      try {
        const sendResult = await sendInvitationEmail({
          eventId,
          invitationId,
        });
        emailSent = sendResult.ok;
        emailMessage = sendResult.message;
      } catch (sendErr: unknown) {
        console.warn("[guests/create] Email send failed:", sendErr);
      }
    }

    // 4. Operational audit log
    await logEventAction({
      eventId,
      actorUserId: userId,
      actorRole: "event_manager",
      action: "guest_created",
      targetType: "guest",
      targetId: invitationId,
      metadata: { guestName, email, seatId, emailSent },
    });

    return NextResponse.json({
      success: true,
      guest: {
        id: credential.invitation.id,
        event_id: credential.invitation.event_id,
        guest_name: credential.invitation.guest_name,
        guest_title: credential.invitation.guest_title,
        organization: credential.invitation.organization,
        email: credential.invitation.email,
        phone: credential.invitation.phone,
        invitation_status: emailSent ? "sent" : credential.invitation.invitation_status,
        rsvp_status: credential.invitation.rsvp_status,
        created_at: credential.invitation.created_at,
        seat_label: assignedSeatLabel,
      },
      emailSent,
      emailMessage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create guest invitation.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/events/[id]/guests — update, email, cancel, restore, or seat mutations
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthorizedEventId(req, resolvedParams);
  if (auth instanceof NextResponse) return auth;
  const { userId, eventId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }

  const op = body.op as string | undefined;

  // ── op: bulk_resend ────────────────────────────────────────────────────────
  if (op === "bulk_resend") {
    const invitationIds = (body.invitationIds as string[]) || [];
    if (!Array.isArray(invitationIds) || invitationIds.length === 0) {
      return NextResponse.json({ error: "invitationIds array is required" }, { status: 422 });
    }

    let successCount = 0;
    for (const invId of invitationIds) {
      try {
        const res = await sendInvitationEmail({ eventId, invitationId: invId });
        if (res.ok) successCount++;
      } catch (e) {
        console.warn(`[bulk_resend] Failed for ${invId}:`, e);
      }
    }

    await logEventAction({
      eventId,
      actorUserId: userId,
      actorRole: "event_manager",
      action: "invitation_resent",
      targetType: "invitation",
      metadata: { requestedCount: invitationIds.length, successCount },
    });

    return NextResponse.json({ success: true, count: successCount });
  }

  // ── op: bulk_revoke ────────────────────────────────────────────────────────
  if (op === "bulk_revoke") {
    const invitationIds = (body.invitationIds as string[]) || [];
    if (!Array.isArray(invitationIds) || invitationIds.length === 0) {
      return NextResponse.json({ error: "invitationIds array is required" }, { status: 422 });
    }

    let successCount = 0;
    for (const invId of invitationIds) {
      try {
        const res = await cancelInvitation({ eventId, invitationId: invId });
        if (res.success) successCount++;
      } catch (e) {
        console.warn(`[bulk_revoke] Failed for ${invId}:`, e);
      }
    }

    await logEventAction({
      eventId,
      actorUserId: userId,
      actorRole: "event_manager",
      action: "invitation_revoked",
      targetType: "invitation",
      metadata: { requestedCount: invitationIds.length, successCount },
    });

    return NextResponse.json({ success: true, count: successCount });
  }

  const invitationId = (body.invitationId as string)?.trim();
  if (!invitationId) {
    return NextResponse.json({ error: "invitationId is required" }, { status: 422 });
  }

  // ── op: update ─────────────────────────────────────────────────────────────
  if (op === "update") {
    try {
      const email = body.email !== undefined ? (body.email as string)?.trim().toLowerCase() || null : undefined;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 422 });
      }

      const result = await updateInvitationGuest({
        eventId,
        invitationId,
        guestName: body.guestName as string | undefined,
        guestTitle: body.guestTitle as string | null | undefined,
        organization: body.organization as string | null | undefined,
        email,
        phone: body.phone as string | null | undefined,
        notes: body.notes as string | null | undefined,
      });

      await logEventAction({
        eventId,
        actorUserId: userId,
        actorRole: "event_manager",
        action: "guest_updated",
        targetType: "guest",
        targetId: invitationId,
        metadata: { updates: body },
      });

      return NextResponse.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update guest";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // ── op: send_email ─────────────────────────────────────────────────────────
  if (op === "send_email") {
    try {
      const result = await sendInvitationEmail({
        eventId,
        invitationId,
      });

      await logEventAction({
        eventId,
        actorUserId: userId,
        actorRole: "event_manager",
        action: "invitation_sent",
        targetType: "invitation",
        targetId: invitationId,
      });

      return NextResponse.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send invitation email";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // ── op: cancel ─────────────────────────────────────────────────────────────
  if (op === "cancel") {
    try {
      const result = await cancelInvitation({
        eventId,
        invitationId,
      });

      await logEventAction({
        eventId,
        actorUserId: userId,
        actorRole: "event_manager",
        action: "invitation_revoked",
        targetType: "invitation",
        targetId: invitationId,
      });

      return NextResponse.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel invitation";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
  }

  // ── op: restore ────────────────────────────────────────────────────────────
  if (op === "restore") {
    try {
      const result = await restoreInvitation({
        eventId,
        invitationId,
      });

      await logEventAction({
        eventId,
        actorUserId: userId,
        actorRole: "event_manager",
        action: "invitation_restored",
        targetType: "invitation",
        targetId: invitationId,
      });

      return NextResponse.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to restore invitation";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
  }

  // ── op: assign_seat ────────────────────────────────────────────────────────
  if (op === "assign_seat") {
    const seatId = (body.seatId as string)?.trim();
    if (!seatId) {
      return NextResponse.json({ error: "seatId is required" }, { status: 422 });
    }

    try {
      const result = await assignSeatToInvitation({
        eventId,
        invitationId,
        seatId,
      });

      await logEventAction({
        eventId,
        actorUserId: userId,
        actorRole: "event_manager",
        action: "seat_assigned",
        targetType: "seat",
        targetId: seatId,
        metadata: { invitationId, seatLabel: result.seatLabel },
      });

      return NextResponse.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to assign seat";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
  }

  // ── op: remove_seat ────────────────────────────────────────────────────────
  if (op === "remove_seat") {
    try {
      const result = await removeSeatFromInvitation(eventId, invitationId);

      await logEventAction({
        eventId,
        actorUserId: userId,
        actorRole: "event_manager",
        action: "seat_released",
        targetType: "invitation",
        targetId: invitationId,
      });

      return NextResponse.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove seat";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 422 });
}
