import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isEmailEntitled } from "@/lib/security/entitlement";
import { proveProductOrderViaStripeSession } from "@/lib/product-access";
import { isDigitalProductType, isUuid } from "@/lib/digital-products";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
}

/**
 * GET /api/products/order-lookup?orderId=<uuid>[&email=<email>][&session_id=<cs_…>]
 *
 * Hardened order-status lookup backing /products/order-confirmation.
 *
 * The previous version disclosed order status, product name, and totals to
 * anyone holding an order id. Now the caller must additionally prove buyer
 * identity — one of:
 *   a. an authenticated session matching the order's buyer_id;
 *   b. the order's fulfillment-contact email (guest orders);
 *   c. the Stripe checkout session_id from the success URL, verified live
 *      via the Stripe API (payment_status paid + metadata matches).
 *
 * All failures (missing order, wrong buyer, unpaid, bad input) return the
 * same generic 404 so arbitrary order ids cannot be enumerated. Rate-limited
 * on the guestLookup tier (keyed user-or-IP).
 */
export async function GET(req: NextRequest) {
  try {
    let viewerId: string | null = null;
    try {
      const supabase = await createSupabaseServer();
      const { data: { user } } = await supabase.auth.getUser();
      viewerId = user?.id ?? null;
    } catch {
      viewerId = null;
    }

    const limited = await enforceRateLimit("guestLookup", req, viewerId);
    if (limited) return limited;

    const orderId = req.nextUrl.searchParams.get("orderId");
    if (!isUuid(orderId)) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const admin = createSupabaseAdmin();
    const { data: order } = await admin
      .from("product_orders")
      .select(
        "id, status, product_id, product_name, quantity, total_amount, currency, buyer_id, buyer_email, product:products(slug, product_type)"
      )
      .eq("id", orderId as string)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const row = order as unknown as {
      id: string;
      status: string;
      product_id: string;
      product_name: string;
      quantity: number;
      total_amount: number;
      currency: string;
      buyer_id: string | null;
      buyer_email: string | null;
      product: { slug: string | null; product_type: string | null } | null;
    };

    // ── Buyer proof ──────────────────────────────────────────────────────
    let authorized = false;

    // (a) Signed-in buyer on an account order.
    if (viewerId && row.buyer_id && viewerId === row.buyer_id) {
      authorized = true;
    }

    // (b) Guest order + fulfillment-contact email.
    if (!authorized && !row.buyer_id) {
      const email = req.nextUrl.searchParams.get("email");
      if (email && isEmailEntitled(row.buyer_email, email)) {
        authorized = true;
      }
    }

    // (c) Verified Stripe session from the checkout success URL.
    if (!authorized) {
      const sessionId = req.nextUrl.searchParams.get("session_id");
      if (sessionId) {
        const proven = await proveProductOrderViaStripeSession(
          sessionId,
          row.product_id,
          admin
        );
        if (proven && proven.id === row.id) {
          authorized = true;
        }
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const productType = row.product?.product_type ?? "other";

    // Asset presence powers the confirmation-page download/library CTAs.
    // Count only (never paths) — delivery stays behind the download route.
    const { count: assetCount } = await admin
      .from("product_assets")
      .select("id", { count: "exact", head: true })
      .eq("product_id", row.product_id);

    return NextResponse.json({
      status: row.status,
      productName: row.product_name,
      productSlug: row.product?.slug || null,
      productId: row.product_id,
      productType,
      isDigital: isDigitalProductType(productType),
      hasAssets: (assetCount ?? 0) > 0,
      quantity: row.quantity,
      totalAmount: row.total_amount,
      currency: row.currency,
    });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      (err as { digest?: string }).digest === "NEXT_PRERENDER_INTERRUPTED"
    ) {
      throw err;
    }
    console.error("products/order-lookup route error:", err);
    return NextResponse.json(
      { error: "Could not look up the order. Please try again." },
      { status: 500 }
    );
  }
}
