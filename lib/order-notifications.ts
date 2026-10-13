import "server-only";
import { createNotification } from "@/lib/notifications";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { BRAND } from "@/config/branding";

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
  total_amount: number;
  scheduled_for?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    chosen_options?: Array<{ name: string; price_delta?: number }>;
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
    const body = `${order.customer_name} placed an order (${fulfilmentText}) for ${formattedTotal}.`;

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
              .map((opt) => opt.name)
              .join(", ");
            return `<tr>
              <td style="padding: 6px 0; border-bottom: 1px solid #f4f4f5;">
                <strong>${item.quantity}x ${escapeHtml(item.name)}</strong>
                ${optionsList ? `<div style="color: #71717a; font-size: 13px;">${escapeHtml(optionsList)}</div>` : ""}
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
