import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

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

    const limited = await enforceRateLimit("paymentIntent", req);
    if (limited) return limited;

    const body = await req.json();
    const {
      eventId,
      ticketId,
      items, // Optional multi-tier cart array: [{ ticketId, quantity }, ...]
      seatId,
      seatLabel,
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
    let primaryTicketId: string | null = null;
    let primaryTicketName: string = "";
    let primaryQty = 1;

    // 2. Handle Multi-Tier Cart vs. Single Tier
    if (Array.isArray(items) && items.length > 0) {
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
      seat_id: seatId ?? "",
      seat_label: seatLabel ?? "",
      quantity: String(primaryQty),
      total_amount: String((totalAmountCents / 100).toFixed(2)),
      currency: currency.toLowerCase(),
      buyer_email: buyerEmail ?? "",
      buyer_name: buyerName ?? "",
      items_json: JSON.stringify(itemsMetadata),
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
      qrCode,
    });
  } catch (err) {
    console.error("[create-payment-intent]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
