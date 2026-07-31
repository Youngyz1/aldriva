import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim();
  const orderId = req.nextUrl.searchParams.get("orderId")?.trim();

  if (!email && !orderId) {
    return NextResponse.json({ error: "Email or Order ID required." }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("ticket_orders")
    .select(`
      id,
      qr_code,
      status,
      seat_label,
      quantity,
      total_amount,
      created_at,
      checked_in_at,
      buyer_email,
      buyer_name,
      ticket_id,
      events (
        id,
        title,
        event_date,
        venue,
        city,
        banner,
        slug
      )
    `);

  if (orderId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    if (isUuid) {
      query = query.or(`id.eq.${orderId},qr_code.eq.${orderId}`);
    } else {
      query = query.eq("qr_code", orderId);
    }
  } else if (email) {
    query = query.eq("buyer_email", email);
  }

  const { data: orders, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ticketIds = Array.from(
    new Set((orders ?? []).map((order) => order.ticket_id).filter(Boolean))
  );
  const { data: tickets } = ticketIds.length
    ? await supabaseAdmin
        .from("tickets")
        .select("id, name, price")
        .in("id", ticketIds)
    : { data: [] };
  const ticketById = new Map((tickets ?? []).map((ticket) => [ticket.id, ticket]));
  const ordersWithTickets = (orders ?? []).map((order) => ({
    ...order,
    tickets: order.ticket_id ? ticketById.get(order.ticket_id) ?? null : null,
  }));

  return NextResponse.json({ orders: ordersWithTickets });
}
