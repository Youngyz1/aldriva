import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  reserveSeatsAtomic,
  resolveEffectiveSeatPrice,
  SectionDefinition,
  TicketTypeSummary,
} from "@/lib/seating";

const supabaseAdmin = createSupabaseAdmin();

// GET /api/seats?event_id=XXX — get published layout, venue objects, and spatial seat availability
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("event_id");

  if (!eventId) {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }

  // 1. Fetch layout
  const { data: layout } = await supabaseAdmin
    .from("venue_layouts")
    .select(
      "id, name, sections, venue_objects, canvas_width, canvas_height, is_published, version"
    )
    .eq("event_id", eventId)
    .maybeSingle();

  if (!layout) {
    return NextResponse.json({ layout: null, seats: [], ticket_types: [] });
  }

  // 2. Fetch ticket types
  const { data: ticketTypes } = await supabaseAdmin
    .from("tickets")
    .select("id, event_id, name, price, quantity")
    .eq("event_id", eventId)
    .order("price", { ascending: true });

  // 3. Fetch seats
  const { data: seats } = await supabaseAdmin
    .from("seats")
    .select(
      "id, section, row_label, seat_number, table_number, table_name, table_capacity, is_vip, is_accessible, status, reserved_until, price_override, ticket_type_id, assigned_invitation_id, x, y, width, height, rotation, object_type"
    )
    .eq("layout_id", layout.id)
    .order("section")
    .order("row_label")
    .order("seat_number");

  const sectionsList = (layout.sections as unknown as SectionDefinition[]) || [];
  const ticketTypesList = (ticketTypes as unknown as TicketTypeSummary[]) || [];

  // Compute effective price for each seat
  const enrichedSeats = (seats || []).map((s) => {
    const effectivePrice = resolveEffectiveSeatPrice(
      s,
      sectionsList,
      ticketTypesList,
      ticketTypesList[0]?.price ?? 0
    );

    return {
      ...s,
      effective_price: effectivePrice,
    };
  });

  return NextResponse.json({
    layout,
    seats: enrichedSeats,
    ticket_types: ticketTypesList,
  });
}

// POST /api/seats — atomic temporary seat reservation for ticket checkout
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const seatIds = body.seatIds as string[] | undefined;
    const holdDurationMinutes = (body.holdDurationMinutes as number) || 5;

    if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return NextResponse.json({ error: "seatIds array is required" }, { status: 400 });
    }

    // Atomic hold reservation with FOR UPDATE row locks
    const result = await reserveSeatsAtomic(seatIds, holdDurationMinutes);

    if (!result.success) {
      if (result.error && result.error !== "Some seats are no longer available.") {
        console.error("[seats]", result.error);
      }
      return NextResponse.json(
        {
          error: "Some seats are no longer available.",
          unavailableIds: result.unavailable_ids || [],
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      reservedUntil: result.reserved_until,
    });
  } catch (err: unknown) {
    console.error("[seats]", err);
    return NextResponse.json({ error: "Could not load seats. Please try again." }, { status: 500 });
  }
}
