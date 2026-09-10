import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { calculateEventOperationalMetrics } from "@/lib/event-metrics";
import { getEventAuditHistory } from "@/lib/event-audit";

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
        { error: "Forbidden: You do not have operational access to this event." },
        { status: 403 }
      );
    }

    // Authoritative calculation from PostgreSQL
    const metrics = await calculateEventOperationalMetrics(eventId);

    const includeAudit = req.nextUrl.searchParams.get("include_audit") === "true";
    let auditHistory = null;

    if (includeAudit) {
      auditHistory = await getEventAuditHistory(eventId, { limit: 20 });
    }

    return NextResponse.json({
      metrics,
      auditHistory: auditHistory?.items || [],
    });
  } catch (err: unknown) {
    console.error("[events/[id]/operations]", err);
    return NextResponse.json({ error: "Failed to load operational metrics." }, { status: 500 });
  }
}
