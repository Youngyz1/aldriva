import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Decrements products.stock_quantity by `quantity`, guarded so it can never
 * go negative and so a race between two concurrent webhook deliveries can't
 * double-decrement. No-ops for unlimited/digital goods (stock_quantity IS
 * NULL). Only ever *sets* status to 'out_of_stock' when stock hits 0 — never
 * writes 'active' back, so this can't accidentally un-archive a product.
 *
 * Applies uniformly regardless of products.price_type. A subscription
 * product isn't special-cased here: the NULL check already gives merchants
 * an opt-out (uncapped subscriptions), and stock_quantity can legitimately
 * represent a subscriber cap (e.g. "founding member" slots) for a
 * subscription product. Renewals never re-enter this function — only the
 * initial checkout.session.completed fires markProductOrderPaid — so there's
 * no double-decrement risk across a subscription's billing cycles either way.
 */
export async function decrementProductStock(productId: string, quantity: number): Promise<void> {
  const { data: product, error: fetchError } = await supabaseAdmin
    .from("products")
    .select("stock_quantity")
    .eq("id", productId)
    .maybeSingle();

  if (fetchError || !product || product.stock_quantity === null) {
    return; // unlimited/digital good, or product missing — nothing to decrement
  }

  const newStock = product.stock_quantity - quantity;
  const updatePayload: { stock_quantity: number; status?: string } = { stock_quantity: newStock };
  if (newStock <= 0) {
    updatePayload.status = "out_of_stock";
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("products")
    .update(updatePayload)
    .eq("id", productId)
    .gte("stock_quantity", quantity) // never decrement below 0
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error(`[decrementProductStock] Failed to decrement stock for product ${productId}:`, updateError.message);
    return;
  }

  if (!updated) {
    console.warn(`[decrementProductStock] Stock guard blocked decrement for product ${productId} (requested ${quantity}, insufficient stock at update time).`);
  }
}

/**
 * Flips a product_orders row from 'pending' to 'paid', guarded so a retried
 * or duplicate webhook delivery can't process the same order twice, then
 * decrements stock exactly once as a consequence of that same guard.
 * Shared by both the Stripe and crypto webhooks — there is no rail-specific
 * behavior here, unlike donations/tickets.
 */
export async function markProductOrderPaid(
  orderId: string,
  paymentReference: { stripePaymentIntentId?: string; cryptoPaymentId?: string }
): Promise<void> {
  const { data: order, error: fetchError } = await supabaseAdmin
    .from("product_orders")
    .select("id, product_id, quantity, status")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchError || !order) {
    console.warn(`[markProductOrderPaid] No product order found for id ${orderId}`);
    return;
  }

  if (order.status !== "pending") {
    console.log(`[markProductOrderPaid] Product order ${order.id} is already in status: ${order.status}`);
    return;
  }

  const updatePayload: Record<string, unknown> = { status: "paid" };
  if (paymentReference.stripePaymentIntentId) {
    updatePayload.stripe_payment_intent_id = paymentReference.stripePaymentIntentId;
  }
  if (paymentReference.cryptoPaymentId) {
    updatePayload.crypto_payment_id = paymentReference.cryptoPaymentId;
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("product_orders")
    .update(updatePayload)
    .eq("id", order.id)
    .eq("status", "pending") // idempotency guard against concurrent/retried deliveries
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error(`[markProductOrderPaid] Failed to update product order ${order.id}:`, updateError.message);
    return;
  }

  if (!updated) {
    console.log(`[markProductOrderPaid] Product order ${order.id} was already marked paid by a concurrent request.`);
    return;
  }

  console.log(`[markProductOrderPaid] Product order ${order.id} marked paid.`);
  await decrementProductStock(order.product_id, order.quantity);
}
