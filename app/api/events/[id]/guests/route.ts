import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import {
  createInvitationCredential,
  sendInvitationEmail,
  cancelInvitation,
  updateInvitationGuest,
  assignSeatToInvitation,
  removeSeatFromInvitation,
} from "@/lib/invitations";

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

  // 1. Fetch invitations (safe fields only — no token)
  const { data: invitations, error: invErr } = await admin
    .from("event_invitations")
    .select("id, event_id, guest_name, guest_title, organization, email, phone, invitation_status, rsvp_status, rsvp_at, notes, created_at, updated_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

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

  const guests = (invitations || []).map((inv) => {
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

  return NextResponse.json({
    guests,
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

// PATCH /api/events/[id]/guests — update, email, cancel, or seat mutations
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthorizedEventId(req, resolvedParams);
  if (auth instanceof NextResponse) return auth;
  const { eventId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }

  const op = body.op as string | undefined;
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

      return NextResponse.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel invitation";
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
      return NextResponse.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove seat";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 422 });
}
