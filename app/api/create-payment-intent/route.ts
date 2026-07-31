import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

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

    const body = await req.json();
    const {
      ticketName,
      ticketPrice,
      eventTitle,
      eventSlug,
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

    const unitPrice = Number(ticketPrice);
    const qty = Math.max(1, Number(quantity) || 1);
    const totalAmount = Math.round(unitPrice * qty * 100); // Stripe uses cents

    if (!eventId || !ticketName || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid payment amount or missing event details." },
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
          event_id: eventId ?? "",
          event_slug: eventSlug ?? "",
          event_title: eventTitle ?? "",
          ticket_id: ticketId ?? "",
          ticket_name: ticketName ?? "",
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