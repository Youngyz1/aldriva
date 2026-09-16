import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications";
import { getSiteUrl } from "@/lib/site-url";
import { BRAND } from "@/config/branding";

/**
 * lib/product-notifications.ts
 *
 * Purchase fan-out for Shop product orders. Called by the Stripe webhook
 * (checkout.session.completed kind="product") and the crypto webhook
 * (kind="product") AFTER markProductOrderPaid() reports was_newly_paid —
 * exactly-once semantics come from that guard, same as the donation/ticket
 * notify paths.
 *
 * - Signed-in buyer  -> in-app bell row + Resend email (single
 *   createNotification call, per convention).
 * - Guest buyer      -> Resend email only (no user row to attach a bell to;
 *   same direct-send shape as lib/receipt.ts).
 * - Product owner    -> in-app bell row (+ email when resolvable).
 *
 * Emails link to application URLs (/products/library, /dashboard/products).
 * Private storage URLs are never included. Never throws — webhook
 * fulfillment must not fail because a notification did.
 */
export async function notifyProductPurchase(orderId: string): Promise<void> {
  try {
    const admin = createSupabaseAdmin();

    const { data: order } = await admin
      .from("product_orders")
      .select(
        "id, product_id, product_name, quantity, total_amount, currency, buyer_id, buyer_email, buyer_name, payment_method"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (!order) {
      return;
    }

    const { data: product } = await admin
      .from("products")
      .select("id, name, slug, owner_id")
      .eq("id", order.product_id)
      .maybeSingle();

    const productName = (product?.name as string | undefined) ?? order.product_name;
    const productSlug = (product?.slug as string | undefined) ?? null;
    const siteUrl = getSiteUrl();
    const amount =
      order.total_amount !== null && order.total_amount !== undefined
        ? Number(order.total_amount).toLocaleString("en-US", {
            style: "currency",
            currency: (order.currency || "usd").toUpperCase(),
          })
        : null;

    // ── Buyer ────────────────────────────────────────────────────────────
    const buyerTitle = `Order confirmed: ${productName}`;
    const buyerBody = amount
      ? `Payment received (${amount}). Your files are ready in your library.`
      : "Payment received. Your files are ready in your library.";
    const buyerHtml = `
      <div style="font-family: sans-serif; max-width: 600px;">
        <h2 style="color: #18181b;">Thanks for your purchase!</h2>
        <p>Your order of <strong>${productName}</strong>${amount ? ` (${amount})` : ""} is confirmed.</p>
        <p>Access your files anytime from your Aldriva library:</p>
        <p><a href="${siteUrl}/products/library" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;">Open My Library</a></p>
        ${
          productSlug
            ? `<p style="color:#71717a;font-size:13px;">Product page: <a href="${siteUrl}/products/${productSlug}">${siteUrl}/products/${productSlug}</a></p>`
            : ""
        }
        <p style="color:#71717a;font-size:13px;">Order reference: ${order.id}</p>
      </div>
    `;

    if (order.buyer_id) {
      await createNotification({
        userId: order.buyer_id,
        type: "product_purchase",
        title: buyerTitle,
        body: buyerBody,
        link: "/products/library",
        relatedType: "product",
        relatedId: order.product_id,
        email: order.buyer_email
          ? { to: order.buyer_email, subject: buyerTitle, html: buyerHtml }
          : null,
      });
    } else if (order.buyer_email && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: `${BRAND.name} <${BRAND.contactEmail}>`,
          to: order.buyer_email,
          subject: buyerTitle,
          html: buyerHtml,
        });
      } catch (err) {
        console.error("[product-notifications] guest buyer email failed:", err);
      }
    }

    // ── Seller ───────────────────────────────────────────────────────────
    const ownerId = product?.owner_id as string | undefined;
    if (ownerId) {
      const saleTitle = `New sale: ${productName}`;
      const saleBody = amount
        ? `${order.quantity ?? 1} × ${amount} via ${order.payment_method === "crypto" ? "crypto" : "card"}.`
        : "A new order was paid.";
      let ownerEmail: string | null = null;
      try {
        const { data: ownerUser } = await admin.auth.admin.getUserById(ownerId);
        ownerEmail = ownerUser?.user?.email ?? null;
      } catch {
        ownerEmail = null;
      }
      await createNotification({
        userId: ownerId,
        type: "product_purchase",
        title: saleTitle,
        body: saleBody,
        link: "/dashboard/products",
        actorId: (order.buyer_id as string | undefined) ?? null,
        relatedType: "product",
        relatedId: order.product_id,
        email: ownerEmail
          ? {
              to: ownerEmail,
              subject: saleTitle,
              html: `
                <div style="font-family: sans-serif; max-width: 600px;">
                  <h2 style="color: #18181b;">You made a sale!</h2>
                  <p><strong>${productName}</strong> — ${saleBody}</p>
                  <p><a href="${siteUrl}/dashboard/products">View your products</a></p>
                </div>
              `,
            }
          : null,
      });
    }
  } catch (err) {
    console.error("[product-notifications] notifyProductPurchase failed:", err);
  }
}
