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

    // Unauthenticated endpoint, so IP is the only available identity.
    // Checked before the Stripe PaymentIntent call below.
    const limited = await enforceRateLimit("paymentIntent", req);
    if (limited) return limited;

    const body = await req.json();
    const {
      eventId,
      ticketId,
      seatId,
      seatLabel,
      quantity,
      buyerEmail,
      buyerName,
      currency = "usd",
      // UUID generated on the client at the moment the user clicks "Continue".
      // A fresh UUID is created for every new checkout attempt, preventing
      // StripeIdempotencyError when the user goes back and tries again.
      checkoutAttemptId,
    } = body;
    // ticketName/ticketPrice are deliberately no longer read from the
    // request body — see the server-side lookups below. A client that
    // still sends them (older cached bundle, etc.) has those fields
    // silently ignored, not merged in.

    if (!eventId || !ticketId) {
      return NextResponse.json(
        { error: "Missing event or ticket details." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdmin();

    // 1. Event must exist, be approved, and not be soft-deleted. Matches
    // /api/checkout/product's pattern: fetch and validate purchasability
    // server-side before trusting anything else in the request.
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("id, title, slug, status, deleted_at")
      .eq("id", eventId)
      .maybeSingle();

    // Deliberately one message for "doesn't exist" and "exists but not
    // approved yet" — event IDs are random UUIDs, not sequential, so brute
    // forcing them isn't practical either way, but this still avoids
    // confirming the existence of a pending (not yet publicly announced)
    // event to an unauthenticated ticket-purchase probe.
    if (eventError || !event || event.deleted_at || event.status !== "approved") {
      return NextResponse.json(
        { error: "This event is not available for ticket sales." },
        { status: 404 }
      );
    }

    // 2. Ticket tier must exist AND belong to this exact event — the
    // .eq("event_id", eventId) closes a substitution gap beyond just price
    // spoofing: without it, a real ticketId from a different (possibly
    // cheaper) event could be paired with an unrelated eventId in the rest
    // of the payload.
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

    // 3. Price and total are computed only from the server-verified ticket
    // row — never from client input. Same discipline as
    // /api/checkout/product's stripe.prices.retrieve() call: the client's
    // declared price is not read at all, so there's nothing to "mismatch"
    // against.
    const unitPrice = Number(ticket.price ?? 0);
    const qty = Math.max(1, Number(quantity) || 1);
    const totalAmount = Math.round(unitPrice * qty * 100); // Stripe uses cents

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return NextResponse.json(
        { error: "This ticket type does not have a valid price configured." },
        { status: 400 }
      );
    }

    // Generate QR code here so the webhook can use it to create the order
    const qrCode = generateQRCode();

    // Idempotency key: use the client-supplied UUID so that:
    //  • Refreshing the review page with the same UUID reuses the existing intent
    //  • Going back and clicking Continue again generates a new UUID → new intent
    // Fall back to a deterministic key only if no UUID is supplied (legacy callers).
    const idempotencyKey =
      checkoutAttemptId && typeof checkoutAttemptId === "string"
        ? `ticket-intent-${checkoutAttemptId}`
        : `ticket-${eventId}-${ticketId ?? "noid"}-${qty}-${Date.now()}`;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalAmount,
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: buyerEmail || undefined,
        metadata: {
          // Identifies this intent as a ticket purchase for the webhook
          kind: "ticket",
          // Pre-generated QR — written to ticket_orders by the webhook
          qr_code: qrCode,
          event_id: event.id,
          event_slug: event.slug ?? "",
          // Server-verified title/name, not the client-supplied values —
          // these only ever feed display text (confirmation email), but
          // there's no reason to trust client input for them once we're
          // already fetching the real rows.
          event_title: event.title ?? "",
          ticket_id: ticket.id,
          ticket_name: ticket.name ?? "",
          seat_id: seatId ?? "",
          seat_label: seatLabel ?? "",
          quantity: String(qty),
          unit_price: String(unitPrice),
          total_amount: String((totalAmount / 100).toFixed(2)),
          currency: currency.toLowerCase(),
          buyer_email: buyerEmail ?? "",
          buyer_name: buyerName ?? "",
        },
      },
      { idempotencyKey }
    );

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      qrCode, // returned so the success screen can show it immediately
    });
  } catch (err) {
    console.error("[create-payment-intent]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
