import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";

// Service role: bypasses RLS — admin operations only
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — server misconfiguration.");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getCurrentUserId() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function canManageEvent(userId: string | null, eventId: string | null) {
  if (!userId || !eventId) return false;

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id, user_id, organizer_id")
    .eq("id", eventId)
    .single();

  if (!event) return false;
  if (event.user_id === userId) return true;
  if (!event.organizer_id) return false;

  const { data: organizer } = await supabaseAdmin
    .from("organizers")
    .select("id, user_id")
    .eq("id", event.organizer_id)
    .single();

  return organizer?.user_id === userId;
}

// GET /api/verify-ticket?code=XXXXX — look up ticket status
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code provided." }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from("ticket_orders")
    .select(`
      id,
      status,
      seat_label,
      quantity,
      buyer_name,
      buyer_email,
      total_amount,
      created_at,
      checked_in_at,
      event_id,
      events (
        title,
        event_date,
        venue,
        city,
        banner
      )
    `)
    .eq("qr_code", code)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Ticket not found.", valid: false }, { status: 404 });
  }

  const userId = await getCurrentUserId();
  const canCheckIn = await canManageEvent(userId, order.event_id);

  return NextResponse.json({
    valid: order.status === "valid",
    order,
    authenticated: Boolean(userId),
    can_check_in: canCheckIn,
  });
}

// POST /api/verify-ticket — check in a ticket (mark as used)
export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Ticket verification is not configured." }, { status: 500 });
    }

    const { code, action } = await req.json();

    if (!code) {
      return NextResponse.json({ error: "No code provided." }, { status: 400 });
    }

    const { data: order } = await supabaseAdmin
      .from("ticket_orders")
      .select("id, status, event_id")
      .eq("qr_code", code)
      .single();

    if (!order) {
      return NextResponse.json({ error: "Ticket not found.", valid: false }, { status: 404 });
    }

    if (action === "checkin") {
      const userId = await getCurrentUserId();

      if (!userId) {
        return NextResponse.json(
          { success: false, message: "Log in as the event organizer to check in guests." },
          { status: 401 }
        );
      }

      const canCheckIn = await canManageEvent(userId, order.event_id);

      if (!canCheckIn) {
        return NextResponse.json(
          { success: false, message: "You do not have permission to check in this ticket." },
          { status: 403 }
        );
      }

      if (order.status === "used") {
        return NextResponse.json({
          success: false,
          message: "Ticket already used.",
          status: "used",
        });
      }

      if (order.status !== "valid") {
        return NextResponse.json({
          success: false,
          message: `Ticket is ${order.status}.`,
          status: order.status,
        });
      }

      const { error: updateError } = await supabaseAdmin
        .from("ticket_orders")
        .update({ status: "used", checked_in_at: new Date().toISOString() })
        .eq("id", order.id)
        .eq("status", "valid");

      if (updateError) {
        return NextResponse.json(
          { success: false, message: "Could not check in this ticket." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Ticket checked in successfully!",
        status: "used",
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
