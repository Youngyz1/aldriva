import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { logEventAction } from "@/lib/event-audit";

const admin = createSupabaseAdmin();

const VALID_TEMPLATES = ["modern", "concert", "premium", "minimal"] as const;
type TicketTemplate = (typeof VALID_TEMPLATES)[number];

async function getAuthorizedEvent(
  params: { id: string }
): Promise<{ userId: string; eventId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventId = params.id;
  const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return { userId: user.id, eventId };
}

// GET /api/events/[id]/ticket-design
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthorizedEvent(resolvedParams);
  if (auth instanceof NextResponse) return auth;
  const { eventId } = auth;

  const { data: event, error } = await admin
    .from("events")
    .select("id, title, ticket_template")
    .eq("id", eventId)
    .single();

  if (error || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({
    ticketTemplate: event.ticket_template || "modern",
  });
}

// PATCH /api/events/[id]/ticket-design
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthorizedEvent(resolvedParams);
  if (auth instanceof NextResponse) return auth;
  const { userId, eventId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }

  const ticketTemplate = body.ticketTemplate as string;
  if (!ticketTemplate || !VALID_TEMPLATES.includes(ticketTemplate as TicketTemplate)) {
    return NextResponse.json(
      { error: "Invalid template. Must be one of: modern, concert, premium, minimal." },
      { status: 422 }
    );
  }

  const { error: updateErr } = await admin
    .from("events")
    .update({
      ticket_template: ticketTemplate,
    })
    .eq("id", eventId);

  if (updateErr) {
    console.error("[ticket-design/update]", updateErr);
    return NextResponse.json({ error: "Failed to update ticket design." }, { status: 500 });
  }

  try {
    await logEventAction({
      eventId,
      actorUserId: userId,
      actorRole: "event_manager",
      action: "ticket_updated",
      targetType: "event",
      targetId: eventId,
      metadata: { ticketTemplate },
    });
  } catch (auditErr) {
    console.warn("[ticket-design/audit]", auditErr);
  }

  return NextResponse.json({
    success: true,
    ticketTemplate,
  });
}
