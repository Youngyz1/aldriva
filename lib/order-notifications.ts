import { createNotification } from "@/lib/notifications";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { BRAND } from "@/config/branding";
import { Resend } from "resend";
import { formatChosenMenuOption } from "@/lib/order-option-display";
import { formatMoney } from "@/lib/money";

export type OrderNotificationChannel = "bell" | "email" | "whatsapp";

export interface OrderNotificationPayload {
  id: string;
  organizer_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  fulfilment_type: "pickup" | "delivery";
  delivery_address?: string | null;
  currency: string;
  subtotal?: number | null;
  delivery_fee?: number | null;
  total_amount: number;
  scheduled_for?: string | null;
  website_slug?: string;
  tracking_token?: string;
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    promotion?: {
      id: string;
      name: string;
      offer_type: string;
      code?: string;
      original_unit_price: number;
      discount_per_unit: number;
    };
    chosen_options?: Array<{
      name: string;
      price_delta?: number;
      group_name?: string;
      group_kind?: "variant" | "addon";
      qty?: number;
    }>;
  }>;
}

/**
 * Dispatches order notifications across requested channels.
 * Takes a channel list so WhatsApp or other channels can be introduced later without
 * touching order placement logic.
 *
 * Guarantees:
 * - Never throws or bubbles errors to the caller (order must not fail if notification fails).
 * - Logs stable error codes only, strictly omitting PII.
 */
export async function dispatchOrderNotifications(
  order: OrderNotificationPayload,
  channels: OrderNotificationChannel[] = ["bell", "email"]
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    // Resolve owner user id and email from organizers/profiles
    const { data: org, error: orgError } = await admin
      .from("organizers")
      .select("id, user_id, name, contact_email")
      .eq("id", order.organizer_id)
      .maybeSingle();

    if (orgError || !org?.user_id) {
      console.error("[order-notifications] Failed to resolve organizer: code=org_not_found");
      return;
    }

    const ownerUserId = org.user_id;

    // Resolve owner email: organizer contact_email or user profile email
    let ownerEmail = org.contact_email;
    if (!ownerEmail) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", ownerUserId)
        .maybeSingle();
      ownerEmail = profile?.email;
    }

    const orderLink = `/dashboard/org/${order.organizer_id}/orders`;
    const title = `New order #${order.order_number}`;
    const formattedTotal = `${order.currency} ${Number(order.total_amount).toFixed(2)}`;
    const fulfilmentText = order.fulfilment_type === "delivery" ? "Delivery" : "Pickup";
    const promotionSummary = (order.items || [])
      .filter((item) => item.promotion?.name)
      .slice(0, 3)
      .map((item) => `${item.name}: ${item.promotion!.name}${item.promotion!.discount_per_unit > 0 ? ` (saved ${formatMoney(item.promotion!.discount_per_unit * item.quantity, order.currency, "en")})` : ""}`)
      .join("; ");
    const body = `${order.customer_name} placed an order (${fulfilmentText}) for ${formattedTotal}.${promotionSummary ? ` Promotions: ${promotionSummary}.` : ""}`;
    const showFeeBreakdown =
      order.fulfilment_type === "delivery" &&
      typeof order.subtotal === "number" &&
      typeof order.delivery_fee === "number";
    const formattedSubtotal = showFeeBreakdown
      ? `${order.currency} ${Number(order.subtotal).toFixed(2)}`
      : null;
    const formattedFee =
      showFeeBreakdown && Number(order.delivery_fee) > 0
        ? `${order.currency} ${Number(order.delivery_fee).toFixed(2)}`
        : null;

    // 1. In-app bell notification
    if (channels.includes("bell")) {
      try {
        await createNotification({
          userId: ownerUserId,
          type: "order_placed",
          title,
          body,
          link: orderLink,
          relatedType: "order",
          relatedId: order.id,
        });
      } catch (bellErr) {
        console.error(
          "[order-notifications] Bell notification failed: code=bell_dispatch_failed",
          bellErr instanceof Error ? bellErr.name : "unknown"
        );
      }
    }

    // 2. Email notification with tel: link
    if (channels.includes("email") && ownerEmail) {
      try {
        const itemsHtml = (order.items || [])
          .map((item) => {
            const optionsList = (item.chosen_options || [])
              .map(formatChosenMenuOption)
              .join(", ");
            const promotionLine = item.promotion?.name
              ? `<div style="color: #047857; font-size: 13px;">Promotion: ${escapeHtml(item.promotion.name)}${item.promotion.discount_per_unit > 0 ? ` · saved ${escapeHtml(formatMoney(item.promotion.discount_per_unit * item.quantity, order.currency, "en"))}` : ""}</div>`
              : "";
            return `<tr>
              <td style="padding: 6px 0; border-bottom: 1px solid #f4f4f5;">
                <strong>${item.quantity}x ${escapeHtml(item.name)}</strong>
                ${optionsList ? `<div style="color: #71717a; font-size: 13px;">${escapeHtml(optionsList)}</div>` : ""}
                ${promotionLine}
              </td>
              <td style="padding: 6px 0; border-bottom: 1px solid #f4f4f5; text-align: right; vertical-align: top;">
                ${order.currency} ${Number(item.line_total).toFixed(2)}
              </td>
            </tr>`;
          })
          .join("");

        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #18181b;">
            <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">New order #${escapeHtml(order.order_number)}</h2>
            <p style="color: #52525b; font-size: 14px; margin-top: 0;">You have received a new order request on your website.</p>

            <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="font-size: 14px; font-weight: 600; text-transform: uppercase; color: #71717a; margin: 0 0 10px 0;">Customer Details</h3>
              <p style="margin: 4px 0;"><strong>Name:</strong> ${escapeHtml(order.customer_name)}</p>
              <p style="margin: 4px 0;"><strong>Phone:</strong> <a href="tel:${escapeHtml(order.customer_phone)}" style="color: #c2410c; text-decoration: underline;">${escapeHtml(order.customer_phone)}</a></p>
              ${order.customer_email ? `<p style="margin: 4px 0;"><strong>Email:</strong> ${escapeHtml(order.customer_email)}</p>` : ""}
              <p style="margin: 4px 0;"><strong>Fulfilment:</strong> ${fulfilmentText}</p>
              ${order.delivery_address ? `<p style="margin: 4px 0;"><strong>Address:</strong> ${escapeHtml(order.delivery_address)}</p>` : ""}
              ${order.scheduled_for ? `<p style="margin: 4px 0;"><strong>Scheduled for:</strong> ${escapeHtml(new Date(order.scheduled_for).toLocaleString("en-US", { timeZone: "UTC" }))}</p>` : ""}
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
              <thead>
                <tr style="border-bottom: 2px solid #e4e4e7; text-align: left; color: #71717a;">
                  <th style="padding-bottom: 8px;">Item</th>
                  <th style="padding-bottom: 8px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                ${showFeeBreakdown ? `<tr><td style="padding-top: 8px; font-size: 14px; color: #52525b;">Subtotal</td><td style="padding-top: 8px; font-size: 14px; text-align: right;">${formattedSubtotal}</td></tr><tr><td style="font-size: 14px; color: #52525b;">Delivery fee</td><td style="font-size: 14px; text-align: right;">${formattedFee ?? "Free"}</td></tr>` : ""}
                <tr>
                  <td style="padding-top: 12px; font-weight: 700; font-size: 16px;">Total to collect</td>
                  <td style="padding-top: 12px; font-weight: 700; font-size: 16px; text-align: right; color: #c2410c;">${formattedTotal}</td>
                </tr>
              </tfoot>
            </table>

            <div style="margin-top: 24px;">
              <a href="${BRAND.website}${orderLink}" style="display: inline-block; background-color: #c2410c; color: #ffffff; text-decoration: none; font-weight: 600; padding: 10px 20px; border-radius: 8px; font-size: 14px;">
                View order in Dashboard
              </a>
            </div>
          </div>
        `;

        await createNotification({
          userId: ownerUserId,
          type: "order_placed",
          title,
          body,
          link: orderLink,
          relatedType: "order",
          relatedId: order.id,
          email: {
            to: ownerEmail,
            subject: `[${BRAND.name}] New order #${order.order_number} from ${order.customer_name}`,
            html: emailHtml,
          },
        });
      } catch (emailErr) {
        console.error(
          "[order-notifications] Email dispatch failed: code=email_dispatch_failed",
          emailErr instanceof Error ? emailErr.name : "unknown"
        );
      }
    }

    // 2.5 Customer placement confirmation email
    if (order.customer_email && order.website_slug && order.tracking_token && process.env.RESEND_API_KEY) {
      try {
        const trackingUrl = `${BRAND.website}/site/${order.website_slug}/orders/${order.tracking_token}`;
        const resend = new Resend(process.env.RESEND_API_KEY);
        const customerHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #18181b;">
            <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Order received #${escapeHtml(order.order_number)}</h2>
            <p style="color: #52525b; font-size: 14px; margin-top: 0;">Thank you for your order! We have received your order request and will update you shortly.</p>
            <div style="margin: 20px 0;">
              <a href="${trackingUrl}" style="display: inline-block; background-color: #c2410c; color: #ffffff; text-decoration: none; font-weight: 600; padding: 10px 20px; border-radius: 8px; font-size: 14px;">
                Track your order
              </a>
            </div>
            <p style="color: #71717a; font-size: 12px;">Total: ${escapeHtml(formattedTotal)} (${order.fulfilment_type === "delivery" ? "Delivery" : "Pickup"})${showFeeBreakdown ? ` — Subtotal ${escapeHtml(formattedSubtotal ?? "")}, Delivery fee ${escapeHtml(formattedFee ?? "Free")}` : ""}</p>
          </div>
        `;
        await resend.emails.send({
          from: `${BRAND.name} <${BRAND.contactEmail}>`,
          to: order.customer_email,
          subject: `[${BRAND.name}] Order confirmation #${order.order_number}`,
          html: customerHtml,
        });
      } catch (custErr) {
        console.error(
          "[order-notifications] Customer confirmation email failed: code=customer_email_failed",
          custErr instanceof Error ? custErr.name : "unknown"
        );
      }
    }

    // 3. WhatsApp channel (future pluggable extension point)
    if (channels.includes("whatsapp")) {
      // Reserved for Phase 3+
    }
  } catch (err) {
    console.error(
      "[order-notifications] Dispatch caught unexpected error: code=unexpected",
      err instanceof Error ? err.name : "unknown"
    );
  }
}

export interface CustomerStatusNotificationInput {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  status: "accepted" | "ready" | "out_for_delivery" | "delivered" | "cancelled" | string;
  fulfilmentType: "pickup" | "delivery";
  currency: string;
  totalAmount: number;
  trackingToken: string;
  websiteSlug: string;
  estimatedReadyAt?: string | null;
  cancellationReason?: string | null;
  cancellationNote?: string | null;
  riderName?: string | null;
  riderPhone?: string | null;
  timeZone?: string;
}

export async function dispatchCustomerOrderStatusEmail(
  input: CustomerStatusNotificationInput
): Promise<void> {
  if (!input.customerEmail || !process.env.RESEND_API_KEY) return;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const trackingUrl = `${BRAND.website}/site/${input.websiteSlug}/orders/${input.trackingToken}`;
    let subject = `[${BRAND.name}] Order #${input.orderNumber} update`;
    let heading = `Order #${input.orderNumber} update`;
    let body = "";

    if (input.status === "accepted") {
      subject = `[${BRAND.name}] Order #${input.orderNumber} accepted`;
      heading = `Your order #${input.orderNumber} has been accepted!`;
      let timeText = "";
      if (input.estimatedReadyAt) {
        try {
          const formattedReady = new Date(input.estimatedReadyAt).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: input.timeZone || "UTC",
          });
          timeText = `<p style="font-weight: 600; color: #c2410c;">Estimated ready time: ${escapeHtml(formattedReady)}</p>`;
        } catch {
          // fallback
        }
      }
      body = `<p>Great news! The business has accepted your order and is preparing it.</p>${timeText}`;
    } else if (input.status === "ready") {
      const isDelivery = input.fulfilmentType === "delivery";
      subject = `[${BRAND.name}] Order #${input.orderNumber} is ${isDelivery ? "ready for delivery" : "ready"}`;
      heading = isDelivery ? `Your order is ready!` : `Your order is ready for pickup!`;
      body = isDelivery
        ? `<p>Your order is freshly prepared and will be handed to a rider shortly for delivery.</p>`
        : `<p>Your order is freshly prepared and ready for you to pick up.</p>`;
    } else if (input.status === "out_for_delivery") {
      subject = `[${BRAND.name}] Order #${input.orderNumber} is on the way!`;
      heading = `Your order is out for delivery!`;
      const riderLine = input.riderName
        ? `<p style="margin-top: 8px;"><strong>Rider:</strong> ${escapeHtml(input.riderName)}${input.riderPhone ? ` · <a href="tel:${escapeHtml(input.riderPhone)}" style="color: #c2410c;">${escapeHtml(input.riderPhone)}</a>` : ""}</p>`
        : "";
      body = `<p>Your order has been handed to the courier and is on its way to you.</p>${riderLine}`;
    } else if (input.status === "delivered") {
      subject = `[${BRAND.name}] Order #${input.orderNumber} delivered`;
      heading = `Your order has been delivered!`;
      body = `<p>Your order has arrived. Thank you for ordering with us!</p>`;
    } else if (input.status === "cancelled") {
      subject = `[${BRAND.name}] Order #${input.orderNumber} cancelled`;
      heading = `Order #${input.orderNumber} cancelled`;
      const reasonMap: Record<string, string> = {
        out_of_stock: "Items out of stock",
        kitchen_closed: "Kitchen closed",
        cannot_deliver_there: "Unable to deliver to your address",
        other: "Other reason",
      };
      const reasonLabel = (input.cancellationReason && reasonMap[input.cancellationReason]) || "Order could not be fulfilled";
      body = `<p>Unfortunately, your order could not be accepted: <strong>${escapeHtml(reasonLabel)}</strong>.</p>${input.cancellationNote ? `<p style="color: #71717a;">${escapeHtml(input.cancellationNote)}</p>` : ""}`;
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #18181b;">
        <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">${escapeHtml(heading)}</h2>
        <div style="font-size: 14px; color: #52525b; margin: 16px 0;">${body}</div>
        <div style="margin: 24px 0;">
          <a href="${trackingUrl}" style="display: inline-block; background-color: #c2410c; color: #ffffff; text-decoration: none; font-weight: 600; padding: 10px 20px; border-radius: 8px; font-size: 14px;">
            View order status
          </a>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: `${BRAND.name} <${BRAND.contactEmail}>`,
      to: input.customerEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error(
      "[order-notifications] Status email dispatch failed: code=status_email_failed",
      err instanceof Error ? err.name : "unknown"
    );
  }
}


function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
