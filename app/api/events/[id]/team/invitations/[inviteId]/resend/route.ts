import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl } from "@/lib/site-url";
import { BRAND } from "@/config/branding";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { generateInviteToken, hashInviteToken } from "@/lib/staff/invite-tokens";
import { buildInviteWhatsAppUrl, ACCOUNTLESS_BROWSER_WARNING } from "@/lib/staff/whatsapp-invite-message";

type EmailError = "not_configured" | "provider_error" | "invalid_recipient";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const requestId = randomUUID();
  try {
    const { id: eventId, inviteId } = await params;
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
    if (!canManage) {
      return NextResponse.json(
        { error: "You do not have permission to resend invitations for this event." },
        { status: 403 }
      );
    }

    const admin = createSupabaseAdmin();

    // Fetch existing invitation
    const { data: invite, error: fetchErr } = await admin
      .from("event_team_invitations")
      .select("id, event_id, email, role, entrance_id, status, phone, is_accountless")
      .eq("id", inviteId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (fetchErr || !invite) {
      return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
    }

    // Account invitations (never account-less) keep today's guard: never
    // resend an invite that has already been consumed or revoked. Those are
    // terminal states for an account invite, and a locked invite is the
    // only non-pending state that recovers (phone-verification failures
    // reset below). Account-less invitations skip this guard entirely —
    // F1 lets them revive from ANY status via the atomic reissue RPC below.
    if (!invite.is_accountless && (invite.status === "accepted" || invite.status === "revoked")) {
      return NextResponse.json(
        { error: `This invitation has already been ${invite.status} and cannot be resent.` },
        { status: 400 }
      );
    }

    // Fetch event details
    const { data: event } = await admin
      .from("events")
      .select("id, title")
      .eq("id", eventId)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    // Generate a NEW link token (hash stored; old link dead). The
    // plaintext appears solely in the new emailed link (migration 166).
    const newToken = generateInviteToken();
    const newTokenHash = hashInviteToken(newToken);
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    if (invite.is_accountless) {
      // Revive the SAME invitation row from any terminal state (migration
      // 211, migration_211_event_staff_invitation_reissue.sql): the RPC
      // revokes every session this invitation ever minted, then resets it
      // to a fresh 'pending' row with the new token hash and expiry, all in
      // one transaction. Returns zero rows if the invitation is no longer
      // account-less, belongs to a different event, or was deleted.
      const { data: rpcRows, error: rpcError } = await admin.rpc("reissue_event_staff_invitation", {
        p_event_id: eventId,
        p_invitation_id: inviteId,
        p_token_hash: newTokenHash,
        p_expires_at: newExpiresAt,
      });

      if (rpcError) {
        console.error("[events/[id]/team/invitations/resend] reissue RPC error:", {
          requestId,
          eventId,
          inviteId,
          message: rpcError.message,
        });
        return NextResponse.json(
          { error: "Could not re-invite this staff member. Please try again." },
          { status: 500 }
        );
      }

      const reissued = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
      if (!reissued) {
        console.warn("[events/[id]/team/invitations/resend] reissue RPC returned no rows:", {
          requestId,
          eventId,
          inviteId,
        });
        return NextResponse.json(
          { error: "This invitation could not be re-invited. Refresh and try again." },
          { status: 409 }
        );
      }
    } else {
      // Account invitations keep the existing direct-update path,
      // byte-for-byte: conditional on the status already read above, so a
      // race between the read and this write leaves the row untouched
      // rather than silently reviving a terminal invitation.
      const { data: updatedRows, error: updateErr } = await admin
        .from("event_team_invitations")
        .update({
          token_hash: newTokenHash,
          status: "pending",
          failed_attempts: 0,
          expires_at: newExpiresAt,
          updated_at: now.toISOString(),
        })
        .eq("id", inviteId)
        .eq("status", invite.status)
        .select("id");

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      if (!updatedRows || updatedRows.length === 0) {
        return NextResponse.json(
          { error: "This invitation's status changed and can no longer be resent." },
          { status: 409 }
        );
      }
    }

    const roleLabel = invite.role === "event_manager" ? "Event Manager" : "Ticket Scanner";
    const acceptUrl = invite.is_accountless
      ? `${getSiteUrl().replace(/\/$/, "")}/events/team/redeem#token=${encodeURIComponent(newToken)}`
      : `${getSiteUrl().replace(/\/$/, "")}/events/team/accept?token=${encodeURIComponent(newToken)}`;
    // No locale signal exists for this flow (see team/invite/route.ts) -
    // the account-less browser notice is English-only for now.
    const locale: "en" | "fr" = "en";
    const whatsappUrl = buildInviteWhatsAppUrl({
      phone: invite.phone,
      eventTitle: event.title,
      acceptUrl,
      roleLabel,
      isAccountless: invite.is_accountless,
      locale,
    }) ?? undefined;

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({
        ok: true,
        emailed: false,
        emailError: "not_configured" satisfies EmailError,
        acceptUrl,
        whatsappUrl,
        message: "New invitation token generated, but email service is not configured. Share the link manually.",
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddress = `${BRAND.name} <${process.env.RESEND_FROM_EMAIL || BRAND.contactEmail}>`;
    const accountlessBrowserNotice = invite.is_accountless
      ? `<p>${escapeHtml(ACCOUNTLESS_BROWSER_WARNING[locale])}</p>`
      : "";

    const { error: sendErr } = await resend.emails.send({
      from: fromAddress,
      to: invite.email,
      subject: `Invitation Reminder: ${roleLabel} for ${event.title}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
          <h2 style="margin-bottom: 16px;">Event Team Invitation Reminder</h2>
          <p>Hello,</p>
          <p>This is a reminder of your invitation to join the event team for <strong>${escapeHtml(event.title)}</strong> as a <strong>${roleLabel}</strong>.</p>
          <p style="margin: 28px 0;">
            <a href="${acceptUrl}" style="background:#f97316;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:bold;display:inline-block;">Accept Invitation</a>
          </p>
          ${accountlessBrowserNotice}
          <p style="color:#6b7280;font-size:13px;">If you were not expecting this invitation, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (sendErr) {
      const emailError: EmailError = sendErr.name === "validation_error" ? "invalid_recipient" : "provider_error";
      console.warn("[events/[id]/team/invitations/resend] Resend error:", { requestId: inviteId, name: sendErr.name, message: sendErr.message });
      return NextResponse.json({
        ok: true,
        emailed: false,
        emailError,
        acceptUrl,
        whatsappUrl,
        message: `New invitation token generated. Email could not be sent: ${sendErr.message}`,
      });
    }

    return NextResponse.json({ ok: true, emailed: true, acceptUrl, whatsappUrl });
  } catch (err: unknown) {
    console.error("[events/[id]/team/invitations/resend]", err);
    return NextResponse.json({ error: "Could not resend the invitation. Please try again." }, { status: 500 });
  }
}
