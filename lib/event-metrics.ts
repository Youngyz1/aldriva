/**
 * lib/event-metrics.ts
 * Shared Authoritative Operational Metrics Engine for Aldriva Events.
 * Unifies Operations Dashboard, Analytics, and Reports under a single calculation layer.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

export interface OperationalMetrics {
  event: {
    id: string;
    title: string;
    slug: string;
    event_date: string | null;
    venue: string | null;
    city: string | null;
    status: string;
    checkin_window_start: string | null;
    checkin_window_end: string | null;
  };
  guests: {
    total_invited: number;
    pending_rsvp: number;
    accepted: number;
    maybe: number;
    declined: number;
    revoked: number;
    rsvp_rate: number;
  };
  tickets: {
    total_issued: number;
    paid_sold: number;
    invitations_issued: number;
    gross_revenue: number;
    tickets_available: number;
  };
  seating: {
    total_seats: number;
    available: number;
    reserved: number;
    assigned: number;
    sold: number;
    utilization_percentage: number;
    vip_total: number;
    vip_assigned: number;
  };
  checkin: {
    total_checked_in: number;
    not_arrived: number;
    attendance_rate: number;
    latest_checkin_at: string | null;
    recent_checkins: Array<{
      id: string;
      guest_or_buyer_name: string;
      seat_label: string | null;
      tier_name: string;
      checked_in_at: string;
      scanned_by_name: string | null;
    }>;
    hourly_velocity: Array<{
      hour: string;
      count: number;
    }>;
  };
  vip: {
    invited: number;
    accepted: number;
    checked_in: number;
  };
  alerts: Array<{
    id: string;
    level: "info" | "warning" | "critical";
    title: string;
    message: string;
  }>;
}

/**
 * Calculates authoritative operational metrics directly from PostgreSQL tables.
 */
export async function calculateEventOperationalMetrics(eventId: string): Promise<OperationalMetrics> {
  const admin = createSupabaseAdmin();

  // 1. Fetch Event Details
  const { data: event, error: eventErr } = await admin
    .from("events")
    .select("id, title, slug, event_date, venue, city, status, checkin_window_start, checkin_window_end")
    .eq("id", eventId)
    .single();

  if (eventErr || !event) {
    throw new Error(`Event not found: ${eventErr?.message || "Unknown error"}`);
  }

  // 2. Fetch Invitations
  const { data: invitations } = await admin
    .from("event_invitations")
    .select("id, guest_name, guest_title, invitation_status, rsvp_status, rsvp_deadline, created_at")
    .eq("event_id", eventId);

  const invList = invitations || [];
  const totalInvited = invList.filter((i) => i.invitation_status !== "cancelled" && i.invitation_status !== "revoked").length;
  const pendingRsvp = invList.filter((i) => i.invitation_status !== "cancelled" && i.invitation_status !== "revoked" && i.rsvp_status === "pending").length;
  const acceptedRsvp = invList.filter((i) => i.rsvp_status === "accepted").length;
  const maybeRsvp = invList.filter((i) => i.rsvp_status === "maybe" as any).length;
  const declinedRsvp = invList.filter((i) => i.rsvp_status === "declined").length;
  const revokedInv = invList.filter((i) => i.invitation_status === "cancelled" || i.invitation_status === "revoked").length;
  const rsvpRate = totalInvited > 0 ? Math.round(((acceptedRsvp + declinedRsvp + maybeRsvp) / totalInvited) * 100) : 0;

  // 3. Fetch Ticket Orders & Tickets
  const { data: ticketOrders } = await admin
    .from("ticket_orders")
    .select("id, quantity, total_amount, status, created_at")
    .eq("event_id", eventId);

  const ordersList = ticketOrders || [];
  const paidOrders = ordersList.filter((o) => o.status === "completed" || o.status === "paid");
  const paidSold = paidOrders.reduce((sum, o) => sum + (o.quantity || 1), 0);
  const grossRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

  const { data: ticketTypes } = await admin
    .from("tickets")
    .select("id, quantity")
    .eq("event_id", eventId);

  const totalTicketCapacity = (ticketTypes || []).reduce((sum, t) => sum + (t.quantity || 0), 0);
  const ticketsAvailable = Math.max(totalTicketCapacity - paidSold, 0);

  // 4. Fetch Seats
  const { data: seats } = await admin
    .from("seats")
    .select("id, status, is_vip, assigned_invitation_id, reserved_until")
    .eq("event_id", eventId);

  const seatList = seats || [];
  const totalSeats = seatList.length;
  const availableSeats = seatList.filter((s) => s.status === "available" && !s.assigned_invitation_id).length;
  const reservedSeats = seatList.filter((s) => s.status === "reserved").length;
  const assignedSeats = seatList.filter((s) => Boolean(s.assigned_invitation_id)).length;
  const soldSeats = seatList.filter((s) => s.status === "sold").length;
  const seatingUtilization = totalSeats > 0 ? Math.round(((assignedSeats + soldSeats) / totalSeats) * 100) : 0;
  const vipSeatsTotal = seatList.filter((s) => Boolean(s.is_vip)).length;
  const vipSeatsAssigned = seatList.filter((s) => Boolean(s.is_vip) && (s.assigned_invitation_id || s.status === "sold")).length;

  // 5. Fetch Ticket Instances & Check-Ins
  const { data: ticketInstances } = await admin
    .from("ticket_instances")
    .select("id, source, status, checked_in_at, seat_label, ticket_id, invitation_id, order_id")
    .eq("event_id", eventId);

  const instanceList = ticketInstances || [];
  const totalIssued = instanceList.length;
  const checkedInInstances = instanceList.filter((inst) => inst.status === "used" || Boolean(inst.checked_in_at));
  const totalCheckedIn = checkedInInstances.length;
  const notArrived = Math.max(totalIssued - totalCheckedIn, 0);
  const attendanceRate = totalIssued > 0 ? Math.round((totalCheckedIn / totalIssued) * 100) : 0;

  // 6. Recent Check-Ins & Hourly Velocity
  const { data: checkinAudits } = await admin
    .from("ticket_checkins")
    .select("id, ticket_instance_id, ticket_order_id, scanned_by_user_id, checked_in_at")
    .eq("event_id", eventId)
    .order("checked_in_at", { ascending: false })
    .limit(100);

  const auditsList = checkinAudits || [];
  const latestCheckinAt = auditsList[0]?.checked_in_at || null;

  // Hourly velocity aggregation
  const hourlyMap = new Map<string, number>();
  auditsList.forEach((a) => {
    if (a.checked_in_at) {
      const d = new Date(a.checked_in_at);
      const hourKey = `${String(d.getHours()).padStart(2, "0")}:00`;
      hourlyMap.set(hourKey, (hourlyMap.get(hourKey) || 0) + 1);
    }
  });

  const hourlyVelocity = Array.from(hourlyMap.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  // Build recent 5 check-ins
  const recentCheckins = checkedInInstances
    .sort((a, b) => (b.checked_in_at || "").localeCompare(a.checked_in_at || ""))
    .slice(0, 5)
    .map((inst) => {
      const isInv = inst.source === "invitation" || Boolean(inst.invitation_id);
      const matchingInv = isInv ? invList.find((i) => i.id === inst.invitation_id) : null;
      return {
        id: inst.id,
        guest_or_buyer_name: matchingInv?.guest_name || (isInv ? "Invited Guest" : "Ticket Buyer"),
        seat_label: inst.seat_label,
        tier_name: isInv ? (matchingInv?.guest_title ? `VIP (${matchingInv.guest_title})` : "VIP Guest") : "General Admission",
        checked_in_at: inst.checked_in_at || new Date().toISOString(),
        scanned_by_name: "Staff Scanner",
      };
    });

  // 7. VIP Aggregations
  const vipInvited = invList.filter((i) => Boolean(i.guest_title) || i.invitation_status === "sent").length;
  const vipAccepted = invList.filter((i) => Boolean(i.guest_title) && i.rsvp_status === "accepted").length;
  const vipCheckedIn = checkedInInstances.filter((inst) => inst.source === "invitation").length;

  // 8. Generate Operational Alerts
  const alerts: OperationalMetrics["alerts"] = [];
  const now = new Date();

  if (pendingRsvp > 0 && event.event_date) {
    const daysUntilEvent = Math.ceil((new Date(event.event_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilEvent <= 7 && daysUntilEvent >= 0) {
      alerts.push({
        id: "alert-pending-rsvp-near",
        level: "warning",
        title: "Pending RSVPs Near Event Date",
        message: `${pendingRsvp} guest(s) have not responded with only ${daysUntilEvent} day(s) until the event. Consider sending a reminder.`,
      });
    }
  }

  if (totalSeats > 0 && availableSeats === 0 && pendingRsvp > 0) {
    alerts.push({
      id: "alert-seating-exhausted",
      level: "critical",
      title: "Venue Capacity Reached",
      message: "All seats are assigned or sold. Pending invited guests cannot be allocated without increasing capacity.",
    });
  }

  if (totalCheckedIn > 0 && attendanceRate >= 90) {
    alerts.push({
      id: "alert-high-attendance",
      level: "info",
      title: "High Attendance Rate",
      message: `Event has reached ${attendanceRate}% attendance capacity.`,
    });
  }

  return {
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      event_date: event.event_date,
      venue: event.venue,
      city: event.city,
      status: event.status,
      checkin_window_start: event.checkin_window_start,
      checkin_window_end: event.checkin_window_end,
    },
    guests: {
      total_invited: totalInvited,
      pending_rsvp: pendingRsvp,
      accepted: acceptedRsvp,
      maybe: maybeRsvp,
      declined: declinedRsvp,
      revoked: revokedInv,
      rsvp_rate: rsvpRate,
    },
    tickets: {
      total_issued: totalIssued,
      paid_sold: paidSold,
      invitations_issued: instanceList.filter((i) => i.source === "invitation").length,
      gross_revenue: grossRevenue,
      tickets_available: ticketsAvailable,
    },
    seating: {
      total_seats: totalSeats,
      available: availableSeats,
      reserved: reservedSeats,
      assigned: assignedSeats,
      sold: soldSeats,
      utilization_percentage: seatingUtilization,
      vip_total: vipSeatsTotal,
      vip_assigned: vipSeatsAssigned,
    },
    checkin: {
      total_checked_in: totalCheckedIn,
      not_arrived: notArrived,
      attendance_rate: attendanceRate,
      latest_checkin_at: latestCheckinAt,
      recent_checkins: recentCheckins,
      hourly_velocity: hourlyVelocity,
    },
    vip: {
      invited: vipInvited,
      accepted: vipAccepted,
      checked_in: vipCheckedIn,
    },
    alerts,
  };
}
