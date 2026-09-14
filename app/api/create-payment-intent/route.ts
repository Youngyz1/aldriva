import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  resolveEffectiveSeatPrice,
  formatSeatLabel,
  SectionDefinition,
  TicketTypeSummary,
} from "@/lib/seating";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",
});

function generateQRCode(): string {
  return crypto.randomUUID().replace(/-/g, "").toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe is not configured." },
        { status: 500 }
      );
    }

    // IP bucket (existing) plus a per-user bucket for signed-in callers, so
    // one authenticated abuser cannot hide behind a shared/NAT IP allowance
    // and one IP's abuse cannot lock out every other buyer behind the same IP.
    const ipLimited = await enforceRateLimit("paymentIntent", req);
    if (ipLimited) return ipLimited;

    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const userLimited = await enforceRateLimit("paymentIntent", req, user.id);
      if (userLimited) return userLimited;
    }

    const body = await req.json();
    const {
      eventId,
      ticketId,
      items, // Optional multi-tier cart array: [{ ticketId, quantity }, ...]
      seatId,
      seatLabel,
      seats, // Optional multi-seat array: [{ id, ticketId, label, price }]
      quantity,
      buyerEmail,
      buyerName,
      currency = "usd",
      checkoutAttemptId,
    } = body;

    if (!eventId) {
      return NextResponse.json(
        { error: "Missing event details." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdmin();

    // 1. Verify Event existence and approval
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("id, title, slug, status, deleted_at")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event || event.deleted_at || event.status !== "approved") {
      return NextResponse.json(
        { error: "This event is not available for ticket sales." },
        { status: 404 }
      );
    }

    let totalAmountCents = 0;
    let itemsMetadata: Array<{
      ticket_id: string;
      ticket_name: string;
      quantity: number;
      unit_price: number;
      total_amount: number;
    }> = [];
    let seatsMetadata: Array<{
      seat_id: string;
      ticket_id: string;
      seat_label: string;
    }> = [];
    let primaryTicketId: string | null = null;
    let primaryTicketName: string = "";
    let primaryQty = 1;

    // 2. Handle Multi-Seat, Multi-Tier Selection vs. Multi-Tier Cart vs. Single Tier
    if (Array.isArray(seats) && seats.length > 0) {
      // SECURITY: Stripe's charge amount is the source of truth.
      // The client-provided price field in `seats` is display-only and MUST NEVER
      // be used for billing. Every seat price is independently resolved server-side
      // via resolveEffectiveSeatPrice against the database records.
      const seatIds = seats.map((s: any) => s.id).filter(Boolean);
      if (seatIds.length === 0) {
        return NextResponse.json({ error: "Invalid seat selection." }, { status: 400 });
      }

      const [
        { data: dbSeats, error: sErr },
        { data: layout },
        { data: dbTickets, error: tErr },
      ] = await Promise.all([
        admin
          .from("seats")
          .select("id, section, row_label, seat_number, table_number, table_name, is_vip, is_accessible, status, reserved_until, price_override, ticket_type_id, assigned_invitation_id")
          .in("id", seatIds),
        admin
          .from("venue_layouts")
          .select("sections")
          .eq("event_id", eventId)
          .maybeSingle(),
        admin
          .from("tickets")
          .select("id, name, price, event_id")
          .eq("event_id", eventId),
      ]);

      if (sErr || tErr || !dbSeats || dbSeats.length !== seatIds.length) {
        return NextResponse.json(
          { error: "One or more selected seats could not be found." },
          { status: 404 }
        );
      }

      const now = new Date();
      for (const s of dbSeats) {
        if (s.assigned_invitation_id) {
          return NextResponse.json(
            { error: "One or more selected seats are reserved for invited guests." },
            { status: 409 }
          );
        }
        const isHeld = s.status === "reserved" && s.reserved_until && new Date(s.reserved_until) > now;
        if (s.status !== "available" && !isHeld) {
          return NextResponse.json(
            { error: "One or more selected seats are no longer available." },
            { status: 409 }
          );
        }
      }

      const sectionsList = (layout?.sections as unknown as SectionDefinition[]) || [];
      const ticketTypesList = (dbTickets as unknown as TicketTypeSummary[]) || [];
      const ticketMap = new Map(ticketTypesList.map((t) => [t.id, t]));
      const seatDbMap = new Map(dbSeats.map((s) => [s.id, s]));

      const tierCountMap = new Map<string, { name: string; count: number; unitPrice: number }>();

      for (const clientSeat of seats) {
        const dbSeat = seatDbMap.get(clientSeat.id);
        if (!dbSeat) continue;

        const effectivePrice = resolveEffectiveSeatPrice(
          dbSeat,
          sectionsList,
          ticketTypesList,
          ticketTypesList[0]?.price ?? 0
        );

        const seatCents = Math.round(effectivePrice * 100);
        totalAmountCents += seatCents;

        // Resolve authoritative ticket tier for this seat
        const resolvedTicketId =
          dbSeat.ticket_type_id ||
          sectionsList.find((sec) => sec.name === dbSeat.section)?.ticket_type_id ||
          clientSeat.ticketId ||
          ticketTypesList[0]?.id ||
          "";

        const ticketObj = ticketMap.get(resolvedTicketId);
        const resolvedTicketName = ticketObj?.name || "Standard";

        const label = formatSeatLabel(dbSeat);

        seatsMetadata.push({
          seat_id: dbSeat.id,
          ticket_id: resolvedTicketId,
          seat_label: label,
        });

        const existing = tierCountMap.get(resolvedTicketId) || {
          name: resolvedTicketName,
          count: 0,
          unitPrice: effectivePrice,
        };
        existing.count += 1;
        tierCountMap.set(resolvedTicketId, existing);
      }

      for (const [tid, info] of tierCountMap.entries()) {
        itemsMetadata.push({
          ticket_id: tid,
          ticket_name: info.name,
          quantity: info.count,
          unit_price: info.unitPrice,
          total_amount: (info.unitPrice * info.count),
        });
      }

      primaryTicketId = seatsMetadata[0]?.ticket_id || ticketTypesList[0]?.id || null;
      primaryTicketName = tierCountMap.get(primaryTicketId || "")?.name || ticketTypesList[0]?.name || "";
      primaryQty = seatsMetadata.length;
    } else if (Array.isArray(items) && items.length > 0) {
      const ticketIds = items.map((i: any) => i.ticketId);
      const { data: dbTickets, error: tErr } = await admin
        .from("tickets")
        .select("id, name, price, event_id")
        .in("id", ticketIds)
        .eq("event_id", eventId);

      if (tErr || !dbTickets || dbTickets.length === 0) {
        return NextResponse.json(
          { error: "One or more ticket types were not found for this event." },
          { status: 404 }
        );
      }

      const ticketMap = new Map(dbTickets.map((t) => [t.id, t]));

      for (const item of items) {
        const t = ticketMap.get(item.ticketId);
        if (!t) {
          return NextResponse.json(
            { error: `Ticket type ${item.ticketId} not found.` },
            { status: 404 }
          );
        }
        const unitPrice = Number(t.price ?? 0);
        const qty = Math.max(1, Number(item.quantity) || 1);
        const itemTotalCents = Math.round(unitPrice * qty * 100);
        totalAmountCents += itemTotalCents;

        itemsMetadata.push({
          ticket_id: t.id,
          ticket_name: t.name ?? "",
          quantity: qty,
          unit_price: unitPrice,
          total_amount: itemTotalCents / 100,
        });
      }

      if (itemsMetadata.length > 0) {
        primaryTicketId = itemsMetadata[0].ticket_id;
        primaryTicketName = itemsMetadata[0].ticket_name;
        primaryQty = itemsMetadata.reduce((sum, i) => sum + i.quantity, 0);
      }
    } else {
      // Single-tier checkout flow
      if (!ticketId) {
        return NextResponse.json(
          { error: "Missing ticket tier details." },
          { status: 400 }
        );
      }

      const { data: ticket, error: ticketError } = await admin
        .from("tickets")
        .select("id, name, price, event_id")
        .eq("id", ticketId)
        .eq("event_id", eventId)
        .maybeSingle();

      if (ticketError || !ticket) {
        return NextResponse.json(
          { error: "Ticket type not found for this event." },
          { status: 404 }
        );
      }

      const unitPrice = Number(ticket.price ?? 0);
      const qty = Math.max(1, Number(quantity) || 1);
      totalAmountCents = Math.round(unitPrice * qty * 100);

      primaryTicketId = ticket.id;
      primaryTicketName = ticket.name ?? "";
      primaryQty = qty;

      itemsMetadata.push({
        ticket_id: ticket.id,
        ticket_name: ticket.name ?? "",
        quantity: qty,
        unit_price: unitPrice,
        total_amount: totalAmountCents / 100,
      });
    }

    if (!Number.isFinite(totalAmountCents) || totalAmountCents <= 0) {
      return NextResponse.json(
        { error: "Invalid purchase total." },
        { status: 400 }
      );
    }

    const qrCode = generateQRCode();
    const idempotencyKey =
      checkoutAttemptId && typeof checkoutAttemptId === "string"
        ? `ticket-intent-${checkoutAttemptId}`
        : `ticket-${eventId}-${primaryTicketId ?? "noid"}-${primaryQty}-${Date.now()}`;

    const metadata: Record<string, string> = {
      kind: "ticket",
      qr_code: qrCode,
      event_id: event.id,
      event_slug: event.slug ?? "",
      event_title: event.title ?? "",
      ticket_id: primaryTicketId ?? "",
      ticket_name: primaryTicketName,
      seat_id: seatsMetadata[0]?.seat_id ?? seatId ?? "",
      seat_label: seatsMetadata.length > 0
        ? seatsMetadata.map((s) => s.seat_label).join(", ")
        : (seatLabel ?? ""),
      quantity: String(primaryQty),
      total_amount: String((totalAmountCents / 100).toFixed(2)),
      currency: currency.toLowerCase(),
      buyer_email: buyerEmail ?? "",
      buyer_name: buyerName ?? "",
      items_json: JSON.stringify(itemsMetadata),
      ...(seatsMetadata.length > 0 ? { seats_json: JSON.stringify(seatsMetadata) } : {}),
    };

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalAmountCents,
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: buyerEmail || undefined,
        metadata,
      },
      { idempotencyKey }
    );

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      qrCode,
    });
  } catch (err) {
    console.error("[create-payment-intent]", err);
    return NextResponse.json({ error: "Could not start the payment. Please try again." }, { status: 500 });
  }
}
