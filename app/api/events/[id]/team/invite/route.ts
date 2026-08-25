import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl } from "@/lib/site-url";
import { BRAND } from "@/config/branding";
import { hasEventOrOrganizerAccess, EventTeamRole } from "@/lib/event-auth";

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;

    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    // Must be event organizer or event_manager to invite staff
    const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
    if (!canManage) {
      return NextResponse.json(
        { error: "You do not have permission to invite team members to this event." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const email = body.email?.trim().toLowerCase();
    const role = body.role as EventTeamRole;
    const entranceId = body.entranceId || null;

    if (!email || !role) {
      return NextResponse.json(
        { error: "Email and role are required." },
        { status: 400 }
      );
    }

    if (!["event_manager", "ticket_scanner"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role specified. Must be 'event_manager' or 'ticket_scanner'." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const roleLabel = role === "event_manager" ? "Event Manager" : "Ticket Scanner";

    // Check 1: Is this email already an active team member for this event?
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (existingProfile) {
      const { data: activeMember } = await admin
        .from("event_team_members")
        .select("id, role")
        .eq("event_id", eventId)
        .eq("user_id", existingProfile.id)
        .eq("status", "active")
        .maybeSingle();

      if (activeMember) {
        if (activeMember.role !== role) {
          // Update active member role
          await admin
            .from("event_team_members")
            .update({ role, updated_at: new Date().toISOString() })
            .eq("id", activeMember.id);

          return NextResponse.json({
            ok: true,
            updated: true,
            emailed: false,
            message: `${email}'s role updated to ${roleLabel}.`,
          });
        }

        return NextResponse.json({
          ok: true,
          updated: false,
          emailed: false,
          message: `${email} is already an active ${roleLabel} for this event.`,
        });
      }
    }

    // Check 2: Does a pending invitation already exist for this email and event?
    const { data: existingInvite } = await admin
      .from("event_team_invitations")
      .select("id")
      .eq("event_id", eventId)
      .ilike("email", email)
      .eq("status", "pending")
      .maybeSingle();

    // Fetch event title
    const { data: event } = await admin
      .from("events")
      .select("id, title")
      .eq("id", eventId)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    // Generate 64-char hex token
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    let inviteId = existingInvite?.id;
    const isUpdate = Boolean(existingInvite);

    if (existingInvite) {
      // Reuse existing pending invitation: update token, role, and expiration date
      const { error: updateError } = await admin
        .from("event_team_invitations")
        .update({
          role,
          token,
          expires_at: expiresAt,
          invited_by: user.id,
          updated_at: now.toISOString(),
        })
        .eq("id", existingInvite.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      // Create new pending invitation row
      const { data: invite, error: insertError } = await admin
        .from("event_team_invitations")
        .insert({
          event_id: eventId,
          email,
          role,
          entrance_id: entranceId,
          invited_by: user.id,
          token,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      inviteId = invite.id;
    }

    const acceptUrl = `${getSiteUrl().replace(/\/$/, "")}/events/team/accept?token=${token}`;

    const defaultMsg = isUpdate
      ? `Existing pending invitation for ${email} updated to ${roleLabel}.`
      : `Invitation created for ${email}.`;

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({
        ok: true,
        updated: isUpdate,
        emailed: false,
        acceptUrl,
        message: `${defaultMsg} Share the link manually below.`,
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddress = `${BRAND.name} <${process.env.RESEND_FROM_EMAIL || BRAND.contactEmail}>`;

    await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: `You've been invited as a ${roleLabel} for ${event.title}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
          <h2 style="margin-bottom: 16px;">Event Team Invitation</h2>
          <p>Hello,</p>
          <p>You have been invited to join the event team for <strong>${escapeHtml(event.title)}</strong> as a <strong>${roleLabel}</strong>.</p>
          <p style="margin: 28px 0;">
            <a href="${acceptUrl}" style="background:#f97316;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:bold;display:inline-block;">Accept Invitation</a>
          </p>
          <p style="color:#6b7280;font-size:13px;">If you were not expecting this invitation, you can safely ignore this email.</p>
        </div>
      `,
    });

    return NextResponse.json({
      ok: true,
      updated: isUpdate,
      emailed: true,
      invitationId: inviteId,
      message: defaultMsg,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
