import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import SeatingManagerClient from "./SeatingManagerClient";

export default async function EventSeatingPage({
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
          Only Event Managers and Organizers can manage event seating.
        </p>
      </div>
    );
  }

  const admin = createSupabaseAdmin();

  // Fetch event
  const { data: event } = await admin
    .from("events")
    .select("id, title")
    .eq("id", eventId)
    .single();

  // Fetch venue layout (first layout for this event)
  const { data: layout } = await admin
    .from("venue_layouts")
    .select("id, name, sections")
    .eq("event_id", eventId)
    .maybeSingle();

  // Fetch seats (event-scoped)
  const { data: seats } = await admin
    .from("seats")
    .select(
      "id, event_id, layout_id, section, row_label, seat_number, table_number, table_name, table_capacity, is_vip, status, reserved_until, price_override, ticket_id, assigned_invitation_id"
    )
    .eq("event_id", eventId)
    .order("section")
    .order("row_label")
    .order("seat_number");

  // Fetch assigned invitations (safe fields only — never fetch token)
  const assignedIds = (seats || [])
    .map((s) => s.assigned_invitation_id)
    .filter(Boolean) as string[];

  const invitationMap = new Map<string, object>();
  if (assignedIds.length > 0) {
    const { data: assignedInvitations } = await admin
      .from("event_invitations")
      .select("id, guest_name, guest_title, organization, invitation_status, rsvp_status")
      .in("id", assignedIds)
      .eq("event_id", eventId); // event isolation
    (assignedInvitations || []).forEach((inv) => invitationMap.set(inv.id, inv));
  }

  // Fetch all event invitations for the assignment picker (safe fields only)
  const { data: allInvitations } = await admin
    .from("event_invitations")
    .select("id, guest_name, guest_title, organization, invitation_status, rsvp_status")
    .eq("event_id", eventId)
    .order("guest_name");

  // Build seat→invitation lookup for current_seat_id
  const invitationSeatMap = new Map<string, string>();
  (seats || []).forEach((s) => {
    if (s.assigned_invitation_id) invitationSeatMap.set(s.assigned_invitation_id, s.id);
  });

  const seatsWithInvitations = (seats || []).map((seat) => ({
    ...seat,
    invitation: seat.assigned_invitation_id
      ? (invitationMap.get(seat.assigned_invitation_id) ?? null)
      : null,
  }));

  const invitationsForPicker = (allInvitations || []).map((inv) => ({
    ...inv,
    current_seat_id: invitationSeatMap.get(inv.id) ?? null,
  }));

  return (
    <SeatingManagerClient
      eventId={eventId}
      eventTitle={event?.title ?? "Event"}
      layout={layout ?? null}
      initialSeats={seatsWithInvitations as Parameters<typeof SeatingManagerClient>[0]["initialSeats"]}
      invitations={invitationsForPicker}
    />
  );
}
