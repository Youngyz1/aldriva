/**
 * lib/ticket-pricing.ts
 *
 * Single server-authoritative source of truth for ticket checkout pricing.
 *
 * SECURITY: the client must NEVER determine the final ticket price. Every
 * ticket-selling endpoint (card, crypto, legacy checkout) resolves the total
 * through `resolveTicketCheckoutPricing()`, which derives the unit price from
 * the database (ticket tier → seat override → section default) and validates
 * event/ticket/seat relationships plus inventory server-side.
 *
 * Takes an already-privileged Supabase client (service role) — callers are
 * server-only API routes that bypass RLS intentionally and re-enforce every
 * check here in code.
 */

import {
  resolveEffectiveSeatPrice,
  type SectionDefinition,
  type TicketTypeSummary,
} from "@/lib/seating";

export const TICKET_MAX_QUANTITY = 100;

type SupabaseAdminLike = {
  from: (table: string) => any;
};

export type TicketPricingSuccess = {
  ok: true;
  event: { id: string; title: string; slug: string };
  ticketName: string;
  unitPrice: number;
  quantity: number;
  totalCents: number;
};

export type TicketPricingFailure = {
  ok: false;
  status: number;
  error: string;
};

export async function resolveTicketCheckoutPricing(
  supabaseAdmin: SupabaseAdminLike,
  opts: {
    eventId: unknown;
    ticketId: unknown;
    seatId?: unknown;
    quantity?: unknown;
  }
): Promise<TicketPricingSuccess | TicketPricingFailure> {
  const fail = (status: number, error: string): TicketPricingFailure => ({
    ok: false,
    status,
    error,
  });

  const eventId = typeof opts.eventId === "string" ? opts.eventId : "";
  const ticketId = typeof opts.ticketId === "string" ? opts.ticketId : "";
  const seatId =
    typeof opts.seatId === "string" && opts.seatId.length > 0 ? opts.seatId : null;
  const quantity = Math.min(
    TICKET_MAX_QUANTITY,
    Math.max(1, Math.floor(Number(opts.quantity)) || 1)
  );

  if (!eventId || !ticketId) {
    return fail(400, "Invalid checkout details.");
  }

  // 1. Event must exist and be on sale.
  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, title, slug, status, deleted_at")
    .eq("id", eventId)
    .maybeSingle();

  if (
    eventError ||
    !event ||
    (event as { deleted_at?: unknown }).deleted_at ||
    event.status !== "approved"
  ) {
    return fail(404, "This event is not available for ticket sales.");
  }

  // 2. Ticket must exist AND belong to this event. Its DB price is law —
  // any client-supplied price is ignored by callers.
  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from("tickets")
    .select("id, name, price, quantity, event_id")
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (ticketError || !ticket) {
    return fail(404, "Ticket type not found for this event.");
  }

  const ticketPrice = Number(ticket.price ?? 0);
  if (!Number.isFinite(ticketPrice) || ticketPrice < 0) {
    console.error("[ticket-pricing] Ticket has misconfigured price:", {
      ticketId,
      price: ticket.price,
    });
    return fail(500, "Ticket pricing is misconfigured. Please contact support.");
  }

  let unitPrice = ticketPrice;

  // 3. Inventory gate (fail closed on error or over-capacity).
  const capacity = ticket.quantity == null ? null : Number(ticket.quantity);
  if (capacity != null && Number.isFinite(capacity)) {
    const { data: heldRows, error: heldError } = await supabaseAdmin
      .from("ticket_orders")
      .select("quantity")
      .eq("ticket_id", ticketId)
      .in("status", ["pending", "valid", "used"]);

    if (heldError) {
      console.error("[ticket-pricing] Inventory check failed:", heldError.message);
      return fail(500, "Could not verify ticket availability. Please try again.");
    }

    const held = (heldRows ?? []).reduce(
      (sum: number, row: { quantity?: unknown }) => sum + (Number(row.quantity) || 0),
      0
    );
    if (held + quantity > capacity) {
      return fail(409, "Not enough tickets available.");
    }
  }

  // 4. Seat validation + authoritative seat price (same precedence the seat
  // map advertises: price_override → ticket tier → section default).
  if (seatId) {
    const { data: seat, error: seatError } = await supabaseAdmin
      .from("seats")
      .select(
        "id, event_id, status, reserved_until, price_override, ticket_type_id, ticket_id, section"
      )
      .eq("id", seatId)
      .maybeSingle();

    if (seatError || !seat || seat.event_id !== eventId) {
      return fail(400, "Selected seat is not valid for this event.");
    }

    const binding =
      (seat as { ticket_type_id?: string | null }).ticket_type_id ??
      (seat as { ticket_id?: string | null }).ticket_id ??
      null;
    if (binding && binding !== ticketId) {
      return fail(400, "Selected seat is not valid for this ticket type.");
    }

    const holdExpired =
      seat.status === "reserved" &&
      seat.reserved_until != null &&
      new Date(seat.reserved_until).getTime() <= Date.now();
    if (seat.status !== "available" && !holdExpired) {
      return fail(409, "Selected seat is no longer available.");
    }

    const [{ data: layout }, { data: ticketTypes }] = await Promise.all([
      supabaseAdmin
        .from("venue_layouts")
        .select("sections")
        .eq("event_id", eventId)
        .maybeSingle(),
      supabaseAdmin.from("tickets").select("id, name, price").eq("event_id", eventId),
    ]);

    const sections = ((): SectionDefinition[] => {
      const raw = (layout as { sections?: unknown } | null)?.sections;
      return Array.isArray(raw) ? (raw as SectionDefinition[]) : [];
    })();
    const summaries: TicketTypeSummary[] = (
      (ticketTypes ?? []) as { id: string; name?: string | null; price?: number | null }[]
    ).map((t) => ({ id: t.id, event_id: eventId, name: t.name ?? "", price: t.price ?? 0 }));

    unitPrice = resolveEffectiveSeatPrice(
      {
        price_override: seat.price_override == null ? null : Number(seat.price_override),
        ticket_type_id:
          (seat as { ticket_type_id?: string | null }).ticket_type_id ?? null,
        section: (seat as { section?: string }).section,
      },
      sections,
      summaries,
      ticketPrice
    );

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      console.error("[ticket-pricing] Seat has misconfigured price:", { seatId });
      return fail(500, "Ticket pricing is misconfigured. Please contact support.");
    }
  }

  const totalCents = Math.round(unitPrice * quantity * 100);
  if (!Number.isFinite(totalCents) || totalCents < 0) {
    return fail(400, "Invalid checkout details.");
  }

  return {
    ok: true,
    event: { id: event.id, title: event.title ?? "", slug: event.slug ?? "" },
    ticketName: ticket.name ?? "",
    unitPrice,
    quantity,
    totalCents,
  };
}
