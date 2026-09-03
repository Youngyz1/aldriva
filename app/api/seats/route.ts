import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const supabaseAdmin = createSupabaseAdmin();

// GET /api/seats?event_id=XXX — get seat availability for an event
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("event_id");

  if (!eventId) {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }

  const { data: layout } = await supabaseAdmin
    .from("venue_layouts")
    .select("id, name, sections")
    .eq("event_id", eventId)
    .single();

  if (!layout) {
    return NextResponse.json({ layout: null, seats: [] });
  }

  const { data: seats } = await supabaseAdmin
    .from("seats")
    .select("id, section, row_label, seat_number, table_number, table_name, table_capacity, is_vip, status, price_override, assigned_invitation_id")
    .eq("layout_id", layout.id);

  return NextResponse.json({ layout, seats: seats || [] });
}

// POST /api/seats/reserve — temporarily reserve seats for ticket purchase
export async function POST(req: NextRequest) {
  try {
    const { seatIds } = await req.json();

    if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return NextResponse.json({ error: "seatIds required" }, { status: 400 });
    }

    // Check all seats are still available and not assigned to an invited guest
    const { data: seats } = await supabaseAdmin
      .from("seats")
      .select("id, status, reserved_until, assigned_invitation_id")
      .in("id", seatIds);

    const unavailable = (seats || []).filter(
      (s) =>
        s.status === "sold" ||
        s.assigned_invitation_id !== null ||
        (s.status === "reserved" && s.reserved_until && new Date(s.reserved_until) > new Date())
    );

    if (unavailable.length > 0) {
      return NextResponse.json(
        { error: "Some seats are no longer available.", unavailableIds: unavailable.map((s) => s.id) },
        { status: 409 }
      );
    }

    // Reserve for 5 minutes
    const reservedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("seats")
      .update({ status: "reserved", reserved_until: reservedUntil })
      .in("id", seatIds);

    return NextResponse.json({ success: true, reservedUntil });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
