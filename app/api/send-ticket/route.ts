import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { BRAND } from "@/config/branding";
import { getSiteUrl } from "@/lib/site-url";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isEmailEntitled } from "@/lib/security/entitlement";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    // Abuse-shaped endpoint (resends entry credentials by email): strict
    // rate limit first, matching the guest-lookup budget convention.
    const rateLimitRes = await enforceRateLimit("guestLookup", req);
    if (rateLimitRes) return rateLimitRes;

    const {
      buyerEmail,
      buyerName,
      eventTitle,
      eventSlug,
      qrCode,
      seatLabel,
      isFree,
    } = await req.json();

    if (!buyerEmail || !qrCode) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();

    // 1. Fetch all orders linked to this purchase (by id, qr_code, instance qr_code, or stripe_payment_intent_id)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(qrCode);

    let orders: any[] | null = null;
    let paymentIntentId: string | null = null;

    if (qrCode.startsWith("pi_")) {
      paymentIntentId = qrCode;
    } else if (isUuid) {
      // First check if qrCode is a ticket_orders.id
      const { data: byOrderId } = await admin
        .from("ticket_orders")
        .select("id, stripe_payment_intent_id, ticket_id, seat_label, buyer_name, buyer_email, event_id")
        .eq("id", qrCode);

      if (byOrderId && byOrderId.length > 0) {
        orders = byOrderId;
        paymentIntentId = byOrderId[0].stripe_payment_intent_id;
      } else {
        // Next check if qrCode belongs to a ticket_instance
        const { data: inst } = await admin
          .from("ticket_instances")
          .select("order_id")
          .eq("qr_code", qrCode)
          .maybeSingle();

        if (inst?.order_id) {
          const { data: byInstOrder } = await admin
            .from("ticket_orders")
            .select("id, stripe_payment_intent_id, ticket_id, seat_label, buyer_name, buyer_email, event_id")
            .eq("id", inst.order_id);
          orders = byInstOrder;
          paymentIntentId = byInstOrder?.[0]?.stripe_payment_intent_id || null;
        }
      }
    } else {
      // Legacy order qr_code check
      const { data: byLegacyQr } = await admin
        .from("ticket_orders")
        .select("id, stripe_payment_intent_id, ticket_id, seat_label, buyer_name, buyer_email, event_id")
        .eq("qr_code", qrCode);
      orders = byLegacyQr;
      paymentIntentId = byLegacyQr?.[0]?.stripe_payment_intent_id || null;
    }

    // UUIDs stored in ticket_orders.qr_code (every order carries one) are not
    // covered by the branches above — resolve them here before failing closed.
    // Without this, legitimate resends keyed by the order QR would 404.
    if ((!orders || orders.length === 0) && isUuid) {
      const { data: byOrderQr } = await admin
        .from("ticket_orders")
        .select("id, stripe_payment_intent_id, ticket_id, seat_label, buyer_name, buyer_email, event_id")
        .eq("qr_code", qrCode);
      if (byOrderQr && byOrderQr.length > 0) {
        orders = byOrderQr;
        paymentIntentId = byOrderQr[0].stripe_payment_intent_id;
      }
    }

    // If paymentIntentId exists, fetch all orders grouped by paymentIntentId
    if (paymentIntentId) {
      const { data: groupedOrders } = await admin
        .from("ticket_orders")
        .select("id, stripe_payment_intent_id, ticket_id, seat_label, buyer_name, buyer_email, event_id")
        .eq("stripe_payment_intent_id", paymentIntentId);
      if (groupedOrders && groupedOrders.length > 0) {
        orders = groupedOrders;
      }
    }

    // No matching order: fail closed. (Previously the handler fabricated a
    // "valid" ticket from any supplied QR — an enumeration/exfil oracle.)
    const primaryOrder = orders?.[0];
    if (!primaryOrder) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    // Entitlement: the supplied email must match the order's buyer email.
    // The recipient below is server-derived, never the client value, so this
    // endpoint cannot be used as a relay to arbitrary addresses.
    if (!isEmailEntitled(primaryOrder.buyer_email, buyerEmail)) {
      return NextResponse.json({ error: "Email does not match this order." }, { status: 403 });
    }
    const recipientEmail = primaryOrder.buyer_email;

    const orderIds = (orders || []).map((o) => o.id);
    let instances: Array<{ id: string; qr_code: string; status: string; tier_name: string }> = [];

    if (orderIds.length > 0) {
      const { data: instData } = await admin
        .from("ticket_instances")
        .select("id, qr_code, status, order_id, ticket_id")
        .in("order_id", orderIds)
        .order("created_at", { ascending: true });

      if (instData && instData.length > 0) {
        // Hydrate ticket tier names directly from tickets table using ticket_instances.ticket_id
        const ticketIds = Array.from(new Set(instData.map((i) => i.ticket_id).filter(Boolean)));
        const { data: dbTickets } = ticketIds.length
          ? await admin.from("tickets").select("id, name").in("id", ticketIds)
          : { data: [] };

        const ticketNameMap = new Map((dbTickets || []).map((t) => [t.id, t.name]));

        instances = instData.map((inst) => {
          const tierName = (inst.ticket_id ? ticketNameMap.get(inst.ticket_id) : null) || "Standard Entry";

          return {
            id: inst.id,
            qr_code: inst.qr_code,
            status: inst.status,
            tier_name: tierName,
          };
        });
      }
    }

    // Fallback if instances array is empty (e.g. legacy row or direct test call)
    if (instances.length === 0) {
      instances = [{ id: qrCode, qr_code: qrCode, status: "valid", tier_name: "Standard Entry" }];
    }

    // Fetch event title and slug if available
    let resolvedEventTitle = eventTitle || "Event";
    let resolvedEventSlug = eventSlug || "";

    if (orders && orders[0]?.event_id) {
      const { data: eventData } = await admin
        .from("events")
        .select("title, slug")
        .eq("id", orders[0].event_id)
        .maybeSingle();

      if (eventData) {
        resolvedEventTitle = eventData.title || resolvedEventTitle;
        resolvedEventSlug = eventData.slug || resolvedEventSlug;
      }
    }

    const baseUrl = getSiteUrl();
    const totalCount = instances.length;

    // Render individual ticket cards for each instance
    const ticketCardsHtml = instances
      .map((inst, index) => {
        const verifyUrl = `${baseUrl}/verify/${inst.qr_code}`;
        const ticketUrl = `${baseUrl}/ticket-confirmation?qr=${inst.qr_code}&event=${resolvedEventSlug}${isFree ? "&free=true" : ""}`;
        const ticketNum = index + 1;

        return `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:2px dashed #e4e4e7;border-radius:14px;margin-bottom:24px;overflow:hidden;">
            <tr>
              <td style="padding:20px;background:#f4f4f5;border-bottom:1px solid #e4e4e7;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      <span style="display:inline-block;background:#ea580c;color:#ffffff;font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">
                        ${inst.tier_name}
                      </span>
                    </td>
                    <td align="right" style="color:#71717a;font-size:12px;font-weight:700;">
                      Ticket ${ticketNum} of ${totalCount}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;text-align:center;">
                <img
                  src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(verifyUrl)}"
                  alt="Ticket QR Code"
                  width="180"
                  height="180"
                  style="border-radius:8px;"
                />
                <p style="margin:12px 0 4px;color:#a1a1aa;font-size:11px;font-family:monospace;letter-spacing:2px;">
                  ${inst.qr_code.match(/.{1,8}/g)?.join(" ") || inst.qr_code}
                </p>
                <div style="margin-top:16px;">
                  <a href="${ticketUrl}"
                    style="display:inline-block;background:#18181b;color:#ffffff;font-weight:700;font-size:13px;padding:10px 24px;border-radius:30px;text-decoration:none;">
                    View Digital Pass →
                  </a>
                </div>
              </td>
            </tr>
          </table>
        `;
      })
      .join("");

    if (!process.env.RESEND_API_KEY) {
      console.warn("[send-ticket] RESEND_API_KEY is not configured; skipping email dispatch.");
      // QR credentials are never returned in responses, including mocks.
      return NextResponse.json({
        success: true,
        count: totalCount,
        mock: true,
      });
    }

    const { error } = await resend.emails.send({
      from: `${BRAND.name} <${BRAND.contactEmail}>`,
      to: recipientEmail,
      subject: `Your ${totalCount > 1 ? `${totalCount} tickets` : "ticket"} for ${resolvedEventTitle} 🎟️`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
            <tr>
              <td align="center">
                <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                  <!-- Header -->
                  <tr>
                    <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:36px;text-align:center;">
                      <p style="margin:0;color:#fed7aa;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Aldriva Events</p>
                      <h1 style="margin:8px 0 0;color:#ffffff;font-size:28px;font-weight:900;">You're In! 🎉</h1>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:32px;">
                      <p style="margin:0 0 8px;color:#71717a;font-size:14px;">
                        Hi ${buyerName || primaryOrder?.buyer_name || "there"},
                      </p>
                      <p style="margin:0 0 24px;color:#18181b;font-size:16px;line-height:1.6;">
                        Your purchase of <strong>${totalCount}</strong> ${totalCount > 1 ? "tickets" : "ticket"} for <strong>${resolvedEventTitle}</strong> is confirmed.
                        ${seatLabel ? `Seat assignment: <strong>${seatLabel}</strong>.` : ""}
                      </p>

                      <!-- Individual Ticket Cards -->
                      ${ticketCardsHtml}

                      <p style="margin:24px 0 0;color:#71717a;font-size:13px;line-height:1.6;text-align:center;">
                        Present each ticket's unique QR code at entry.<br/>
                        <strong style="color:#18181b;">Each QR code can only be scanned once.</strong>
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background:#fafafa;border-top:1px solid #f4f4f5;padding:20px 32px;text-align:center;">
                      <p style="margin:0;color:#a1a1aa;font-size:12px;">
                        ${BRAND.name} · Questions? <a href="mailto:${BRAND.supportEmail}" style="color:#f97316;">Contact support</a>
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    if (error) {
      console.warn("[send-ticket] Resend returned error (returning mock success in dev):", error.message);
      if (process.env.NODE_ENV !== "production") {
        return NextResponse.json({
          success: true,
          count: totalCount,
          devError: error.message,
        });
      }
      return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: totalCount,
    });
  } catch (err) {
    console.error("[send-ticket] Send ticket error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
