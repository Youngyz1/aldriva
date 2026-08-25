import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";

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
  return await hasEventOrOrganizerAccess(userId, eventId);
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

    const { code, action, eventId } = await req.json();

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

    if (eventId && order.event_id !== eventId) {
      return NextResponse.json(
        {
          success: false,
          error: "WRONG_EVENT",
          message: "This ticket belongs to a different event.",
          status: "wrong_event",
        },
        { status: 400 }
      );
    }

    if (action === "checkin") {
      const userId = await getCurrentUserId();

      if (!userId) {
        return NextResponse.json(
          { success: false, message: "Log in as authorized door staff or event organizer to check in guests." },
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

      // Call atomic check_in_ticket RPC with scanner user attribution
      const { error: rpcError } = await supabaseAdmin.rpc("check_in_ticket", {
        p_ticket_order_id: order.id,
        p_scanned_by_user_id: userId,
      });

      if (rpcError) {
        const msg = rpcError.message || "";
        if (msg.includes("ALREADY_CHECKED_IN")) {
          return NextResponse.json({
            success: false,
            message: "Ticket already used.",
            status: "used",
          });
        }
        if (msg.includes("TICKET_CANCELLED")) {
          return NextResponse.json({
            success: false,
            message: "Ticket is cancelled.",
            status: "cancelled",
          });
        }
        if (msg.includes("TICKET_REFUNDED")) {
          return NextResponse.json({
            success: false,
            message: "Ticket is refunded.",
            status: "refunded",
          });
        }
        if (msg.includes("TICKET_NOT_FOUND")) {
          return NextResponse.json({ error: "Ticket not found.", valid: false }, { status: 404 });
        }
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

