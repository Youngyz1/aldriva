import "server-only";
/**
 * lib/memories/retention-email.ts
 *
 * Retention notice delivery — Round 4. DRAFT COPY — NOT owner-approved.
 * Follows the sendInvitationEmail pattern (lib/invitations.ts): Resend,
 * BRAND identity, 580px table card, event-detail box, single CTA, support
 * footer. Header is solid brand orange per the design system (no gradient
 * on interactive elements).
 *
 * Delivery runs ONLY from the live retention job with
 * ENABLE_MEMORY_RETENTION_DELETE=1 (currently unset everywhere, so this
 * code path is inert). Callers record the notice row only when this
 * returns { ok: true }.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { BRAND } from "@/config/branding";

export type RetentionNoticeKind = "30d" | "7d";

export interface RetentionNoticeContent {
  organizerName: string | null;
  organizerEmail: string;
  eventTitle: string;
  endedOn: string | null;
  cutoffDate: string;
  photoCount: number;
  daysLeft: 30 | 7;
  memoriesUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildRetentionNoticeSubject(content: Pick<RetentionNoticeContent, "eventTitle" | "daysLeft">): string {
  return `Your "${content.eventTitle}" photos will be deleted in ${content.daysLeft} days — download them now`;
}

/** Plain-text mirror of the HTML notice (same facts, same CTA URL). */
export function buildRetentionNoticeText(content: RetentionNoticeContent): string {
  const greeting = content.organizerName ? `Dear ${content.organizerName},` : "Hello,";
  const photoWord = content.photoCount === 1 ? "photo" : "photos";
  const lines = [
    `${greeting}`,
    ``,
    `Event memories for "${content.eventTitle}"${content.endedOn ? ` (ended ${content.endedOn})` : ""} are scheduled for permanent deletion on ${content.cutoffDate} under our 12-month photo retention policy.`,
    ``,
    `${content.photoCount} ${photoWord} will be removed. ${content.daysLeft} days left to download.`,
    ``,
    `Download your photos: ${content.memoriesUrl}`,
    ``,
    `Deleted photos cannot be recovered. If you need them longer, download the ZIP before ${content.cutoffDate}.`,
    ``,
    `${BRAND.name} · Questions? Contact support: ${BRAND.supportEmail}`,
  ];
  return lines.join("\n");
}

export function buildRetentionNoticeHtml(content: RetentionNoticeContent): string {
  const greeting = content.organizerName ? `Dear ${escapeHtml(content.organizerName)},` : "Hello,";
  const photoWord = content.photoCount === 1 ? "photo" : "photos";
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
          <tr>
            <td align="center">
              <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:580px;width:100%;">
                <tr>
                  <td style="background:#c2410c;padding:28px 32px;text-align:center;">
                    <p style="margin:0;color:#ffedd5;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Photo retention notice</p>
                    <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:900;line-height:1.3;">Your event memories are expiring</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <p style="margin:0 0 12px;color:#374151;font-size:16px;line-height:1.5;">${greeting}</p>
                    <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">
                      Event memories for <strong>${escapeHtml(content.eventTitle)}</strong>${content.endedOn ? ` (ended ${escapeHtml(content.endedOn)})` : ""} are
                      scheduled for permanent deletion on <strong>${escapeHtml(content.cutoffDate)}</strong> under our
                      12-month photo retention policy.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e4e4e7;border-radius:12px;margin-bottom:24px;overflow:hidden;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <p style="margin:0 0 8px;font-size:14px;color:#3f3f46;">📷 <strong>${content.photoCount} ${photoWord}</strong> will be removed</p>
                          <p style="margin:0;font-size:14px;color:#3f3f46;">⏰ <strong>${content.daysLeft} days</strong> left to download</p>
                        </td>
                      </tr>
                    </table>
                    <div style="text-align:center;margin:32px 0 24px;">
                      <a href="${escapeHtml(content.memoriesUrl)}"
                        style="display:inline-block;background:#c2410c;color:#ffffff;font-weight:800;font-size:14px;padding:14px 32px;border-radius:12px;text-decoration:none;">
                        Download your photos →
                      </a>
                    </div>
                    <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;text-align:center;">
                      Deleted photos cannot be recovered. If you need them longer, download the ZIP before ${escapeHtml(content.cutoffDate)}.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#fafafa;border-top:1px solid #f3f4f6;padding:20px 32px;text-align:center;">
                    <p style="margin:0;color:#9ca3af;font-size:12px;">
                      ${escapeHtml(BRAND.name)} · Questions? <a href="mailto:${escapeHtml(BRAND.supportEmail)}" style="color:#c2410c;text-decoration:none;">Contact support</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
}

/** Resolves the notice recipient: event owner first, then organizer owner. */
export async function resolveMemoryNoticeRecipient(
  eventUserId: string | null,
  organizerId: string | null
): Promise<{ userId: string; email: string; name: string | null } | null> {
  const admin = createSupabaseAdmin();
  let organizerUserId: string | null = null;
  if (organizerId) {
    const { data: org } = await admin.from("organizers").select("user_id").eq("id", organizerId).maybeSingle();
    organizerUserId = ((org as { user_id?: string | null } | null)?.user_id ?? null) as string | null;
  }
  for (const userId of [eventUserId, organizerUserId]) {
    if (!userId) continue;
    try {
      const [{ data: authUser }, { data: profile }] = await Promise.all([
        admin.auth.admin.getUserById(userId),
        admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
      ]);
      if (authUser?.user?.email) {
        return {
          userId,
          email: authUser.user.email,
          name: ((profile as { display_name?: string | null } | null)?.display_name ?? null) as string | null,
        };
      }
    } catch {
      // Fall through to the next candidate.
    }
  }
  return null;
}

export async function sendRetentionNoticeEmail(
  content: RetentionNoticeContent
): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: "Email delivery is not configured." };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddress = `${BRAND.name} <${process.env.RESEND_FROM_EMAIL || BRAND.contactEmail}>`;
  const { error } = await resend.emails.send({
    from: fromAddress,
    to: content.organizerEmail,
    subject: buildRetentionNoticeSubject(content),
    html: buildRetentionNoticeHtml(content),
    text: buildRetentionNoticeText(content),
  });
  if (error) return { ok: false, error: `Resend rejected the notice: ${error.message}` };
  return { ok: true };
}
