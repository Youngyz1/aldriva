import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { calculateEventOperationalMetrics } from "@/lib/event-metrics";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
    if (!canManage) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to access analytics for this event." },
        { status: 403 }
      );
    }

    const metrics = await calculateEventOperationalMetrics(eventId);

    return NextResponse.json({
      success: true,
      analytics: {
        event: metrics.event,
        rsvp_funnel: metrics.guests,
        tickets: metrics.tickets,
        seating: metrics.seating,
        attendance: {
          total_checked_in: metrics.checkin.total_checked_in,
          not_arrived: metrics.checkin.not_arrived,
          attendance_rate: metrics.checkin.attendance_rate,
          hourly_velocity: metrics.checkin.hourly_velocity,
        },
        vip: metrics.vip,
        alerts: metrics.alerts,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load event analytics.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
