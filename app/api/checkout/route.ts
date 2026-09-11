import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSiteUrl } from "@/lib/site-url";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveTicketCheckoutPricing } from "@/lib/ticket-pricing";

// Service role: bypasses RLS — admin operations only
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — server misconfiguration.");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generateQRCode(): string {
  return crypto.randomUUID().replace(/-/g, "").toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    // Money-moving endpoint: bound card-testing / order-spam abuse.
    const limited = await enforceRateLimit("paymentIntent", req);
    if (limited) return limited;

    const {
      // NOTE: legacy clients may still send `ticketPrice`, `eventTitle`,
      // `eventSlug`, `ticketName` — they are accepted but NEVER trusted for
      // pricing, identity, or redirect targets. The database (via
      // resolveTicketCheckoutPricing) is the sole source of truth.
      eventId,
      ticketId,
      seatId,
      seatLabel,
      quantity,
      buyerEmail,
      buyerName,
      checkoutAttemptId,
    } = await req.json();

    const baseUrl = getSiteUrl();

    // Server-authoritative pricing + validation: event on sale, ticket
    // belongs to event, seat valid for event/ticket, inventory available.
    // A client-supplied price can never reduce the database-derived total.
    const pricing = await resolveTicketCheckoutPricing(supabaseAdmin, {
      eventId,
      ticketId,
      seatId,
      quantity,
    });

    if (!pricing.ok) {
      return NextResponse.json({ error: pricing.error }, { status: pricing.status });
    }

    const { event, ticketName, unitPrice, quantity: safeQuantity, totalCents } = pricing;

    const attemptMarker =
      typeof checkoutAttemptId === "string" && checkoutAttemptId.length > 0
        ? checkoutAttemptId.slice(0, 128)
        : null;

    // Free ticket — ONLY reachable when the DATABASE-derived total is zero.
    if (totalCents === 0) {
      // Idempotent retry: the same attempt must not mint a second ticket.
      const idempotencyMarker = attemptMarker ? `free:${attemptMarker}` : null;
      if (idempotencyMarker) {
        const { data: existing } = await supabaseAdmin
          .from("ticket_orders")
          .select("qr_code")
          .eq("event_id", event.id)
          .eq("stripe_session_id", idempotencyMarker)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({
            url: `${baseUrl}/ticket-confirmation?qr=${existing.qr_code}&event=${event.slug}&free=true`,
          });
        }
      }

      const qrCode = generateQRCode();

      const { error: insertError } = await supabaseAdmin.from("ticket_orders").insert({
        event_id: event.id,
        ticket_id: ticketId,
        seat_id: seatId || null,
        seat_label: seatLabel || null,
        buyer_email: buyerEmail || null,
        buyer_name: buyerName || null,
        quantity: safeQuantity,
        total_amount: 0,
        currency: "usd",
        qr_code: qrCode,
        status: "valid",
        payment_method: "free",
        ...(idempotencyMarker ? { stripe_session_id: idempotencyMarker } : {}),
      });

      if (insertError) {
        console.error("[checkout] Free order insert failed:", insertError.message);
        return NextResponse.json(
          { error: "Could not complete checkout. Please try again." },
          { status: 500 }
        );
      }

      if (seatId) {
        await supabaseAdmin
          .from("seats")
          .update({ status: "sold", reserved_until: null })
          .eq("id", seatId)
          .eq("event_id", event.id);
      }

      // Send free ticket email
      if (buyerEmail) {
        await fetch(`${baseUrl}/api/send-ticket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyerEmail,
            buyerName,
            eventTitle: event.title,
            eventSlug: event.slug,
            qrCode,
            seatLabel,
            isFree: true,
          }),
        });
      }

      return NextResponse.json({
        url: `${baseUrl}/ticket-confirmation?qr=${qrCode}&event=${event.slug}&free=true`,
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
    }

    // Paid branch — Stripe amount comes from the DATABASE total, never the client.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const qrCode = generateQRCode();
    const idempotencyKey = attemptMarker
      ? `checkout-session-${attemptMarker}`
      : `checkout-session-${event.id}-${ticketId}-${safeQuantity}-${Date.now()}`;

    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
        customer_email: buyerEmail || undefined,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${event.title} — ${ticketName || "Ticket"}${seatLabel ? ` (${seatLabel})` : ""}`,
              },
              unit_amount: Math.round(unitPrice * 100),
            },
            quantity: safeQuantity,
          },
        ],
        mode: "payment",
        success_url: `${baseUrl}/ticket-confirmation?qr=${qrCode}&event=${event.slug}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/events/${event.slug}?cancelled=true`,
        metadata: {
          qr_code: qrCode,
          event_id: event.id,
          ticket_id: ticketId,
          seat_id: seatId || "",
          seat_label: seatLabel || "",
          event_slug: event.slug,
          event_title: event.title,
          ticket_name: ticketName,
          quantity: String(safeQuantity),
          buyer_name: buyerName || "",
          buyer_email: buyerEmail || "",
          total_amount: (totalCents / 100).toFixed(2),
        },
      },
      { idempotencyKey }
    );

    // Only reserve the seat — do NOT create the order yet
    // Order is created in the webhook after payment is confirmed
    if (seatId) {
      await supabaseAdmin
        .from("seats")
        .update({
          status: "reserved",
          reserved_until: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        })
        .eq("id", seatId)
        .eq("event_id", event.id)
        .eq("status", "available");
    }

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error("[checkout]", err);
    return NextResponse.json(
      { error: "Could not complete checkout. Please try again." },
      { status: 500 }
    );
  }
}
