import { createNotification } from "@/lib/notifications";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { BRAND } from "@/config/branding";
import { Resend } from "resend";

export interface ReservationNotificationPayload {
  id: string;
  organizer_id: string;
  reservation_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  party_size: number;
  starts_at: string;
  siteTimezone: string;
  customer_note?: string | null;
  website_slug?: string;
  lookup_token?: string;
}

function formatStartsAt(startsAt: string, timeZone: string, locale: "en" | "fr"): string {
  try {
    return new Date(startsAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
  } catch {
    return new Date(startsAt).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

/**
 * Owner dispatch for a new table request: in-app bell + email.
 * Reuses the order notification infrastructure (createNotification).
 * Never throws: notification failure must not fail the request.
 */
export async function dispatchReservationNotifications(
  reservation: ReservationNotificationPayload
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const { data: org, error: orgError } = await admin
      .from("organizers")
      .select("id, user_id, name, contact_email")
      .eq("id", reservation.organizer_id)
      .maybeSingle();

    if (orgError || !org?.user_id) {
      console.error("[reservation-notifications] Failed to resolve organizer: code=org_not_found");
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

    const orderLink = `/dashboard/org/${reservation.organizer_id}/reservations`;
    const title = `New table request #${reservation.reservation_number}`;
    const when = formatStartsAt(reservation.starts_at, reservation.siteTimezone, "en");
    const body = `${reservation.customer_name} requested a table for ${reservation.party_size} on ${when}.`;

    try {
      await createNotification({
        userId: ownerUserId,
        type: "reservation_placed",
        title,
        body,
        link: orderLink,
        relatedType: "reservation",
        relatedId: reservation.id,
      });
    } catch (bellErr) {
      console.error(
        "[reservation-notifications] Bell notification failed: code=bell_dispatch_failed",
        bellErr instanceof Error ? bellErr.name : "unknown"
      );
    }

    if (ownerEmail) {
      try {
        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #18181b;">
            <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">New table request #${escapeHtml(reservation.reservation_number)}</h2>
            <p style="color: #52525b; font-size: 14px; margin-top: 0;">A guest asked for a table on your website. Confirm or decline it from your dashboard — nothing is promised until you confirm.</p>
            <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 4px 0;"><strong>Guest:</strong> ${escapeHtml(reservation.customer_name)}</p>
              <p style="margin: 4px 0;"><strong>Phone:</strong> <a href="tel:${escapeHtml(reservation.customer_phone)}" style="color: #c2410c; text-decoration: underline;">${escapeHtml(reservation.customer_phone)}</a></p>
              ${reservation.customer_email ? `<p style="margin: 4px 0;"><strong>Email:</strong> ${escapeHtml(reservation.customer_email)}</p>` : ""}
              <p style="margin: 4px 0;"><strong>Party size:</strong> ${reservation.party_size}</p>
              <p style="margin: 4px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
              ${reservation.customer_note ? `<p style="margin: 4px 0;"><strong>Note:</strong> ${escapeHtml(reservation.customer_note)}</p>` : ""}
            </div>
            <div style="margin-top: 24px;">
              <a href="${BRAND.website}${orderLink}" style="display: inline-block; background-color: #c2410c; color: #ffffff; text-decoration: none; font-weight: 600; padding: 10px 20px; border-radius: 8px; font-size: 14px;">
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
          link: orderLink,
          relatedType: "reservation",
          relatedId: reservation.id,
          email: {
            to: ownerEmail,
            subject: `[${BRAND.name}] New table request #${reservation.reservation_number} from ${reservation.customer_name}`,
            html: emailHtml,
          },
        });
      } catch (emailErr) {
        console.error(
          "[reservation-notifications] Email dispatch failed: code=email_dispatch_failed",
          emailErr instanceof Error ? emailErr.name : "unknown"
        );
      }
    }

    // Guest placement confirmation (request received — not confirmed yet).
    if (reservation.customer_email && reservation.website_slug && reservation.lookup_token && process.env.RESEND_API_KEY) {
      try {
        const trackingUrl = `${BRAND.website}/site/${reservation.website_slug}/reservations/${reservation.lookup_token}`;
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: `${BRAND.name} <${BRAND.contactEmail}>`,
          to: reservation.customer_email,
          subject: `[${BRAND.name}] Table request received #${reservation.reservation_number}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #18181b;">
              <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Request received #${escapeHtml(reservation.reservation_number)}</h2>
              <p style="color: #52525b; font-size: 14px; margin-top: 0;">Thank you! Your table request for ${reservation.party_size} on ${escapeHtml(when)} is with the restaurant. <strong>Nothing is confirmed yet</strong> — we will confirm by phone or email.</p>
              <div style="margin: 20px 0;">
                <a href="${trackingUrl}" style="display: inline-block; background-color: #c2410c; color: #ffffff; text-decoration: none; font-weight: 600; padding: 10px 20px; border-radius: 8px; font-size: 14px;">
                  Track your request
                </a>
              </div>
            </div>
          `,
        });
      } catch (custErr) {
        console.error(
          "[reservation-notifications] Guest confirmation email failed: code=customer_email_failed",
          custErr instanceof Error ? custErr.name : "unknown"
        );
      }
    }
  } catch (err) {
    console.error(
      "[reservation-notifications] Dispatch caught unexpected error: code=unexpected",
      err instanceof Error ? err.name : "unknown"
    );
  }
}

export interface OwnerCancellationNotice {
  organizer_id: string;
  reservation_number: string;
  customer_name: string;
}

/**
 * Owner notice when a guest cancels their own request (bell + email).
 * Fire-and-forget: callers never await the outcome.
 */
export async function notifyOwnerReservationCancelled(notice: OwnerCancellationNotice): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const { data: org } = await admin
      .from("organizers")
      .select("id, user_id, contact_email")
      .eq("id", notice.organizer_id)
      .maybeSingle();
    const ownerUserId = (org as { user_id?: string } | null)?.user_id;
    if (!ownerUserId) {
      console.error("[reservation-notifications] Failed to resolve organizer: code=org_not_found");
      return;
    }
    let ownerEmail = (org as { contact_email?: string | null } | null)?.contact_email;
    if (!ownerEmail) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", ownerUserId)
        .maybeSingle();
      ownerEmail = (profile as { email?: string | null } | null)?.email;
    }

    const orderLink = `/dashboard/org/${notice.organizer_id}/reservations`;
    const title = `Table request #${notice.reservation_number} cancelled by guest`;
    const body = `${notice.customer_name} cancelled their table request #${notice.reservation_number}.`;
    await createNotification({
      userId: ownerUserId,
      type: "reservation_placed",
      title,
      body,
      link: orderLink,
      relatedType: "reservation",
      relatedId: `${notice.organizer_id}:${notice.reservation_number}`,
      ...(ownerEmail
        ? {
            email: {
              to: ownerEmail,
              subject: `[${BRAND.name}] ${title}`,
              html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #18181b;"><h2 style="font-size: 20px; font-weight: 700;">${escapeHtml(title)}</h2><p style="color: #52525b; font-size: 14px;">${escapeHtml(body)}</p><div style="margin-top: 24px;"><a href="${BRAND.website}${orderLink}" style="display: inline-block; background-color: #c2410c; color: #ffffff; text-decoration: none; font-weight: 600; padding: 10px 20px; border-radius: 8px; font-size: 14px;">View reservations</a></div></div>`,
            },
          }
        : {}),
    });
  } catch (err) {
    console.error(
      "[reservation-notifications] Cancel notice failed: code=unexpected",
      err instanceof Error ? err.name : "unknown"
    );
  }
}

export interface ReservationStatusNotificationInput {
  reservationNumber: string;
  customerName: string;
  customerEmail: string;
  status: "confirmed" | "declined" | "cancelled" | string;
  partySize: number;
  startsAt: string;
  siteTimezone: string;
  lookupToken: string;
  websiteSlug: string;
  ownerNote?: string | null;
  declineReason?: string | null;
}

/**
 * Guest status email (confirmed / declined / cancelled).
 * Callers send only after a successful conditional status update, so each
 * (reservation, status) pair notifies at most once. Non-blocking.
 */
export async function dispatchCustomerReservationStatusEmail(
  input: ReservationStatusNotificationInput
): Promise<void> {
  if (!input.customerEmail || !process.env.RESEND_API_KEY) return;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const trackingUrl = `${BRAND.website}/site/${input.websiteSlug}/reservations/${input.lookupToken}`;
    const when = formatStartsAt(input.startsAt, input.siteTimezone, "en");
    let subject = `[${BRAND.name}] Table request #${input.reservationNumber} update`;
    let heading = `Table request #${input.reservationNumber} update`;
    let body = "";

    if (input.status === "confirmed") {
      subject = `[${BRAND.name}] Table request #${input.reservationNumber} confirmed`;
      heading = `Your table is confirmed!`;
      body = `<p>Great news — your table for ${input.partySize} on ${escapeHtml(when)} is confirmed. We look forward to seeing you!</p>${input.ownerNote ? `<p style="color: #71717a;">${escapeHtml(input.ownerNote)}</p>` : ""}`;
    } else if (input.status === "declined") {
      subject = `[${BRAND.name}] Table request #${input.reservationNumber} declined`;
      heading = `We could not confirm your request`;
      const reasonMap: Record<string, string> = {
        fully_booked: "The restaurant is fully booked at that time",
        closed_that_day: "The restaurant is closed that day",
        cannot_accommodate_party: "Your party size cannot be accommodated",
        other: "The restaurant could not accommodate this request",
      };
      const reasonLabel = (input.declineReason && reasonMap[input.declineReason]) || "The restaurant could not accommodate this request";
      body = `<p>Unfortunately: <strong>${escapeHtml(reasonLabel)}</strong>. Please call us and we will find another time.</p>${input.ownerNote ? `<p style="color: #71717a;">${escapeHtml(input.ownerNote)}</p>` : ""}`;
    } else if (input.status === "cancelled") {
      subject = `[${BRAND.name}] Table request #${input.reservationNumber} cancelled`;
      heading = `Table request #${input.reservationNumber} cancelled`;
      body = `<p>Your table request for ${escapeHtml(when)} has been cancelled.</p>`;
    } else {
      return;
    }

    await resend.emails.send({
      from: `${BRAND.name} <${BRAND.contactEmail}>`,
      to: input.customerEmail,
      subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #18181b;">
          <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">${escapeHtml(heading)}</h2>
          <div style="font-size: 14px; color: #52525b; margin: 16px 0;">${body}</div>
          <div style="margin: 24px 0;">
            <a href="${trackingUrl}" style="display: inline-block; background-color: #c2410c; color: #ffffff; text-decoration: none; font-weight: 600; padding: 10px 20px; border-radius: 8px; font-size: 14px;">
              View request status
            </a>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error(
      "[reservation-notifications] Status email dispatch failed: code=status_email_failed",
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
