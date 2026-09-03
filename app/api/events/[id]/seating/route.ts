import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { assignSeatToInvitation, removeSeatFromInvitation } from "@/lib/invitations";

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

// GET /api/events/[id]/seating — load layout + seats + safe invitation info
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthorizedEventId(req, resolvedParams);
  if (auth instanceof NextResponse) return auth;
  const { eventId } = auth;

  // Load layout
  const { data: layout } = await admin
    .from("venue_layouts")
    .select("id, name, sections")
    .eq("event_id", eventId)
    .maybeSingle();

  // Load seats (event-scoped)
  const { data: seats, error: seatsErr } = await admin
    .from("seats")
    .select(
      "id, event_id, layout_id, section, row_label, seat_number, table_number, table_name, table_capacity, is_vip, status, reserved_until, price_override, ticket_id, assigned_invitation_id"
    )
    .eq("event_id", eventId)
    .order("section")
    .order("row_label")
    .order("seat_number");

  if (seatsErr) {
    return NextResponse.json({ error: "Failed to load seats" }, { status: 500 });
  }

  // Load assigned invitations (safe fields only — no token)
  const assignedInvitationIds = (seats || [])
    .map((s) => s.assigned_invitation_id)
    .filter(Boolean) as string[];

  const invitationMap = new Map<string, object>();
  if (assignedInvitationIds.length > 0) {
    const { data: invitations } = await admin
      .from("event_invitations")
      .select("id, guest_name, guest_title, organization, invitation_status, rsvp_status")
      .in("id", assignedInvitationIds)
      .eq("event_id", eventId); // event isolation
    (invitations || []).forEach((inv) => invitationMap.set(inv.id, inv));
  }

  // Load all invitations for event (for the assignment picker — safe fields only)
  const { data: allInvitations } = await admin
    .from("event_invitations")
    .select("id, guest_name, guest_title, organization, invitation_status, rsvp_status")
    .eq("event_id", eventId)
    .order("guest_name");

  // Find current seat for each invitation
  const invitationSeatMap = new Map<string, string>();
  (seats || []).forEach((s) => {
    if (s.assigned_invitation_id) {
      invitationSeatMap.set(s.assigned_invitation_id, s.id);
    }
  });

  const seatsWithInvitations = (seats || []).map((seat) => ({
    ...seat,
    invitation: seat.assigned_invitation_id
      ? invitationMap.get(seat.assigned_invitation_id) ?? null
      : null,
  }));

  const invitationsForPicker = (allInvitations || []).map((inv) => ({
    ...inv,
    current_seat_id: invitationSeatMap.get(inv.id) ?? null,
  }));

  return NextResponse.json({
    layout: layout ?? null,
    seats: seatsWithInvitations,
    invitations: invitationsForPicker,
  });
}

// PATCH /api/events/[id]/seating — mutations
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

  // ── assign_seat ──────────────────────────────────────────────────────────
  if (op === "assign_seat") {
    const { invitationId, seatId } = body as { invitationId?: string; seatId?: string };
    if (!invitationId || !seatId) {
      return NextResponse.json({ error: "invitationId and seatId are required" }, { status: 422 });
    }

    // Verify seat belongs to event and is not sold
    const { data: seat } = await admin
      .from("seats")
      .select("id, event_id, status, reserved_until, assigned_invitation_id")
      .eq("id", seatId)
      .eq("event_id", eventId) // event isolation
      .maybeSingle();

    if (!seat) return NextResponse.json({ error: "Seat not found" }, { status: 404 });
    if (seat.status === "sold") {
      return NextResponse.json({ error: "Seat is already sold to a ticket buyer" }, { status: 409 });
    }
    if (
      seat.status === "reserved" &&
      seat.reserved_until &&
      new Date(seat.reserved_until) > new Date()
    ) {
      return NextResponse.json(
        { error: "Seat is currently reserved for an active purchase session" },
        { status: 409 }
      );
    }

    // Verify invitation belongs to event and is not cancelled/revoked/expired
    const { data: invitation } = await admin
      .from("event_invitations")
      .select("id, event_id, invitation_status")
      .eq("id", invitationId)
      .eq("event_id", eventId) // event isolation
      .maybeSingle();

    if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    if (["cancelled", "revoked", "expired"].includes(invitation.invitation_status)) {
      return NextResponse.json(
        { error: `Cannot assign seat to a ${invitation.invitation_status} invitation` },
        { status: 409 }
      );
    }

    // Check if invitation ticket instance is already checked in
    const { data: inst } = await admin
      .from("ticket_instances")
      .select("id, status")
      .eq("invitation_id", invitationId)
      .maybeSingle();

    if (inst?.status === "used") {
      return NextResponse.json(
        { error: "Cannot reassign seat for a guest who has already checked in" },
        { status: 409 }
      );
    }

    try {
      const result = await assignSeatToInvitation({ eventId, invitationId, seatId });
      return NextResponse.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Assignment failed";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
  }

  // ── remove_seat ───────────────────────────────────────────────────────────
  if (op === "remove_seat") {
    const { invitationId } = body as { invitationId?: string };
    if (!invitationId) {
      return NextResponse.json({ error: "invitationId is required" }, { status: 422 });
    }

    // Verify invitation belongs to event
    const { data: invitation } = await admin
      .from("event_invitations")
      .select("id, event_id")
      .eq("id", invitationId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

    try {
      const result = await removeSeatFromInvitation(eventId, invitationId);
      return NextResponse.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Removal failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── update_seat_meta ──────────────────────────────────────────────────────
  if (op === "update_seat_meta") {
    const { seatId, is_vip, table_number, table_name, table_capacity } = body as {
      seatId?: string;
      is_vip?: boolean;
      table_number?: string | null;
      table_name?: string | null;
      table_capacity?: number | null;
    };

    if (!seatId) {
      return NextResponse.json({ error: "seatId is required" }, { status: 422 });
    }

    // Verify seat belongs to event
    const { data: seat } = await admin
      .from("seats")
      .select("id, event_id")
      .eq("id", seatId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (!seat) return NextResponse.json({ error: "Seat not found" }, { status: 404 });

    // Validate table_capacity
    if (table_capacity !== undefined && table_capacity !== null) {
      if (!Number.isInteger(table_capacity) || table_capacity <= 0) {
        return NextResponse.json(
          { error: "table_capacity must be a positive integer" },
          { status: 422 }
        );
      }
    }

    // Build update payload — only allow safe metadata fields
    const update: Record<string, unknown> = {};
    if (is_vip !== undefined) update.is_vip = is_vip;
    if (table_number !== undefined) update.table_number = table_number;
    if (table_name !== undefined) update.table_name = table_name;
    if (table_capacity !== undefined) update.table_capacity = table_capacity;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 422 });
    }

    const { error: updateErr } = await admin
      .from("seats")
      .update(update)
      .eq("id", seatId)
      .eq("event_id", eventId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 422 });
}
