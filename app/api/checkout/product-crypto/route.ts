import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { tagCryptoOrderId, getNowPaymentsConfig } from "@/lib/cryptoPayment";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_QUANTITY = 100;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    const { productId, quantity: rawQuantity, buyerEmail, buyerName } = await req.json();
    if (!productId) {
      return NextResponse.json({ error: "Missing product ID." }, { status: 400 });
    }

    const quantity = Math.max(1, parseInt(rawQuantity) || 1);

    if (quantity > MAX_QUANTITY) {
      return NextResponse.json(
        { error: `Quantity exceeds the maximum allowed per order (${MAX_QUANTITY}).` },
        { status: 400 }
      );
    }

    // Same reasoning as the Stripe route: products need a fulfillment
    // contact, so — unlike donations/tickets — anonymous crypto checkout
    // isn't allowed here.
    const resolvedBuyerEmail = buyerEmail || user?.email || null;
    if (!resolvedBuyerEmail) {
      return NextResponse.json(
        { error: "Email is required for guest checkout." },
        { status: 400 }
      );
    }

    const { data: product, error: dbError } = await supabaseAdmin
      .from("products")
      .select("id, name, slug, status, price_type, stripe_price_id, stock_quantity")
      .eq("id", productId)
      .single();

    if (dbError || !product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    if (product.status === "archived") {
      return NextResponse.json({ error: "This product is no longer available." }, { status: 400 });
    }

    if (product.stock_quantity !== null && product.stock_quantity < quantity) {
      return NextResponse.json({ error: "Not enough stock available." }, { status: 400 });
    }

    if (!product.stripe_price_id) {
      return NextResponse.json(
        { error: "Stripe price is not configured for this product." },
        { status: 500 }
      );
    }

    const nowPayments = getNowPaymentsConfig();
    if (!nowPayments.apiKey) {
      return NextResponse.json(
        { error: "NOWPayments is not configured on the server." },
        { status: 500 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe secret key not configured." }, { status: 500 });
    }

    // Crypto price is derived from the same Stripe Price object as the card
    // path (not a separate hardcoded amount), so the two rails can't drift
    // out of price-parity — see ADR 0001 §10.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const price = await stripe.prices.retrieve(product.stripe_price_id);
    const unitPrice = (price.unit_amount ?? 0) / 100;
    const currency = price.currency || "usd";
    const totalAmount = unitPrice * quantity;

    // Insert the pending order first, same as the Stripe route — the row's
    // own id becomes the crypto correlation id tagged below.
    const { data: order, error: orderError } = await supabaseAdmin
      .from("product_orders")
      .insert({
        product_id: product.id,
        product_name: product.name,
        unit_price: unitPrice,
        buyer_id: user?.id ?? null,
        buyer_email: resolvedBuyerEmail,
        buyer_name: buyerName || null,
        quantity,
        total_amount: totalAmount,
        currency,
        status: "pending",
        payment_method: "crypto",
      })
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("product-crypto-checkout: failed to create pending order:", orderError?.message);
      return NextResponse.json({ error: "Database error creating order." }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://www.fund4agoodcause.com";
    // TODO(products): /crypto-pending and /api/crypto/status don't know
    // about the "product" kind yet — a confirmed product order will render
    // a misleading donation/ticket-shaped page here. See ADR 0001 §10. Not
    // urgent today: nothing customer-facing links to this route yet, since
    // /products and /products/[slug] haven't been built.
    const successUrl = `${baseUrl}/crypto-pending?orderId=${order.id}`;
    const cancelUrl = `${baseUrl}/products/${product.slug}?cancelled=true`;
    const ipnCallbackUrl = `${baseUrl}/api/crypto/webhook`;

    const nowpaymentsRes = await fetch(`${nowPayments.baseUrl}/invoice`, {
      method: "POST",
      headers: {
        "x-api-key": nowPayments.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: totalAmount,
        price_currency: currency,
        order_id: tagCryptoOrderId("product", order.id),
        order_description: `${product.name} x${quantity}`,
        ipn_callback_url: ipnCallbackUrl,
        success_url: successUrl,
        cancel_url: cancelUrl,
      }),
    });

    const nowpaymentsData = await nowpaymentsRes.json();
    if (!nowpaymentsRes.ok || !nowpaymentsData.invoice_url) {
      console.error("NOWPayments invoice error:", nowpaymentsData);
      // Roll back the pending order — no point leaving it dangling with no invoice.
      await supabaseAdmin.from("product_orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: nowpaymentsData.message || "Failed to create NOWPayments invoice." },
        { status: 502 }
      );
    }

    const paymentId = String(nowpaymentsData.id);
    const paymentUrl = nowpaymentsData.invoice_url;

    // Store NOWPayments' own payment id for status polling/reference —
    // the order's own id (already tagged above) is the primary lookup key.
    await supabaseAdmin
      .from("product_orders")
      .update({ crypto_payment_id: paymentId })
      .eq("id", order.id);

    return NextResponse.json({ paymentUrl, paymentId, orderId: order.id });
  } catch (err: unknown) {
    console.error("product-crypto-checkout route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
