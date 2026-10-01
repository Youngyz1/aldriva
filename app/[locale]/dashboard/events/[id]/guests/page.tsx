import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import GuestsClient from "./GuestsClient";

export default async function EventGuestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const canManage = await hasEventOrOrganizerAccess(ctx.user.id, eventId, [
    "event_manager",
  ]);

  if (!canManage) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
        <h2 className="text-xl font-black text-red-700">Access Restricted</h2>
        <p className="mt-2 text-sm font-semibold text-red-600">
          Only Event Managers and Organizers can manage event guests and digital invitations.
        </p>
      </div>
    );
  }

  const admin = createSupabaseAdmin();

  // 1. Fetch event
  const { data: event } = await admin
    .from("events")
    .select("id, title, event_date, venue, city")
    .eq("id", eventId)
    .single();

  if (!event) redirect("/dashboard/events");

  // 2. Fetch invitations (safe fields only — no token)
  const { data: invitations } = await admin
    .from("event_invitations")
    .select("id, event_id, guest_name, guest_title, organization, email, phone, invitation_status, rsvp_status, rsvp_at, notes, created_at, updated_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  const invitationIds = (invitations || []).map((i) => i.id);

  // 3. Fetch linked ticket instances
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

  // 4. Fetch seats linked to invitations
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

  // 5. Fetch available seats for assignment picker
  const { data: availableSeats } = await admin
    .from("seats")
    .select("id, section, row_label, seat_number, table_number, table_name, is_vip, status, price_override, assigned_invitation_id")
    .eq("event_id", eventId)
    .eq("status", "available")
    .is("assigned_invitation_id", null)
    .order("section")
    .order("row_label")
    .order("seat_number");

  const initialGuests = (invitations || []).map((inv) => {
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

  return (
    <GuestsClient
      eventId={eventId}
      eventTitle={event.title || "Event"}
      initialGuests={initialGuests}
      initialAvailableSeats={availableSeats || []}
    />
  );
}
