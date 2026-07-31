import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    } = await req.json();

    const amount = Math.round(Number(ticketPrice) * 100);
    const safeQuantity = Math.max(1, Number(quantity) || 1);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;

    if (!eventSlug || !ticketName || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Invalid checkout details." }, { status: 400 });
    }

    // Free ticket — create order immediately
    if (amount === 0) {
      const qrCode = generateQRCode();

      if (eventId) {
        await supabaseAdmin.from("ticket_orders").insert({
          event_id: eventId,
          ticket_id: ticketId || null,
          seat_id: seatId || null,
          seat_label: seatLabel || null,
          buyer_email: buyerEmail || null,
          buyer_name: buyerName || null,
          quantity: safeQuantity,
          total_amount: 0,
          qr_code: qrCode,
          status: "valid",
        });

        if (seatId) {
          await supabaseAdmin
            .from("seats")
            .update({ status: "sold", reserved_until: null })
            .eq("id", seatId);
        }

        // Send free ticket email
        if (buyerEmail) {
          await fetch(`${baseUrl}/api/send-ticket`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              buyerEmail,
              buyerName,
              eventTitle,
              eventSlug,
              qrCode,
              seatLabel,
              isFree: true,
            }),
          });
        }
      }

      return NextResponse.json({
        url: `${baseUrl}/ticket-confirmation?qr=${qrCode}&event=${eventSlug}&free=true`,
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const qrCode = generateQRCode();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: buyerEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${eventTitle} — ${ticketName}${seatLabel ? ` (${seatLabel})` : ""}`,
            },
            unit_amount: amount,
          },
          quantity: safeQuantity,
        },
      ],
      mode: "payment",
      success_url: `${baseUrl}/ticket-confirmation?qr=${qrCode}&event=${eventSlug}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/events/${eventSlug}?cancelled=true`,
      metadata: {
        qr_code: qrCode,
        event_id: eventId || "",
        ticket_id: ticketId || "",
        seat_id: seatId || "",
        seat_label: seatLabel || "",
        event_slug: eventSlug,
        event_title: eventTitle,
        ticket_name: ticketName,
        quantity: String(safeQuantity),
        buyer_name: buyerName || "",
        buyer_email: buyerEmail || "",
        total_amount: String((amount / 100) * safeQuantity),
      },
    });

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
        .eq("status", "available");
    }

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}