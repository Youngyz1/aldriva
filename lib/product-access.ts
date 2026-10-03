import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isUuid } from "@/lib/digital-products";

/**
 * lib/product-access.ts
 *
 * Server-side ownership gate shared by the Shop digital-asset API routes.
 * Ownership comes from the products row (service-role read) — a
 * client-supplied owner id is never proof.
 *
 * Failure responses are deliberately 404 (not 403) so a non-owner cannot
 * distinguish "product does not exist" from "product is not yours".
 */
export async function requireProductOwner(productId: string): Promise<
  | { user: { id: string }; product: { id: string; owner_id: string; version: string | null }; admin: boolean }
  | { error: NextResponse }
> {
  if (!isUuid(productId)) {
    return { error: NextResponse.json({ error: "Invalid product." }, { status: 400 }) };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const admin = createSupabaseAdmin();
  const { data: product } = await admin
    .from("products")
    .select("id, owner_id, version")
    .eq("id", productId)
    .maybeSingle();

  if (!product) {
    return { error: NextResponse.json({ error: "Product not found." }, { status: 404 }) };
  }

  const adminFlag = product.owner_id === user.id ? false : await isAdmin();
  if (product.owner_id !== user.id && !adminFlag) {
    return { error: NextResponse.json({ error: "Product not found." }, { status: 404 }) };
  }

  return { user: { id: user.id }, product, admin: adminFlag };
}

export type ProvenProductOrder = {
  id: string;
  buyer_id: string | null;
  buyer_email: string | null;
};

/**
 * Verifies a Stripe Checkout Session live via the Stripe API and resolves
 * the paid product order it fulfilled for `productId`. Returns null on any
 * mismatch (fail closed). Shared by the download route and the hardened
 * order-lookup so guest buyers can prove payment with the session id from
 * the checkout success URL instead of just an order id.
 */
export async function proveProductOrderViaStripeSession(
  sessionId: string,
  productId: string,
  admin: ReturnType<typeof createSupabaseAdmin>
): Promise<ProvenProductOrder | null> {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    if (!sessionId.startsWith("cs_")) return null;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return null;
    const meta = session.metadata ?? {};
    if (meta.kind !== "product" || !meta.product_order_id) return null;

    const { data: order } = await admin
      .from("product_orders")
      .select("id, buyer_id, buyer_email, status, product_id")
      .eq("id", meta.product_order_id)
      .maybeSingle();
    if (!order) return null;
    const row = order as {
      id: string;
      buyer_id: string | null;
      buyer_email: string | null;
      status: string;
      product_id: string;
    };
    if (row.status !== "paid" || row.product_id !== productId) return null;
    return { id: row.id, buyer_id: row.buyer_id, buyer_email: row.buyer_email };
  } catch (err) {
    console.error("[product-access] stripe session verify failed:", err);
    return null;
  }
}
