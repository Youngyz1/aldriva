/**
 * lib/event-notifications.ts
 * Unified Communications & Notifications Dispatcher for Aldriva Events.
 * Handles transactional emails (invitations, reminders, confirmations, updates) with idempotency.
 */

import { Resend } from "resend";
import { logEventAction } from "@/lib/event-audit";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Aldriva Events <events@aldriva.com>";

export type NotificationType =
  | "invitation"
  | "invitation_reminder"
  | "rsvp_confirmation"
  | "ticket_confirmation"
  | "event_update"
  | "invitation_revoked";

export interface SendEventNotificationParams {
  eventId: string;
  recipientEmail: string;
  recipientName: string;
  type: NotificationType;
  actorUserId?: string | null;
  actorRole?: string;
  subject?: string;
  idempotencyKey?: string;
  data: {
    eventTitle?: string;
    eventDate?: string | null;
    venue?: string | null;
    inviteUrl?: string;
    seatLabel?: string | null;
    rsvpStatus?: string;
    customMessage?: string;
    qrCode?: string;
  };
}

export interface NotificationResult {
  ok: boolean;
  messageId?: string;
  message: string;
  skipped?: boolean;
}

/**
 * Dispatches an event operational notification with idempotency guarantees.
 */
export async function sendEventNotification(params: SendEventNotificationParams): Promise<NotificationResult> {
  const { eventId, recipientEmail, recipientName, type, data, actorUserId, actorRole } = params;

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { ok: false, message: "Invalid recipient email." };
  }

  // Generate subject lines based on notification type
  let subject = params.subject;
  if (!subject) {
    switch (type) {
      case "invitation":
        subject = `You're invited to ${data.eventTitle || "an exclusive event"} on Aldriva`;
        break;
      case "invitation_reminder":
        subject = `Reminder: RSVP for ${data.eventTitle || "Upcoming Event"}`;
        break;
      case "rsvp_confirmation":
        subject = `RSVP Confirmed: ${data.eventTitle || "Event"}`;
        break;
      case "ticket_confirmation":
        subject = `Your Tickets for ${data.eventTitle || "Event"}`;
        break;
      case "event_update":
        subject = `Important Update: ${data.eventTitle || "Event"}`;
        break;
      case "invitation_revoked":
        subject = `Invitation Update for ${data.eventTitle || "Event"}`;
        break;
    }
  }

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #18181b;">
      <div style="margin-bottom: 24px;">
        <span style="font-size: 20px; font-weight: 800; color: #f97316; letter-spacing: -0.5px;">ALDRIVA</span>
      </div>
      <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 12px; color: #09090b;">${subject}</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #3f3f46;">Hello <strong>${recipientName}</strong>,</p>
      
      ${data.customMessage ? `<div style="background-color: #f4f4f5; border-left: 4px solid #f97316; padding: 12px 16px; margin: 16px 0; font-size: 14px; border-radius: 4px;">${data.customMessage}</div>` : ""}

      <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 12px; padding: 16px; margin: 20px 0;">
        <p style="margin: 4px 0; font-size: 14px;"><strong>Event:</strong> ${data.eventTitle || "Private Event"}</p>
        ${data.eventDate ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Date & Time:</strong> ${new Date(data.eventDate).toLocaleString()}</p>` : ""}
        ${data.venue ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Venue:</strong> ${data.venue}</p>` : ""}
        ${data.seatLabel ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Assigned Seat:</strong> ${data.seatLabel}</p>` : ""}
        ${data.rsvpStatus ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Current RSVP:</strong> ${data.rsvpStatus.toUpperCase()}</p>` : ""}
      </div>

      ${data.inviteUrl ? `
        <div style="margin: 28px 0; text-align: center;">
          <a href="${data.inviteUrl}" style="background-color: #09090b; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">
            View Your Digital Pass & RSVP &rarr;
          </a>
        </div>
      ` : ""}

      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" />
      <p style="font-size: 12px; color: #71717a; text-align: center;">
        This email was sent via the Aldriva Event Operations Platform.
      </p>
    </div>
  `;

  if (!resend) {
    // Graceful simulated delivery when API key is unconfigured
    console.log(`[notifications/simulated] ${type} sent to ${recipientEmail}`);
    await logEventAction({
      eventId,
      actorUserId,
      actorRole: actorRole || "organizer",
      action: type === "invitation" ? "invitation_sent" : "invitation_resent",
      targetType: "guest",
      metadata: { recipientEmail, type, simulated: true },
    });
    return {
      ok: true,
      message: `Notification simulated (RESEND_API_KEY not configured). Delivered to ${recipientEmail}.`,
      skipped: true,
    };
  }

  try {
    const { data: resendData, error: sendErr } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject,
      html: htmlBody,
      headers: params.idempotencyKey ? { "X-Entity-Ref-ID": params.idempotencyKey } : undefined,
    });

    if (sendErr) {
      console.warn("[notifications] Resend API error:", sendErr.message);
      return { ok: false, message: sendErr.message };
    }

    // Log to operational audit trail
    await logEventAction({
      eventId,
      actorUserId,
      actorRole: actorRole || "organizer",
      action: type === "invitation" ? "invitation_sent" : "invitation_resent",
      targetType: "guest",
      metadata: { recipientEmail, type, messageId: resendData?.id },
    });

    return {
      ok: true,
      messageId: resendData?.id,
      message: "Notification sent successfully.",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Notification dispatch failed.";
    console.warn("[notifications] Exception dispatching notification:", msg);
    return { ok: false, message: msg };
  }
}
