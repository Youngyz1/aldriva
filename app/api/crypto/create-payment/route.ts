import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { tagCryptoOrderId, getNowPaymentsConfig } from "@/lib/cryptoPayment";
import { getSiteUrl } from "@/lib/site-url";
import { resolveTicketCheckoutPricing } from "@/lib/ticket-pricing";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
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
    const body = await req.json();
    const supabase = await createSupabaseServer();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id ?? null;

    // Money-moving endpoint: same paymentIntent tier as checkout/donate.
    // Signed-in callers key on user id; guests fall back to IP.
    const limited = await enforceRateLimit("paymentIntent", req, userId);
    if (limited) return limited;
    const {
      amount,
      currency = "usd",
      fundraiserSlug,
      eventId,
      donorName,
      donorEmail,
      type, // "donation" or "ticket"
      
      // Optional/Extra fields
      message,
      anonymous,
      ticketId,
      seatId,
      seatLabel,
      seats,
      quantity = 1,
    } = body;

    // Donations are donor-chosen amounts (validated below). Ticket totals
    // are ALWAYS re-derived from the database — see the ticket branch.
    let numAmount = Number(amount);
    if (!type || !numAmount || numAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid payment details: type and amount are required." },
        { status: 400 }
      );
    }

    const nowPayments = getNowPaymentsConfig();
    if (!nowPayments.apiKey) {
      return NextResponse.json(
        { error: "NOWPayments is not configured on the server." },
        { status: 500 }
      );
    }

    const baseUrl = getSiteUrl();
    const ipnCallbackUrl = `${baseUrl}/api/crypto/webhook`;

    // Create NOWPayments invoice
    let cancelUrl = baseUrl;
    let orderDescription = "";
    let fundraiserId: string | null = null;
    let eventSlug = "";

    if (type === "donation") {
      if (!fundraiserSlug) {
        return NextResponse.json({ error: "fundraiserSlug is required for donations." }, { status: 400 });
      }
      
      // Look up fundraiser by slug
      const { data: fundraiser, error: fundErr } = await supabaseAdmin
        .from("fundraisers")
        .select("id, title")
        .eq("slug", fundraiserSlug)
        .maybeSingle();

      if (fundErr || !fundraiser) {
        return NextResponse.json({ error: "Fundraiser not found." }, { status: 404 });
      }

      fundraiserId = fundraiser.id;
      cancelUrl = `${baseUrl}/fundraisers/${fundraiserSlug}`;
      orderDescription = `Donation to "${fundraiser.title}"`;
    } else if (type === "ticket") {
      if (!eventId) {
        return NextResponse.json({ error: "eventId is required for ticket purchases." }, { status: 400 });
      }

      // SECURITY: the client MUST NOT set the ticket price. Re-derive the
      // authoritative total from the database (tier → seat → section pricing,
      // plus event/ticket/seat relationship and inventory checks). A
      // tampered `amount` can never reduce what the buyer is charged.
      const pricing = await resolveTicketCheckoutPricing(supabaseAdmin, {
        eventId,
        ticketId,
        seatId,
        quantity,
      });

      if (!pricing.ok) {
        return NextResponse.json({ error: pricing.error }, { status: pricing.status });
      }

      if (pricing.totalCents <= 0) {
        return NextResponse.json(
          { error: "This ticket is free — please use the free checkout." },
          { status: 400 }
        );
      }

      numAmount = pricing.totalCents / 100;

      // Look up event slug for cancel_url (already validated by pricing).
      const { data: event, error: eventErr } = await supabaseAdmin
        .from("events")
        .select("slug, title")
        .eq("id", eventId)
        .maybeSingle();

      if (eventErr || !event) {
        return NextResponse.json({ error: "Event not found." }, { status: 404 });
      }

      eventSlug = event.slug;
      cancelUrl = `${baseUrl}/events/${eventSlug}?cancelled=true`;
      orderDescription = `Ticket order for "${event.title}"`;
    } else {
      return NextResponse.json({ error: "Invalid type. Must be donation or ticket." }, { status: 400 });
    }

    const orderId = crypto.randomUUID();

    // NOWPayments does NOT support placeholder syntax like {payment_id} in URLs.
    // Curly braces are invalid URI characters and will cause a validation error.
    // We use our own orderId (generated before the API call) so the success_url
    // is a fully-formed absolute URL that NOWPayments can validate.
    const successUrl = `${baseUrl}/crypto-pending?orderId=${orderId}`;

    // Validate URLs before sending to NOWPayments to surface misconfigurations early.
    try {
      new URL(successUrl);
      new URL(cancelUrl);
      new URL(ipnCallbackUrl);
    } catch (urlErr) {
      console.error("[create-payment] Invalid URL detected:", { successUrl, cancelUrl, ipnCallbackUrl }, urlErr);
      return NextResponse.json(
        { error: "Server misconfiguration: invalid callback URL." },
        { status: 500 }
      );
    }

    console.log("[create-payment] Calling NOWPayments with URLs:", {
      success_url: successUrl,
      cancel_url: cancelUrl,
      ipn_callback_url: ipnCallbackUrl,
    });

    // Call NOWPayments API to create invoice
    const nowpaymentsRes = await fetch(`${nowPayments.baseUrl}/invoice`, {
      method: "POST",
      headers: {
        "x-api-key": nowPayments.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: numAmount,
        price_currency: currency.toLowerCase(),
        // Tagged with the kind so the IPN webhook can dispatch to exactly
        // one table instead of probing donations/ticket_orders in sequence.
        // The row's own primary key (orderId) is untouched — only what we
        // send to NOWPayments carries the tag.
        order_id: tagCryptoOrderId(type === "donation" ? "donation" : "ticket", orderId),
        order_description: orderDescription,
        ipn_callback_url: ipnCallbackUrl,
        success_url: successUrl,
        cancel_url: cancelUrl,
      }),
    });

    const nowpaymentsData = await nowpaymentsRes.json();
    if (!nowpaymentsRes.ok || !nowpaymentsData.invoice_url) {
      console.error("NOWPayments invoice error:", nowpaymentsData);
      return NextResponse.json(
        { error: nowpaymentsData.message || "Failed to create NOWPayments invoice." },
        { status: 502 }
      );
    }

    const paymentId = String(nowpaymentsData.id);
    const paymentUrl = nowpaymentsData.invoice_url;

    // Save pending record in Supabase
    if (type === "donation") {
      const { error: insertError } = await supabaseAdmin.from("donations").insert({
        id: orderId,
        fundraiser_id: fundraiserId,
        donor_name: anonymous ? "Anonymous" : (donorName || "Anonymous"),
        donor_email: donorEmail || null,
        user_id: userId,
        message: message || null,
        amount: numAmount,
        currency: currency.toUpperCase(),
        status: "pending",
        payment_intent_id: paymentId,
        payment_method: "crypto",
      });

      if (insertError) {
        console.error("Supabase donation insert error:", insertError);
        return NextResponse.json({ error: "Database error recording donation." }, { status: 500 });
      }
    } else if (type === "ticket") {
      const qrCode = generateQRCode();
      // Mirror the authoritative pricing validation (1–100); the price
      // itself was already re-derived from the database above.
      const safeQuantity = Math.min(100, Math.max(1, Math.floor(Number(quantity)) || 1));

      // Reserve seat(s) if applicable
      const seatIdsToReserve = Array.isArray(seats) && seats.length > 0
        ? seats.map((s: any) => s.id).filter(Boolean)
        : seatId
        ? [seatId]
        : [];

      if (seatIdsToReserve.length > 0) {
        const { data: seatData, error: seatCheckError } = await supabaseAdmin
          .from("seats")
          .select("id, status, reserved_until")
          .in("id", seatIdsToReserve)
          .eq("event_id", eventId);

        const now = new Date();
        const unavailable = (seatData || []).filter(
          (s) => s.status !== "available" && !(s.status === "reserved" && s.reserved_until && new Date(s.reserved_until) > now)
        );

        if (seatCheckError || !seatData || seatData.length !== seatIdsToReserve.length || unavailable.length > 0) {
          return NextResponse.json({ error: "One or more seats are no longer available." }, { status: 400 });
        }

        const { error: reserveError } = await supabaseAdmin
          .from("seats")
          .update({
            status: "reserved",
            reserved_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour for crypto confirmations
          })
          .in("id", seatIdsToReserve)
          .eq("event_id", eventId);

        if (reserveError) {
          console.error("Seat reservation error:", reserveError);
          return NextResponse.json({ error: "Failed to reserve seats." }, { status: 500 });
        }
      }

      const { error: insertError } = await supabaseAdmin.from("ticket_orders").insert({
        id: orderId,
        event_id: eventId,
        ticket_id: ticketId || null,
        seat_id: seatId || null,
        seat_label: seatLabel || null,
        buyer_email: donorEmail || null,
        buyer_name: donorName || null,
        quantity: safeQuantity,
        total_amount: numAmount,
        currency: currency.toLowerCase(),
        qr_code: qrCode,
        status: "pending",
        stripe_payment_intent_id: paymentId,
        payment_method: "crypto",
      });

      if (insertError) {
        console.error("Supabase ticket order insert error:", insertError);
        // Release seat if insert failed
        if (seatId) {
          await supabaseAdmin
            .from("seats")
            .update({ status: "available", reserved_until: null })
            .eq("id", seatId)
            .eq("event_id", eventId);
        }
        return NextResponse.json({ error: "Database error recording ticket order." }, { status: 500 });
      }
    }

    return NextResponse.json({ paymentUrl, paymentId });
  } catch (err: unknown) {
    console.error("create-payment route error:", err);
    return NextResponse.json(
      { error: "Could not start the payment. Please try again." },
      { status: 500 }
    );
  }
}
