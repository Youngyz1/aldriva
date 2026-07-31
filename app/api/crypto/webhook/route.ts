import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { processDonationCertificate } from "@/lib/certificate";
import { processDonationReceipt } from "@/lib/receipt";
import { recalculateFundraiserRaised } from "@/lib/donations";
import { parseCryptoOrderId, getNowPaymentsConfig } from "@/lib/cryptoPayment";
import { markProductOrderPaid } from "@/lib/productOrders";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Recursively rebuilds an object/array with object keys sorted at every
// nesting level (not just the top). NOWPayments' reference implementation
// signs via Python's json.dumps(obj, sort_keys=True), which sorts keys
// recursively — JSON.stringify(obj, arrayReplacer) does not: the array acts
// as a flat allowlist reapplied at every level, silently dropping any nested
// object's fields whose names aren't also top-level key names. That mismatch
// is what caused every IPN signature check to fail.
function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((sorted: Record<string, any>, key) => {
        sorted[key] = sortKeysDeep(value[key]);
        return sorted;
      }, {});
  }
  return value;
}

function verifySignature(reqBody: any, signature: string, ipnSecret: string) {
  try {
    const sortedString = JSON.stringify(sortKeysDeep(reqBody));
    const hmac = crypto.createHmac("sha512", ipnSecret);
    hmac.update(sortedString);
    const calculatedSignature = hmac.digest("hex");
    return calculatedSignature === signature;
  } catch (err) {
    console.error("Signature verification helper error:", err);
    return false;
  }
}

async function sendTicketEmail(params: {
  buyerEmail: string;
  buyerName: string;
  eventTitle: string;
  eventSlug: string;
  qrCode: string;
  seatLabel: string | null;
  isFree: boolean;
  base: string;
}) {
  try {
    await fetch(`${params.base}/api/send-ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerEmail: params.buyerEmail,
        buyerName: params.buyerName,
        eventTitle: params.eventTitle,
        eventSlug: params.eventSlug,
        qrCode: params.qrCode,
        seatLabel: params.seatLabel,
        isFree: params.isFree,
      }),
    });
  } catch (err) {
    console.error("[crypto webhook] Failed to send ticket email:", err);
  }
}

// ── Per-kind activation handlers ─────────────────────────────────────────────
// Each handler takes an already-resolved id and does exactly one lookup — no
// probing. Called either directly (explicit kind tag) or from the legacy
// fallback below (id resolved by the old blind-probe method).

async function activateDonation(
  donationId: string,
  paymentId: string | undefined,
  baseUrl: string
) {
  const { data: donation } = await supabaseAdmin
    .from("donations")
    .select("*")
    .eq("id", donationId)
    .maybeSingle();

  if (!donation) {
    console.warn(`[crypto webhook] No donation found for id ${donationId}`);
    return;
  }

  if (donation.status !== "pending") {
    console.log(`[crypto webhook] Donation ${donation.id} is already in status: ${donation.status}`);
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from("donations")
    .update({
      status: "completed",
      payment_intent_id: paymentId ? String(paymentId) : donation.payment_intent_id,
    })
    .eq("id", donation.id);

  if (updateError) {
    console.error("[crypto webhook] Failed to update donation status:", updateError.message);
    return;
  }

  console.log(`[crypto webhook] Donation ${donation.id} updated to completed`);

  if (donation.message && donation.message.trim()) {
    const { error: commentError } = await supabaseAdmin.from("comments").insert({
      target_type: "fundraiser",
      target_id: donation.fundraiser_id,
      author_name: donation.donor_name || "Anonymous",
      author_email: donation.donor_email || null,
      user_id: donation.user_id || null,
      body: donation.message.trim(),
      status: "approved",
    });
    if (commentError) {
      console.error("[crypto webhook] Comment insert error:", commentError.message);
    }
  }

  await recalculateFundraiserRaised(donation.fundraiser_id);

  processDonationReceipt(donation.id).catch((err) =>
    console.error("[crypto webhook] Receipt generation error:", err)
  );
  processDonationCertificate(donation.id).catch((err) =>
    console.error("[crypto webhook] Certificate generation error:", err)
  );
}

async function activateTicketOrder(
  orderId: string,
  paymentId: string | undefined,
  baseUrl: string
) {
  const { data: order } = await supabaseAdmin
    .from("ticket_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    console.warn(`[crypto webhook] No ticket order found for id ${orderId}`);
    return;
  }

  if (order.status !== "pending") {
    console.log(`[crypto webhook] Ticket order ${order.id} is already in status: ${order.status}`);
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from("ticket_orders")
    .update({
      status: "valid",
      stripe_payment_intent_id: paymentId ? String(paymentId) : order.stripe_payment_intent_id,
    })
    .eq("id", order.id);

  if (updateError) {
    console.error("[crypto webhook] Failed to update ticket order status:", updateError.message);
    return;
  }

  console.log(`[crypto webhook] Ticket order ${order.id} updated to valid`);

  if (order.seat_id) {
    await supabaseAdmin
      .from("seats")
      .update({ status: "sold", reserved_until: null })
      .eq("id", order.seat_id);
  }

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("title, slug")
    .eq("id", order.event_id)
    .maybeSingle();

  if (event && order.buyer_email) {
    await sendTicketEmail({
      buyerEmail: order.buyer_email,
      buyerName: order.buyer_name || "",
      eventTitle: event.title,
      eventSlug: event.slug,
      qrCode: order.qr_code,
      seatLabel: order.seat_label,
      isFree: false,
      base: baseUrl,
    });
  }
}

async function activateBusinessListing(businessCryptoPaymentId: string) {
  const { data: bizPayment } = await supabaseAdmin
    .from("businesses")
    .select("id, status, listing_tier")
    .eq("crypto_payment_id", businessCryptoPaymentId)
    .maybeSingle();

  if (!bizPayment) {
    console.warn(`[crypto webhook] No business found for crypto_payment_id ${businessCryptoPaymentId}`);
    return;
  }

  if (bizPayment.status === "active") {
    console.log(`[crypto webhook] Business ${bizPayment.id} is already active.`);
    return;
  }

  const { error: bizUpdateError } = await supabaseAdmin
    .from("businesses")
    .update({
      status: "active",
      // For monthly subscriptions set a period of 30 days from now
      current_period_end:
        bizPayment.listing_tier === "subscription"
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : null,
    })
    .eq("id", bizPayment.id);

  if (bizUpdateError) {
    console.error("[crypto webhook] Failed to activate business listing:", bizUpdateError.message);
  } else {
    console.log(`[crypto webhook] Business listing ${bizPayment.id} activated via crypto payment`);
  }
}

// ── Legacy fallback ───────────────────────────────────────────────────────
// Only reached when order_id has no kind tag — i.e. an invoice created before
// the tagging scheme shipped. Reproduces the old blind-probe lookup order
// (donations → ticket_orders → businesses) exactly, then defers to the same
// per-kind handlers above. Safe to delete once no untagged invoices remain
// in flight (NOWPayments invoices don't live longer than a few hours).
async function legacyResolveAndActivate(
  orderId: string | undefined,
  invoiceId: string | undefined,
  paymentId: string | undefined,
  baseUrl: string
) {
  if (orderId) {
    const { data } = await supabaseAdmin.from("donations").select("id").eq("id", orderId).maybeSingle();
    if (data) {
      await activateDonation(data.id, paymentId, baseUrl);
      return;
    }
  }
  if (invoiceId) {
    const { data } = await supabaseAdmin
      .from("donations")
      .select("id")
      .eq("payment_intent_id", String(invoiceId))
      .maybeSingle();
    if (data) {
      await activateDonation(data.id, paymentId, baseUrl);
      return;
    }
  }

  if (orderId) {
    const { data } = await supabaseAdmin.from("ticket_orders").select("id").eq("id", orderId).maybeSingle();
    if (data) {
      await activateTicketOrder(data.id, paymentId, baseUrl);
      return;
    }
  }
  if (invoiceId) {
    const { data } = await supabaseAdmin
      .from("ticket_orders")
      .select("id")
      .eq("stripe_payment_intent_id", String(invoiceId))
      .maybeSingle();
    if (data) {
      await activateTicketOrder(data.id, paymentId, baseUrl);
      return;
    }
  }

  if (orderId) {
    await activateBusinessListing(orderId);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const sig = req.headers.get("x-nowpayments-sig");

    if (!sig) {
      return NextResponse.json({ error: "Missing x-nowpayments-sig header." }, { status: 400 });
    }

    const ipnSecret = getNowPaymentsConfig().ipnSecret;
    if (!ipnSecret) {
      return NextResponse.json({ error: "NOWPayments webhook is not configured." }, { status: 500 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const isValid = verifySignature(body, sig, ipnSecret);
    if (!isValid) {
      console.warn("[crypto webhook] Signature verification failed. Sig:", sig);
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
    }

    const { invoice_id, payment_id, payment_status, order_id } = body;
    console.log(`[crypto webhook] Received IPN callback: invoice=${invoice_id}, payment=${payment_id}, status=${payment_status}, order_id=${order_id}`);

    const isConfirmed = payment_status === "finished" || payment_status === "confirmed";

    if (isConfirmed) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
      const tagged = parseCryptoOrderId(order_id);

      if (tagged) {
        if (tagged.kind === "donation") {
          await activateDonation(tagged.id, payment_id, baseUrl);
        } else if (tagged.kind === "ticket") {
          await activateTicketOrder(tagged.id, payment_id, baseUrl);
        } else if (tagged.kind === "business") {
          await activateBusinessListing(tagged.id);
        } else if (tagged.kind === "product") {
          await markProductOrderPaid(tagged.id, { cryptoPaymentId: payment_id });
        }
      } else {
        console.warn(
          `[crypto webhook] order_id "${order_id}" has no kind tag — falling back to legacy ` +
          `blind-probe lookup. Expected only for invoices created before kind-tagging shipped.`
        );
        await legacyResolveAndActivate(order_id, invoice_id, payment_id, baseUrl);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error("crypto webhook route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
