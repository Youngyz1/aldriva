import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isEmailEntitled } from "@/lib/security/entitlement";
import { proveProductOrderViaStripeSession } from "@/lib/product-access";
import { canUsePrivateR2Media } from "@/lib/media/driver-policy";
import { getPrivateMediaSignedGetUrl } from "@/lib/storage/private-media";
import {
  DIGITAL_ASSET_BUCKET,
  decideDownloadAccess,
  isUuid,
  productAssetStorageProvider,
} from "@/lib/digital-products";

/** Short-lived delivery URLs: 2 minutes, single-purpose. */
const SIGNED_URL_TTL_SECONDS = 120;
export const maxDuration = 60;

const GENERIC_DENY = "Download not available.";

/**
 * GET /api/products/[id]/download?asset=<assetId>[&orderId=<id>&email=<email>][&session_id=<cs_…>]
 *
 * Secure delivery for paid digital assets. Authorization is server-side and
 * fail-closed:
 *
 * - The asset must belong to the product (scoped lookup, UUID-validated).
 * - Access requires a PAID product_order for this product:
 *     paid    -> allowed (for the proven buyer only)
 *     pending / cancelled / refunded / anything else -> denied. Access is
 *     never granted because an order once existed.
 * - Buyer proof is one of:
 *     a. authenticated session whose user id (or email, for guest orders)
 *        matches a paid order for this product;
 *     b. guest orderId + buyer email matching the order's fulfillment
 *        contact (same bar as the ticket resend flow);
 *     c. Stripe checkout session_id verified live via the Stripe API
 *        (payment_status paid + metadata.product_order_id matches).
 * - Product id, order id, email param, or frontend state alone never suffice.
 *
 * On success returns a short-lived signed URL (never the permanent private
 * path) and logs the download. All failures return the same generic 404 so
 * callers cannot enumerate orders, assets, or buyer emails.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;
    const sp = req.nextUrl.searchParams;
    const assetId = sp.get("asset");

    if (!isUuid(productId) || !isUuid(assetId)) {
      return NextResponse.json({ error: GENERIC_DENY }, { status: 404 });
    }

    // Abuse-shaped endpoint (paid-content access): rate-limit first, keyed
    // on the user when signed in, IP otherwise (identifierFor convention).
    let requesterId: string | null = null;
    let requesterEmail: string | null = null;
    try {
      const supabase = await createSupabaseServer();
      const { data: { user } } = await supabase.auth.getUser();
      requesterId = user?.id ?? null;
      requesterEmail = user?.email ?? null;
    } catch {
      requesterId = null;
    }

    const limited = await enforceRateLimit("guestLookup", req, requesterId);
    if (limited) return limited;

    const admin = createSupabaseAdmin();

    const { data: product } = await admin
      .from("products")
      .select("id")
      .eq("id", productId)
      .maybeSingle();
    if (!product) {
      return NextResponse.json({ error: GENERIC_DENY }, { status: 404 });
    }

    const { data: asset } = await admin
      .from("product_assets")
      .select("id, file_path, file_name, mime_type, file_size_bytes, storage_provider")
      .eq("id", assetId)
      .eq("product_id", productId)
      .maybeSingle();
    if (!asset) {
      return NextResponse.json({ error: GENERIC_DENY }, { status: 404 });
    }

    // ── Resolve a paid order proving this buyer ──────────────────────────
    let provenOrder: {
      id: string;
      buyer_id: string | null;
      buyer_email: string | null;
    } | null = null;

    if (requesterId) {
      // (a1) Signed-in buyer with a paid account order.
      const { data: accountOrder } = await admin
        .from("product_orders")
        .select("id, buyer_id, buyer_email")
        .eq("product_id", productId)
        .eq("buyer_id", requesterId)
        .eq("status", "paid")
        .limit(1)
        .maybeSingle();
      if (accountOrder) {
        provenOrder = accountOrder as typeof provenOrder & {};
      } else if (requesterEmail) {
        // (a2) Bought as guest, now signed in with the same email.
        const { data: guestOrder } = await admin
          .from("product_orders")
          .select("id, buyer_id, buyer_email")
          .eq("product_id", productId)
          .is("buyer_id", null)
          .eq("status", "paid")
          .ilike("buyer_email", requesterEmail)
          .limit(1)
          .maybeSingle();
        if (
          guestOrder &&
          isEmailEntitled(
            (guestOrder as { buyer_email: string | null }).buyer_email,
            requesterEmail
          )
        ) {
          provenOrder = guestOrder as typeof provenOrder & {};
        }
      }
    } else {
      const sessionId = sp.get("session_id");
      if (sessionId) {
        // (c) Verified Stripe session: live API lookup, never client claims.
        provenOrder = await proveProductOrderViaStripeSession(sessionId, productId, admin);
      }
      if (!provenOrder) {
        // (b) Guest orderId + fulfillment-contact email.
        const orderId = sp.get("orderId");
        const email = sp.get("email");
        if (isUuid(orderId) && email) {
          const { data: order } = await admin
            .from("product_orders")
            .select("id, buyer_id, buyer_email, status, product_id")
            .eq("id", orderId as string)
            .maybeSingle();
          const decision = decideDownloadAccess({
            orderFound: !!order && (order as { product_id: string }).product_id === productId,
            orderStatus: (order as { status: string } | null)?.status ?? null,
            requesterUserId: null,
            orderBuyerId: (order as { buyer_id: string | null } | null)?.buyer_id ?? null,
            guestEmail: email,
            orderBuyerEmail: (order as { buyer_email: string | null } | null)?.buyer_email ?? null,
          });
          if (decision === "allow" && order) {
            provenOrder = order as typeof provenOrder & {};
          }
        }
      }
    }

    if (!provenOrder) {
      return NextResponse.json({ error: GENERIC_DENY }, { status: 404 });
    }

    let signedUrl: string | null = null;
    const storageProvider = productAssetStorageProvider((asset as { storage_provider?: string }).storage_provider);
    if (storageProvider === "r2") {
      if (!canUsePrivateR2Media({
        driver: process.env.IMAGE_STORAGE_DRIVER,
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
      })) return NextResponse.json({ error: GENERIC_DENY }, { status: 404 });
      signedUrl = await getPrivateMediaSignedGetUrl(
        (asset as { file_path: string }).file_path,
        SIGNED_URL_TTL_SECONDS
      );
    } else if (storageProvider === "supabase") {
      const { data: signed, error: signError } = await admin.storage
        .from(DIGITAL_ASSET_BUCKET)
        .createSignedUrl(
          (asset as { file_path: string }).file_path,
          SIGNED_URL_TTL_SECONDS
        );
      if (signError) console.error("[products/download] sign error:", signError.message);
      signedUrl = signed?.signedUrl ?? null;
    }

    if (storageProvider === null || !signedUrl) return NextResponse.json({ error: GENERIC_DENY }, { status: 404 });

    // Best-effort analytics log — never blocks delivery.
    try {
      await admin.from("product_downloads").insert({
        product_id: productId,
        asset_id: assetId,
        order_id: provenOrder.id,
        buyer_id: provenOrder.buyer_id,
      });
    } catch (err) {
      console.error("[products/download] log error:", err);
    }

    return NextResponse.json({
      downloadUrl: signedUrl,
      expiresIn: SIGNED_URL_TTL_SECONDS,
      fileName: (asset as { file_name: string }).file_name,
      mimeType: (asset as { mime_type: string }).mime_type,
      sizeBytes: (asset as { file_size_bytes: number }).file_size_bytes,
    });
  } catch (err) {
    console.error("[products/download] route error:", err);
    return NextResponse.json({ error: GENERIC_DENY }, { status: 404 });
  }
}
