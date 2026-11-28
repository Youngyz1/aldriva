import { createNotification } from "@/lib/notifications";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { BRAND } from "@/config/branding";
import { formatReservationTimeRange } from "@/lib/reservation-slots";

export interface GeneralBookingNotificationPayload {
  id: string;
  organizer_id: string;
  reservation_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  service_type: string;
  starts_at: string;
  duration_minutes?: number | null;
  ends_at?: string | null;
  siteTimezone: string;
  customer_note?: string | null;
}

/**
 * Owner dispatch for a new general booking (appointment) request: in-app bell
 * + email. Reuses the same `createNotification` infrastructure as table
 * reservations (lib/reservation-notifications.ts) but with booking-flavored
 * copy — no party size, no "table" language. `notifications.type` has no
 * dedicated "booking_placed" value (migration 176), so this reuses
 * "reservation_placed"; nothing in the product reads that column to pick an
 * icon or label. Never throws: notification failure must not fail the request.
 */
export async function dispatchGeneralBookingNotifications(
  booking: GeneralBookingNotificationPayload
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const { data: org, error: orgError } = await admin
      .from("organizers")
      .select("id, user_id, name, contact_email")
      .eq("id", booking.organizer_id)
      .maybeSingle();

    if (orgError || !org?.user_id) {
      console.error("[general-booking-notifications] Failed to resolve organizer: code=org_not_found");
      return;
    }

    const ownerUserId = org.user_id as string;

    let ownerEmail = (org as { contact_email?: string | null }).contact_email;
    if (!ownerEmail) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", ownerUserId)
        .maybeSingle();
      ownerEmail = (profile as { email?: string | null } | null)?.email;
    }

    const bookingLink = `/dashboard/org/${booking.organizer_id}/bookings`;
    const title = `New booking request #${booking.reservation_number}`;
    const when = formatReservationTimeRange({
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      durationMinutes: booking.duration_minutes,
      timeZone: booking.siteTimezone,
      locale: "en",
    });
    const body = `${booking.customer_name} requested ${booking.service_type} on ${when}.`;

    try {
      await createNotification({
        userId: ownerUserId,
        type: "reservation_placed",
        title,
        body,
        link: bookingLink,
        relatedType: "reservation",
        relatedId: booking.id,
      });
    } catch (bellErr) {
      console.error(
        "[general-booking-notifications] Bell notification failed: code=bell_dispatch_failed",
        bellErr instanceof Error ? bellErr.name : "unknown"
      );
    }

    if (ownerEmail) {
      try {
        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #18181b;">
            <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">New booking request #${escapeHtml(booking.reservation_number)}</h2>
            <p style="color: #52525b; font-size: 14px; margin-top: 0;">A customer requested a booking on your website. Confirm or decline it from your dashboard — nothing is promised until you confirm.</p>
            <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 4px 0;"><strong>Customer:</strong> ${escapeHtml(booking.customer_name)}</p>
              <p style="margin: 4px 0;"><strong>Phone:</strong> <a href="tel:${escapeHtml(booking.customer_phone)}" style="color: #c2410c; text-decoration: underline;">${escapeHtml(booking.customer_phone)}</a></p>
              ${booking.customer_email ? `<p style="margin: 4px 0;"><strong>Email:</strong> ${escapeHtml(booking.customer_email)}</p>` : ""}
              <p style="margin: 4px 0;"><strong>Service:</strong> ${escapeHtml(booking.service_type)}</p>
              <p style="margin: 4px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
              ${booking.customer_note ? `<p style="margin: 4px 0;"><strong>Note:</strong> ${escapeHtml(booking.customer_note)}</p>` : ""}
            </div>
            <div style="margin-top: 24px;">
              <a href="${BRAND.website}${bookingLink}" style="display: inline-block; background-color: #c2410c; color: #ffffff; text-decoration: none; font-weight: 600; padding: 10px 20px; border-radius: 8px; font-size: 14px;">
                Review in Dashboard
              </a>
            </div>
          </div>
        `;
        await createNotification({
          userId: ownerUserId,
          type: "reservation_placed",
          title,
          body,
          link: bookingLink,
          relatedType: "reservation",
          relatedId: booking.id,
          email: {
            to: ownerEmail,
            subject: `[${BRAND.name}] New booking request #${booking.reservation_number} from ${booking.customer_name}`,
            html: emailHtml,
          },
        });
      } catch (emailErr) {
        console.error(
          "[general-booking-notifications] Email dispatch failed: code=email_dispatch_failed",
          emailErr instanceof Error ? emailErr.name : "unknown"
        );
      }
    }
  } catch (err) {
    console.error(
      "[general-booking-notifications] Dispatch caught unexpected error: code=unexpected",
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
