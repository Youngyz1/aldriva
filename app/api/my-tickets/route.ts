import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim();
  const orderId = req.nextUrl.searchParams.get("orderId")?.trim();

  const supabase = await createSupabaseServer();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  // Fallback for API clients: Authorization Bearer header
  if (!user) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token) {
        const adminForAuth = createSupabaseAdmin();
        const { data: tokenUser } = await adminForAuth.auth.getUser(token);
        if (tokenUser?.user) {
          user = tokenUser.user;
        }
      }
    }
  }

  const supabaseAdmin = createSupabaseAdmin();

  // Mode 1: Guest order lookup (orderId + email)
  if (orderId) {
    // Guest lookup is strictly rate limited to prevent order ID / QR enumeration
    const rateLimitRes = await enforceRateLimit("guestLookup", req, user?.id || null);
    if (rateLimitRes) return rateLimitRes;

    if (!email) {
      return NextResponse.json(
        { error: "Buyer email is required for guest order lookup." },
        { status: 400 }
      );
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
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
      `)
      .ilike("buyer_email", email);

    if (isUuid) {
      query = query.or(`id.eq.${orderId},qr_code.eq.${orderId}`);
    } else {
      query = query.eq("qr_code", orderId);
    }

    const { data: orders, error } = await query;
    if (error) {
      console.error("[my-tickets]", error);
      return NextResponse.json({ error: "Could not load tickets." }, { status: 500 });
    }

    return await formatResponseWithTickets(orders ?? []);
  }

  // Mode 2: Authenticated user lookup by email
  if (!user) {
    return NextResponse.json(
      { error: "Authentication or Order ID + Email required." },
      { status: 401 }
    );
  }

  // If email param is passed, ensure it matches session user's email
  if (email && email.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json(
      { error: "Forbidden: Cannot query tickets for another email address." },
      { status: 403 }
    );
  }

  const queryEmail = user.email!;
  const { data: orders, error } = await supabaseAdmin
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
    `)
    .ilike("buyer_email", queryEmail)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[my-tickets]", error);
    return NextResponse.json({ error: "Could not load tickets." }, { status: 500 });
  }

  return await formatResponseWithTickets(orders ?? []);
}

// Helper to hydrate ticket details (name, price)
async function formatResponseWithTickets(orders: any[]) {
  const supabaseAdmin = createSupabaseAdmin();
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
