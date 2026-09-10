import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl } from "@/lib/site-url";
import { BRAND } from "@/config/branding";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";

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

    // Fetch existing pending invitation
    const { data: invite, error: fetchErr } = await admin
      .from("event_team_invitations")
      .select("id, event_id, email, role, entrance_id, status")
      .eq("id", inviteId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (fetchErr || !invite) {
      return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
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

    // Generate NEW 64-char token (completely overwrites old token column, rendering old link dead)
    const newToken = randomBytes(32).toString("hex");
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await admin
      .from("event_team_invitations")
      .update({
        token: newToken,
        status: "pending",
        expires_at: newExpiresAt,
        updated_at: now.toISOString(),
      })
      .eq("id", inviteId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const acceptUrl = `${getSiteUrl().replace(/\/$/, "")}/events/team/accept?token=${newToken}`;

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({
        ok: true,
        emailed: false,
        acceptUrl,
        message: "New invitation token generated, but email service is not configured. Share the link manually.",
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddress = `${BRAND.name} <${process.env.RESEND_FROM_EMAIL || BRAND.contactEmail}>`;
    const roleLabel = invite.role === "event_manager" ? "Event Manager" : "Ticket Scanner";

    await resend.emails.send({
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
          <p style="color:#6b7280;font-size:13px;">If you were not expecting this invitation, you can safely ignore this email.</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, emailed: true, acceptUrl });
  } catch (err: unknown) {
    console.error("[events/[id]/team/invitations/resend]", err);
    return NextResponse.json({ error: "Could not resend the invitation. Please try again." }, { status: 500 });
  }
}
