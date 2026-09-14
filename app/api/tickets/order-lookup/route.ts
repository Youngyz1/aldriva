import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { enforceRateLimit } from "@/lib/rate-limit";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
}

/**
 * GET /api/tickets/order-lookup?payment_intent_id=pi_... | session_id=cs_...
 *
 * Hardened order-status lookup backing /ticket-confirmation.
 *
 * Resolves post-checkout ticket orders and all associated ticket_instances.
 * If the Stripe webhook is still processing record_ticket_and_credit, returns
 * { pending: true } so the client can continue polling without error.
 *
 * Security:
 *  - Exclusively accepts payment_intent_id and session_id. These are high-entropy,
 *    cryptographically unguessable capability tokens issued by Stripe directly to
 *    the buyer during checkout.
 *  - Does NOT accept order_id or qr_code to prevent unauthorized disclosure of
 *    PII (buyer email, name) or ticket QR codes.
 *  - Rate-limited on the guestLookup tier (keyed user-or-IP).
 */
export async function GET(req: NextRequest) {
  try {
    let viewerId: string | null = null;
    try {
      const supabase = await createSupabaseServer();
      const { data: { user } } = await supabase.auth.getUser();
      viewerId = user?.id ?? null;
    } catch {
      viewerId = null;
    }

    const limited = await enforceRateLimit("guestLookup", req, viewerId);
    if (limited) return limited;

    const searchParams = req.nextUrl.searchParams;
    const paymentIntentId = searchParams.get("payment_intent_id") || searchParams.get("payment_intent");
    const sessionId = searchParams.get("session_id");

    if (!paymentIntentId && !sessionId) {
      return NextResponse.json(
        { error: "No valid payment token provided." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdmin();

    // 1. Query ticket_orders based on Stripe capability tokens
    let query = admin
      .from("ticket_orders")
      .select("id, status, event_id, ticket_id, seat_id, seat_label, buyer_name, buyer_email, quantity, total_amount, currency, qr_code, stripe_payment_intent_id, stripe_session_id, created_at");

    if (paymentIntentId) {
      query = query.eq("stripe_payment_intent_id", paymentIntentId);
    } else if (sessionId) {
      query = query.eq("stripe_session_id", sessionId);
    }

    const { data: matchedOrders, error: ordersError } = await query;

    if (ordersError) {
      console.error("[tickets/order-lookup] DB error querying ticket_orders:", ordersError);
      return NextResponse.json(
        { error: "Could not look up the order. Please try again." },
        { status: 500 }
      );
    }

    // If no order rows found yet, payment succeeded on client but webhook is still processing
    if (!matchedOrders || matchedOrders.length === 0) {
      return NextResponse.json(
        { pending: true, status: "pending" },
        { status: 200 }
      );
    }

    return await buildOrderResponse(admin, matchedOrders);
  } catch (err: unknown) {
    console.error("[tickets/order-lookup] route error:", err);
    return NextResponse.json(
      { error: "Could not look up the order. Please try again." },
      { status: 500 }
    );
  }
}

async function buildOrderResponse(
  admin: ReturnType<typeof createSupabaseAdmin>,
  orders: any[]
) {
  const primaryOrder = orders[0];

  // If order is grouped by payment_intent_id, ensure all associated orders are included
  let allOrders = orders;
  if (primaryOrder.stripe_payment_intent_id && orders.length === 1) {
    const { data: grouped } = await admin
      .from("ticket_orders")
      .select("id, status, event_id, ticket_id, seat_id, seat_label, buyer_name, buyer_email, quantity, total_amount, currency, qr_code, stripe_payment_intent_id, stripe_session_id, created_at")
      .eq("stripe_payment_intent_id", primaryOrder.stripe_payment_intent_id);

    if (grouped && grouped.length > 0) {
      allOrders = grouped;
    }
  }

  const orderIds = allOrders.map((o) => o.id);

  // Fetch Event Details
  const { data: eventData } = await admin
    .from("events")
    .select("id, title, slug, event_date, venue, city, banner")
    .eq("id", primaryOrder.event_id)
    .maybeSingle();

  // Fetch all ticket_instances for these order rows
  const { data: instData } = await admin
    .from("ticket_instances")
    .select(`
      id,
      qr_code,
      status,
      order_id,
      ticket_id,
      seat_id,
      seat_label,
      created_at,
      seats (
        is_vip,
        section,
        row_label,
        seat_number,
        table_number,
        table_name
      )
    `)
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  // Hydrate Ticket Tier Names
  const ticketIds = Array.from(
    new Set(
      [
        ...(instData || []).map((i) => i.ticket_id),
        ...allOrders.map((o) => o.ticket_id),
      ].filter(Boolean)
    )
  );

  let ticketNames: Record<string, { name: string; price: number }> = {};
  if (ticketIds.length > 0) {
    const { data: ticketsData } = await admin
      .from("tickets")
      .select("id, name, price")
      .in("id", ticketIds);

    if (ticketsData) {
      ticketNames = Object.fromEntries(
        ticketsData.map((t) => [t.id, { name: t.name, price: Number(t.price || 0) }])
      );
    }
  }

  let tickets: Array<{
    id: string;
    qrCode: string;
    tierName: string;
    ticketId: string | null;
    price: number;
    seatLabel: string | null;
    seat: any | null;
    status: string;
    issuedAt: string | null;
  }> = [];

  if (instData && instData.length > 0) {
    tickets = instData.map((inst) => {
      const seatObj = inst.seats as any;
      const tierInfo = inst.ticket_id ? ticketNames[inst.ticket_id] : null;
      return {
        id: inst.id,
        qrCode: inst.qr_code,
        tierName: tierInfo?.name || "General Entry",
        ticketId: inst.ticket_id || null,
        price: tierInfo?.price ?? Number(primaryOrder.total_amount || 0),
        seatLabel: inst.seat_label || null,
        seat: inst.seat_label
          ? {
              label: inst.seat_label,
              isVip: Boolean(seatObj?.is_vip),
              section: seatObj?.section,
              row: seatObj?.row_label,
              seatNumber: seatObj?.seat_number,
              tableNumber: seatObj?.table_number,
              tableName: seatObj?.table_name,
            }
          : null,
        status: inst.status || "valid",
        issuedAt: inst.created_at,
      };
    });
  } else {
    // Fallback for legacy single-row orders without ticket_instances
    tickets = allOrders.map((o) => {
      const tierInfo = o.ticket_id ? ticketNames[o.ticket_id] : null;
      return {
        id: o.id,
        qrCode: o.qr_code || "",
        tierName: tierInfo?.name || "General Entry",
        ticketId: o.ticket_id || null,
        price: tierInfo?.price ?? Number(o.total_amount || 0),
        seatLabel: o.seat_label || null,
        seat: o.seat_label ? { label: o.seat_label } : null,
        status: o.status || "valid",
        issuedAt: o.created_at,
      };
    });
  }

  const totalQuantity = allOrders.reduce((sum, o) => sum + (o.quantity || 1), 0);
  const totalAmount = allOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  return NextResponse.json({
    pending: false,
    orderId: primaryOrder.id,
    status: primaryOrder.status,
    buyerName: primaryOrder.buyer_name || null,
    buyerEmail: primaryOrder.buyer_email || null,
    totalAmount,
    currency: primaryOrder.currency || "usd",
    quantity: totalQuantity,
    event: eventData
      ? {
          id: eventData.id,
          title: eventData.title || "Event Pass",
          slug: eventData.slug || null,
          eventDate: eventData.event_date || null,
          venue: eventData.venue || null,
          city: eventData.city || null,
          banner: eventData.banner || null,
        }
      : null,
    tickets,
  });
}
