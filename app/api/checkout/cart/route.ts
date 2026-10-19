import "server-only";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";
import { fromMinorUnits } from "@/lib/money";
import {
  validateCartCheckout,
  distributeDiscount,
} from "@/lib/store-cart-checkout";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/checkout/cart
 * { siteSlug, items: [{productId, quantity}] (≤12 distinct), buyerName?,
 *   buyerEmail?, promoCode? }
 *
 * Full server validation (see lib/store-cart-checkout.ts), then N pending
 * product_orders rows (snapshots of exactly what was approved) and ONE
 * multi-line Stripe Checkout Session. The discount spreads across units so
 * row snapshots always sum to the charged total (the webhook re-verifies).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    const limited = await enforceRateLimit("paymentIntent", req, user?.id ?? null);
    if (limited) return limited;

    const body = await req.json();
    const checked = await validateCartCheckout({
      supabaseAdmin,
      stripeSecretKey: process.env.STRIPE_SECRET_KEY,
      siteSlug: body?.siteSlug,
      items: body?.items,
      buyerEmail: body?.buyerEmail ?? user?.email ?? null,
      buyerName: body?.buyerName,
      promoCode: body?.promoCode,
      viewerId: user?.id ?? null,
    });
    if (!checked.ok) {
      return NextResponse.json(
        { error: checked.error, ...(checked.issues ? { issues: checked.issues } : {}) },
        { status: checked.status }
      );
    }
    const cart = checked.cart;

    const perUnitDiscounted = distributeDiscount(
      cart.lines.flatMap((line) => Array(line.quantity).fill(line.unitMinor)),
      cart.discountMinor
    );
    let cursor = 0;
    const rowSpecs = cart.lines.map((line) => {
      const units = perUnitDiscounted.slice(cursor, cursor + line.quantity);
      cursor += line.quantity;
      const rowTotalMinor = units.reduce((sum, value) => sum + value, 0);
      const rowUnitMinor = line.quantity > 0 ? rowTotalMinor / line.quantity : 0;
      return {
        product_id: line.productId,
        product_name: line.name,
        unit_price: fromMinorUnits(rowUnitMinor, cart.currency),
        buyer_id: user?.id ?? null,
        buyer_email: cart.buyerEmail,
        buyer_name: cart.buyerName,
        quantity: line.quantity,
        total_amount: fromMinorUnits(rowTotalMinor, cart.currency),
        currency: cart.currency.toLowerCase(),
        status: "pending",
        payment_method: "stripe",
      };
    });

    const { data: orderRows, error: orderError } = await supabaseAdmin
      .from("product_orders")
      .insert(rowSpecs)
      .select("id");
    if (orderError || !orderRows || orderRows.length !== rowSpecs.length) {
      console.error("cart-checkout: failed to create pending orders:", orderError?.message);
      return NextResponse.json({ error: "Database error creating order." }, { status: 500 });
    }
    const orderIds = orderRows.map((row) => row.id as string);

    const baseUrl = getSiteUrl();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
    let offset = 0;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: cart.buyerEmail,
      line_items: cart.lines.map((line) => {
        const units = perUnitDiscounted.slice(offset, offset + line.quantity);
        offset += line.quantity;
        const rowTotal = units.reduce((sum, value) => sum + value, 0);
        return {
          price_data: {
            currency: cart.currency.toLowerCase(),
            unit_amount: line.quantity > 0 ? Math.round(rowTotal / line.quantity) : 0,
            product_data: { name: line.name },
          },
          quantity: line.quantity,
        };
      }),
      mode: "payment",
      success_url: `${baseUrl}/site/${cart.siteSlug}/order-confirmation?cartSession={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/site/${cart.siteSlug}/shop?cancelled=true`,
      metadata: {
        kind: "product_cart",
        product_order_ids: JSON.stringify(orderIds),
        ...(cart.promo ? { promo_code_id: cart.promo.id } : {}),
      },
    });

    const { error: stampError } = await supabaseAdmin
      .from("product_orders")
      .update({ stripe_session_id: session.id })
      .in("id", orderIds);
    if (stampError) {
      console.error("cart-checkout: failed to stamp session id:", stampError.message);
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("cart-checkout: unexpected error:", err);
    return NextResponse.json({ error: "Checkout could not be started." }, { status: 500 });
  }
}
