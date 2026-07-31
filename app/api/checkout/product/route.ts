import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

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

    // Products need a delivery/fulfillment contact, unlike donations — so
    // unlike the donations/tickets guest-checkout pattern, a fully anonymous
    // order isn't allowed here.
    const resolvedBuyerEmail = buyerEmail || user?.email || null;
    if (!resolvedBuyerEmail) {
      return NextResponse.json(
        { error: "Email is required for guest checkout." },
        { status: 400 }
      );
    }

    // 1. Fetch product and validate it's purchasable
    const { data: product, error: dbError } = await supabaseAdmin
      .from("products")
      .select("id, name, status, price_type, stripe_price_id, stock_quantity")
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

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe secret key not configured." }, { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // 2. Read the live price from Stripe so the snapshot reflects what's
    // actually charged, rather than duplicating a price value in our own DB.
    const price = await stripe.prices.retrieve(product.stripe_price_id);
    const unitPrice = (price.unit_amount ?? 0) / 100;
    const currency = price.currency || "usd";
    const totalAmount = unitPrice * quantity;

    const checkoutMode: "payment" | "subscription" =
      product.price_type === "subscription" ? "subscription" : "payment";

    // 3. Insert the pending order first — product_name/unit_price are
    // snapshotted now, not re-derived from products at display/webhook time.
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
        payment_method: "stripe",
      })
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("product-checkout: failed to create pending order:", orderError?.message);
      return NextResponse.json({ error: "Database error creating order." }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;

    // 4. Create the Checkout Session carrying the order id in metadata, so
    // the webhook finds exactly this row instead of guessing.
    // TODO(products): /products/order-confirmation doesn't exist yet. See
    // ADR 0001 §10 — must be built together with /products and /products/
    // [slug] before this route is reachable from any real "Buy" button.
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: resolvedBuyerEmail,
      line_items: [{ price: product.stripe_price_id, quantity }],
      mode: checkoutMode,
      success_url: `${baseUrl}/products/order-confirmation?orderId=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/products?cancelled=true`,
      metadata: {
        kind: "product",
        product_order_id: order.id,
        product_id: product.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("product-checkout route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
