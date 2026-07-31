import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getNowPaymentsConfig } from "@/lib/cryptoPayment";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findRecordByOrderId(orderId: string) {
  // 1. Look up in donations by ID (orderId UUID)
  const { data: donation } = await supabaseAdmin
    .from("donations")
    .select("id, status, fundraiser_id, payment_intent_id, fundraiser:fundraisers(slug)")
    .eq("id", orderId)
    .maybeSingle();

  if (donation) {
    return {
      id: donation.id,
      status: donation.status,
      type: "donation" as const,
      slug: (donation.fundraiser as any)?.slug || null,
      qrCode: null,
      paymentIntentId: donation.payment_intent_id,
    };
  }

  // 2. Look up in ticket_orders by ID (orderId UUID)
  const { data: order } = await supabaseAdmin
    .from("ticket_orders")
    .select("id, status, event_id, qr_code, stripe_payment_intent_id, event:events(slug)")
    .eq("id", orderId)
    .maybeSingle();

  if (order) {
    return {
      id: order.id,
      status: order.status,
      type: "ticket" as const,
      slug: (order.event as any)?.slug || null,
      qrCode: order.qr_code || null,
      paymentIntentId: order.stripe_payment_intent_id,
    };
  }

  // 3. Look up in product_orders by ID (orderId UUID) — the row's own id is
  // always the crypto correlation id for products (tagged, never a bare
  // legacy id), so no legacy payment_intent_id fallback is needed here.
  const { data: productOrder } = await supabaseAdmin
    .from("product_orders")
    .select("id, status, product_id, product_name, crypto_payment_id, product:products(slug)")
    .eq("id", orderId)
    .maybeSingle();

  if (productOrder) {
    return {
      id: productOrder.id,
      status: productOrder.status,
      type: "product" as const,
      slug: (productOrder.product as any)?.slug || null,
      qrCode: null,
      paymentIntentId: productOrder.crypto_payment_id,
      productName: productOrder.product_name,
    };
  }

  // 4. Legacy lookup: in donations by payment_intent_id
  const { data: donationLegacy } = await supabaseAdmin
    .from("donations")
    .select("id, status, fundraiser_id, payment_intent_id, fundraiser:fundraisers(slug)")
    .eq("payment_intent_id", orderId)
    .maybeSingle();

  if (donationLegacy) {
    return {
      id: donationLegacy.id,
      status: donationLegacy.status,
      type: "donation" as const,
      slug: (donationLegacy.fundraiser as any)?.slug || null,
      qrCode: null,
      paymentIntentId: donationLegacy.payment_intent_id,
    };
  }

  // 5. Legacy lookup: in ticket_orders by stripe_payment_intent_id
  const { data: orderLegacy } = await supabaseAdmin
    .from("ticket_orders")
    .select("id, status, event_id, qr_code, stripe_payment_intent_id, event:events(slug)")
    .eq("stripe_payment_intent_id", orderId)
    .maybeSingle();

  if (orderLegacy) {
    return {
      id: orderLegacy.id,
      status: orderLegacy.status,
      type: "ticket" as const,
      slug: (orderLegacy.event as any)?.slug || null,
      qrCode: orderLegacy.qr_code || null,
      paymentIntentId: orderLegacy.stripe_payment_intent_id,
    };
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const orderId = searchParams.get("orderId") || searchParams.get("paymentId");

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId or paymentId parameter." }, { status: 400 });
    }

    const nowPayments = getNowPaymentsConfig();
    if (!nowPayments.apiKey) {
      return NextResponse.json({ error: "NOWPayments is not configured." }, { status: 500 });
    }

    // 1. Check if we already have a confirmed record in our database
    let record = await findRecordByOrderId(orderId);
    if (record && (record.status === "completed" || record.status === "valid" || record.status === "succeeded" || record.status === "paid")) {
      return NextResponse.json({
        status: "confirmed",
        type: record.type,
        recordId: record.id,
        slug: record.slug,
        qrCode: record.qrCode,
        productName: (record as any).productName || null,
      });
    }

    // Determine what ID to send to NOWPayments API for checking
    const queryId = record?.paymentIntentId || orderId;

    // 2. Fetch status from NOWPayments GET /v1/payment/:id
    let nowpaymentsStatus = "waiting";
    let invoiceIdFromPayment = queryId;

    const paymentRes = await fetch(`${nowPayments.baseUrl}/payment/${queryId}`, {
      headers: {
        "x-api-key": nowPayments.apiKey,
      },
    });

    if (paymentRes.ok) {
      const paymentData = await paymentRes.json();
      nowpaymentsStatus = paymentData.payment_status || "waiting";
      if (paymentData.invoice_id) {
        invoiceIdFromPayment = String(paymentData.invoice_id);
      }
    } else {
      // If payment status fails, check GET /v1/invoice/:id
      const invoiceRes = await fetch(`${nowPayments.baseUrl}/invoice/${queryId}`, {
        headers: {
          "x-api-key": nowPayments.apiKey,
        },
      });

      if (invoiceRes.ok) {
        const invoiceData = await invoiceRes.json();
        const invStatus = invoiceData.invoice_status || invoiceData.status;
        if (invStatus === "paid" || invStatus === "confirmed") {
          nowpaymentsStatus = "confirmed";
        } else if (invStatus === "expired" || invStatus === "partially_paid") {
          nowpaymentsStatus = invStatus;
        } else {
          nowpaymentsStatus = "waiting";
        }
      }
    }

    // 3. Find database record by the updated invoice ID if we didn't have one before or if it was pending
    if (!record || record.status === "pending") {
      record = await findRecordByOrderId(invoiceIdFromPayment) || await findRecordByOrderId(orderId);
    }

    // Map NOWPayments status to a simplified UI status ("confirmed" or "waiting" or "failed")
    let finalStatus = "waiting";
    if (nowpaymentsStatus === "confirmed" || nowpaymentsStatus === "finished") {
      finalStatus = "confirmed";
    } else if (nowpaymentsStatus === "failed" || nowpaymentsStatus === "expired") {
      finalStatus = "failed";
    } else if (record && (record.status === "completed" || record.status === "valid" || record.status === "succeeded" || record.status === "paid")) {
      finalStatus = "confirmed";
    }

    return NextResponse.json({
      status: finalStatus,
      type: record?.type || null,
      recordId: record?.id || null,
      slug: record?.slug || null,
      qrCode: record?.qrCode || null,
      productName: (record as any)?.productName || null,
    });
  } catch (err: unknown) {
    console.error("crypto/status route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
