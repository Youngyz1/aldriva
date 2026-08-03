import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { BRAND } from "@/config/branding";

// Service role: bypasses RLS — notifications are only ever server-inserted.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type NotificationType =
  | "donation"
  | "comment"
  | "like"
  | "fundraiser_approved"
  | "fundraiser_rejected"
  | "follow"
  | "ticket_purchase";

export type NotificationRelatedType = "fundraiser" | "comment" | "event" | "profile" | "organizer";

interface NotificationEmail {
  to: string;
  subject: string;
  html: string;
}

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  actorId?: string | null;
  relatedType?: NotificationRelatedType | null;
  relatedId?: string | null;
  /** Pass to also send a transactional email alongside the in-app row. Sent once, here. */
  email?: NotificationEmail | null;
}

/**
 * Single entry point for creating a notification: inserts the in-app row (which
 * Realtime pushes to the recipient's bell) and, if `email` is supplied, sends it
 * via Resend in the same call — callers should never send email separately.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: params.userId,
    actor_id: params.actorId ?? null,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    link: params.link ?? null,
    related_type: params.relatedType ?? null,
    related_id: params.relatedId ?? null,
  });

  if (error) {
    console.error(`[notifications] Failed to create "${params.type}" notification:`, error.message);
  }

  // Never send the email for a notification that failed to write — the two
  // must stay in sync, otherwise a user gets an email with no bell entry.
  if (params.email && !error) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: `${BRAND.name} <${BRAND.contactEmail}>`,
        to: params.email.to,
        subject: params.email.subject,
        html: params.email.html,
      });
    } catch (err) {
      console.error(`[notifications] Failed to send "${params.type}" email:`, err);
    }
  }
}
