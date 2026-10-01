import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import SeatingManagerClient from "./SeatingManagerClient";
import { SeatGeometry, TicketTypeSummary } from "@/lib/seating";

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

  // Fetch venue layout
  let { data: layout } = await admin
    .from("venue_layouts")
    .select(
      "id, event_id, name, sections, venue_objects, canvas_width, canvas_height, version, is_published, published_at"
    )
    .eq("event_id", eventId)
    .maybeSingle();

  // If no layout exists yet, create default empty layout
  if (!layout) {
    const { data: newLayout } = await admin
      .from("venue_layouts")
      .insert({
        event_id: eventId,
        name: "Main Hall",
        sections: [],
        venue_objects: [],
        canvas_width: 1200,
        canvas_height: 800,
        version: 1,
        is_published: true,
      })
      .select(
        "id, event_id, name, sections, venue_objects, canvas_width, canvas_height, version, is_published, published_at"
      )
      .single();
    layout = newLayout;
  }

  // Fetch ticket types for this event
  const { data: ticketTypes } = await admin
    .from("tickets")
    .select("id, event_id, name, price, quantity")
    .eq("event_id", eventId)
    .order("price", { ascending: true });

  // Fetch seats with spatial geometry (event-scoped)
  const { data: seats } = await admin
    .from("seats")
    .select(
      "id, event_id, layout_id, section, row_label, seat_number, table_number, table_name, table_capacity, is_vip, is_accessible, status, reserved_until, price_override, ticket_id, ticket_type_id, assigned_invitation_id, x, y, width, height, rotation, object_type"
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
      .eq("event_id", eventId);
    (assignedInvitations || []).forEach((inv) => invitationMap.set(inv.id, inv));
  }

  // Fetch all event invitations for the assignment picker
  const { data: allInvitations } = await admin
    .from("event_invitations")
    .select("id, guest_name, guest_title, organization, invitation_status, rsvp_status")
    .eq("event_id", eventId)
    .order("guest_name");

  // Build seat->invitation lookup
  const invitationSeatMap = new Map<string, string>();
  (seats || []).forEach((s) => {
    if (s.assigned_invitation_id) invitationSeatMap.set(s.assigned_invitation_id, s.id);
  });

  const seatsWithInvitations = (seats || []).map((seat) => ({
    ...seat,
    invitation: seat.assigned_invitation_id
      ? (invitationMap.get(seat.assigned_invitation_id) ?? null)
      : null,
  })) as unknown as SeatGeometry[];

  const invitationsForPicker = (allInvitations || []).map((inv) => ({
    ...inv,
    current_seat_id: invitationSeatMap.get(inv.id) ?? null,
  }));

  return (
    <SeatingManagerClient
      eventId={eventId}
      eventTitle={event?.title ?? "Event"}
      layout={layout as Parameters<typeof SeatingManagerClient>[0]["layout"]}
      ticketTypes={(ticketTypes || []) as TicketTypeSummary[]}
      initialSeats={seatsWithInvitations}
      invitations={invitationsForPicker}
    />
  );
}
