import "server-only";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { headers } from "next/headers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  createOnlineOrderPayment,
  type CreateOnlineOrderPaymentResult,
} from "@/lib/storefront-order-payments";

/**
 * POST /api/orders/payment-intent
 *
 * Guest online card payment for storefront orders (Phase 3, USD only).
 * Creates an unpaid online order through the same repricing/validation as
 * submitOrderRequest, then a Stripe PaymentIntent for its DB total.
 * The webhook is the only source of truth for paid state.
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Card payment is not configured." }, { status: 500 });
    }

    // Payment-specific bucket first (card-testing bound), then the shared
    // order-request buckets inside creation.
    const paymentLimited = await enforceRateLimit("orderPaymentIntent", req);
    if (paymentLimited) return paymentLimited;

    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ip =
      headerList.get("x-real-ip") ||
      (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
      "unknown";
    const ipLimit = await checkRateLimit("orderRequestIp", `ip:${ip}`);
    if (!ipLimit.allowed) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment.", code: "rate_limited" }, { status: 429 });
    }

    const body = await req.json();
    const {
      slug,
      customerName,
      customerPhone,
      customerEmail,
      fulfilmentType,
      deliveryAddress,
      customerNote,
      items,
      idempotencyKey,
      hp,
      scheduledFor,
    } = body ?? {};

    const admin = createSupabaseAdmin();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-05-27.dahlia",
    });

    const result: CreateOnlineOrderPaymentResult = await createOnlineOrderPayment(
      {
        slug,
        customerName,
        customerPhone,
        customerEmail: customerEmail ?? null,
        fulfilmentType,
        deliveryAddress: deliveryAddress ?? null,
        customerNote: customerNote ?? null,
        items: Array.isArray(items) ? items : [],
        idempotencyKey: idempotencyKey ?? null,
        hp: hp ?? null,
        scheduledFor: scheduledFor ?? null,
      },
      { admin, stripe }
    );

    if (!result.success) {
      const status =
        result.error === "rate_limited" ? 429
        : result.error === "website_not_found" ? 404
        : result.error === "ordering_disabled" || result.error === "online_unavailable" ? 403
        : result.error === "no_open_hours" ? 409
        : 400;
      return NextResponse.json({ error: result.message ?? "Could not start the payment.", code: result.error, itemId: result.itemId }, { status });
    }

    return NextResponse.json({
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      trackingToken: result.trackingToken,
      scheduledFor: result.scheduledFor,
    });
  } catch (err) {
    console.error("[orders/payment-intent]", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Could not start the payment. Please try again.", code: "unexpected" }, { status: 500 });
  }
}
