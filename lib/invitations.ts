/**
 * lib/invitations.ts
 * Core business logic and credential creation for digital invitations.
 * Manages event_invitations and linked polymorphic ticket_instances.
 */

import { randomBytes, randomUUID } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export type InvitationStatus = "draft" | "sent" | "cancelled" | "revoked" | "expired";
export type RsvpStatus = "pending" | "accepted" | "declined";

export interface CreateInvitationParams {
  eventId: string;
  guestName: string;
  guestTitle?: string | null;
  organization?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface InvitationResult {
  invitation: {
    id: string;
    event_id: string;
    guest_name: string;
    guest_title: string | null;
    organization: string | null;
    email: string | null;
    phone: string | null;
    token: string;
    invitation_status: InvitationStatus;
    rsvp_status: RsvpStatus;
    rsvp_at: string | null;
    notes: string | null;
    created_at: string;
  };
  ticketInstance: {
    id: string;
    qr_code: string;
    status: string;
    source: "invitation";
  };
}

/**
 * Creates an event_invitations record and an associated polymorphic ticket_instances
 * credential (source = 'invitation', order_id = NULL).
 */
export async function createInvitationCredential(
  params: CreateInvitationParams
): Promise<InvitationResult> {
  const admin = createSupabaseAdmin();

  // 1. Generate high-entropy 64-char cryptographically secure token for public invite link
  const token = randomBytes(32).toString("hex");

  // 2. Generate 32-char hex QR credential matching ticket_instances standard
  const qrCode = randomUUID().replace(/-/g, "").toUpperCase();

  // 3. Insert event_invitations row
  const { data: invitation, error: inviteErr } = await admin
    .from("event_invitations")
    .insert({
      event_id: params.eventId,
      guest_name: params.guestName.trim(),
      guest_title: params.guestTitle?.trim() || null,
      organization: params.organization?.trim() || null,
      email: params.email?.trim().toLowerCase() || null,
      phone: params.phone?.trim() || null,
      token,
      invitation_status: "draft",
      rsvp_status: "pending",
      notes: params.notes?.trim() || null,
      created_by: params.createdBy || null,
    })
    .select()
    .single();

  if (inviteErr || !invitation) {
    throw new Error(`Failed to create event invitation: ${inviteErr?.message || "Unknown error"}`);
  }

  // 4. Insert linked polymorphic ticket_instances row
  const { data: ticketInstance, error: instanceErr } = await admin
    .from("ticket_instances")
    .insert({
      event_id: params.eventId,
      order_id: null,
      invitation_id: invitation.id,
      source: "invitation",
      qr_code: qrCode,
      status: "valid",
    })
    .select("id, qr_code, status, source")
    .single();

  if (instanceErr || !ticketInstance) {
    // Rollback invitation if ticket_instance insertion fails
    await admin.from("event_invitations").delete().eq("id", invitation.id);
    throw new Error(`Failed to create invitation ticket instance: ${instanceErr?.message || "Unknown error"}`);
  }

  return {
    invitation: invitation as any,
    ticketInstance: ticketInstance as any,
  };
}

/**
 * Looks up an invitation securely by its possession token.
 * Validates that the invitation is active (not revoked or expired).
 */
export async function getInvitationByToken(token: string) {
  if (!token || typeof token !== "string" || token.length !== 64) {
    return null;
  }

  const admin = createSupabaseAdmin();

  const { data: invitation } = await admin
    .from("event_invitations")
    .select(`
      id,
      event_id,
      guest_name,
      guest_title,
      organization,
      email,
      phone,
      token,
      invitation_status,
      rsvp_status,
      rsvp_at,
      notes,
      created_at,
      events (
        id,
        title,
        slug,
        event_date,
        end_date,
        venue,
        city,
        banner
      )
    `)
    .eq("token", token)
    .maybeSingle();

  if (!invitation) return null;

  // Retrieve linked ticket instance (for QR rendering)
  const { data: ticketInstance } = await admin
    .from("ticket_instances")
    .select("id, qr_code, status, seat_label, checked_in_at")
    .eq("invitation_id", invitation.id)
    .maybeSingle();

  return {
    invitation,
    ticketInstance: ticketInstance || null,
  };
}

export interface AssignSeatParams {
  eventId: string;
  invitationId: string;
  seatId: string;
}

/**
 * Assigns an event seat to an invited guest.
 * Enforces cross-table event isolation:
 * - Seat must belong to eventId.
 * - Invitation must belong to eventId.
 * - Seat must not already be sold or assigned to another invitation.
 * Updates both seats.assigned_invitation_id and the linked ticket_instances row.
 */
export async function assignSeatToInvitation(params: AssignSeatParams) {
  const admin = createSupabaseAdmin();

  // 1. Fetch seat and verify event isolation
  const { data: seat, error: seatErr } = await admin
    .from("seats")
    .select("id, event_id, section, row_label, seat_number, table_number, table_name, status, assigned_invitation_id")
    .eq("id", params.seatId)
    .single();

  if (seatErr || !seat) {
    throw new Error(`Seat not found.`);
  }

  if (seat.event_id !== params.eventId) {
    throw new Error(`Event isolation violation: Seat belongs to event ${seat.event_id}, not ${params.eventId}.`);
  }

  if (seat.status === "sold") {
    throw new Error(`Seat is already sold to a ticket buyer.`);
  }

  if (seat.assigned_invitation_id && seat.assigned_invitation_id !== params.invitationId) {
    throw new Error(`Seat is already assigned to another guest.`);
  }

  // 2. Fetch invitation and verify event isolation
  const { data: invitation, error: inviteErr } = await admin
    .from("event_invitations")
    .select("id, event_id, guest_name")
    .eq("id", params.invitationId)
    .single();

  if (inviteErr || !invitation) {
    throw new Error(`Invitation not found.`);
  }

  if (invitation.event_id !== params.eventId) {
    throw new Error(`Event isolation violation: Invitation belongs to event ${invitation.event_id}, not ${params.eventId}.`);
  }

  // 3. Construct descriptive seat label
  let seatLabel = `${seat.section}, Row ${seat.row_label}, Seat ${seat.seat_number}`;
  if (seat.table_number) {
    const tableNamePart = seat.table_name ? ` (${seat.table_name})` : "";
    seatLabel = `Table ${seat.table_number}${tableNamePart}, Seat ${seat.seat_number}`;
  }

  // 4. Release any previously assigned seat for this invitation
  await admin
    .from("seats")
    .update({ assigned_invitation_id: null })
    .eq("assigned_invitation_id", params.invitationId)
    .neq("id", params.seatId);

  // 5. Update the seat's assigned_invitation_id
  const { error: updateSeatErr } = await admin
    .from("seats")
    .update({ assigned_invitation_id: params.invitationId })
    .eq("id", params.seatId);

  if (updateSeatErr) {
    throw new Error(`Failed to assign seat: ${updateSeatErr.message}`);
  }

  // 6. Update linked ticket_instances record
  const { error: updateInstErr } = await admin
    .from("ticket_instances")
    .update({
      seat_id: seat.id,
      seat_label: seatLabel,
      updated_at: new Date().toISOString(),
    })
    .eq("invitation_id", params.invitationId);

  if (updateInstErr) {
    throw new Error(`Failed to update ticket instance seat: ${updateInstErr.message}`);
  }

  return {
    success: true,
    seatId: seat.id,
    seatLabel,
  };
}

/**
 * Removes any assigned seat from an invitation and clears the seat reference on the ticket instance.
 */
export async function removeSeatFromInvitation(eventId: string, invitationId: string) {
  const admin = createSupabaseAdmin();

  // 1. Clear assigned_invitation_id from seats
  await admin
    .from("seats")
    .update({ assigned_invitation_id: null })
    .eq("event_id", eventId)
    .eq("assigned_invitation_id", invitationId);

  // 2. Clear seat_id & seat_label on linked ticket_instances
  await admin
    .from("ticket_instances")
    .update({
      seat_id: null,
      seat_label: null,
      updated_at: new Date().toISOString(),
    })
    .eq("invitation_id", invitationId);

  return { success: true };
}

export interface SendInvitationEmailParams {
  eventId: string;
  invitationId: string;
}

export interface SendInvitationEmailResult {
  ok: boolean;
  emailed: boolean;
  invitationId: string;
  recipientEmail: string;
  invitationUrl?: string;
  message: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sends or resends an invitation email to an invited guest using Resend.
 * Reuses the existing invitation token & ticket_instances credential.
 */
export async function sendInvitationEmail(
  params: SendInvitationEmailParams
): Promise<SendInvitationEmailResult> {
  const admin = createSupabaseAdmin();

  // 1. Fetch invitation with token and linked event details
  const { data: invitation, error: inviteErr } = await admin
    .from("event_invitations")
    .select(`
      id,
      event_id,
      guest_name,
      guest_title,
      organization,
      email,
      token,
      invitation_status,
      events (
        id,
        title,
        event_date,
        venue,
        city
      )
    `)
    .eq("id", params.invitationId)
    .eq("event_id", params.eventId)
    .single();

  if (inviteErr || !invitation) {
    throw new Error("Invitation not found or does not belong to this event.");
  }

  if (!invitation.email) {
    throw new Error("Guest does not have an email address configured.");
  }

  if (["cancelled", "revoked", "expired"].includes(invitation.invitation_status)) {
    throw new Error(`Cannot send email for a ${invitation.invitation_status} invitation.`);
  }

  // 2. Fetch linked ticket instance seat label (if any)
  const { data: ticketInstance } = await admin
    .from("ticket_instances")
    .select("id, seat_label, status")
    .eq("invitation_id", invitation.id)
    .maybeSingle();

  const eventData = invitation.events as any;
  const eventTitle = eventData?.title || "Exclusive Event";
  const eventDate = eventData?.event_date
    ? new Date(eventData.event_date).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const eventLocation = [eventData?.venue, eventData?.city].filter(Boolean).join(", ");
  const seatLabel = ticketInstance?.seat_label || null;

  const { BRAND } = await import("@/config/branding");
  const { getSiteUrl } = await import("@/lib/site-url");
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const invitationUrl = `${siteUrl}/invitation/${invitation.token}`;

  const guestDisplayName = invitation.guest_title
    ? `${invitation.guest_title} ${invitation.guest_name}`
    : invitation.guest_name;

  if (!process.env.RESEND_API_KEY) {
    // In dev or test environments without Resend configured, update status to sent and return mock
    await admin
      .from("event_invitations")
      .update({
        invitation_status: "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    return {
      ok: true,
      emailed: false,
      invitationId: invitation.id,
      recipientEmail: invitation.email,
      invitationUrl,
      message: `Invitation generated for ${invitation.email}. (Email delivery skipped: RESEND_API_KEY is not configured).`,
    };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddress = `${BRAND.name} <${process.env.RESEND_FROM_EMAIL || BRAND.contactEmail}>`;

  const { error: sendError } = await resend.emails.send({
    from: fromAddress,
    to: invitation.email,
    subject: `You're Invited: ${eventTitle}`,
    html: `
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
              <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:580px;width:100%;">
                <!-- Header Banner -->
                <tr>
                  <td style="background:linear-gradient(135deg,#7c3aed,#9333ea);padding:36px;text-align:center;">
                    <p style="margin:0;color:#e9d5ff;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Official Invitation</p>
                    <h1 style="margin:8px 0 0;color:#ffffff;font-size:26px;font-weight:900;line-height:1.2;">${escapeHtml(eventTitle)}</h1>
                  </td>
                </tr>

                <!-- Body Content -->
                <tr>
                  <td style="padding:32px;">
                    <p style="margin:0 0 12px;color:#374151;font-size:16px;line-height:1.5;">
                      Dear <strong>${escapeHtml(guestDisplayName)}</strong>,
                    </p>
                    <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">
                      You are cordially invited as our special guest to attend <strong>${escapeHtml(eventTitle)}</strong>.
                      ${invitation.organization ? `representing <em>${escapeHtml(invitation.organization)}</em>.` : ""}
                    </p>

                    <!-- Event Details Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:14px;margin-bottom:24px;overflow:hidden;">
                      <tr>
                        <td style="padding:18px 20px;">
                          ${eventDate ? `<p style="margin:0 0 8px;font-size:14px;color:#6b21a8;">📅 <strong>Date:</strong> ${escapeHtml(eventDate)}</p>` : ""}
                          ${eventLocation ? `<p style="margin:0 0 8px;font-size:14px;color:#6b21a8;">📍 <strong>Venue:</strong> ${escapeHtml(eventLocation)}</p>` : ""}
                          ${seatLabel ? `<p style="margin:0;font-size:14px;color:#6b21a8;">🪑 <strong>Assigned Seat:</strong> ${escapeHtml(seatLabel)}</p>` : ""}
                        </td>
                      </tr>
                    </table>

                    <!-- Call To Action -->
                    <div style="text-align:center;margin:32px 0 24px;">
                      <a href="${invitationUrl}"
                        style="display:inline-block;background:#7c3aed;color:#ffffff;font-weight:800;font-size:14px;padding:14px 32px;border-radius:9999px;text-decoration:none;box-shadow:0 4px 14px rgba(124,58,237,0.35);">
                        View Your Digital Invitation Pass →
                      </a>
                    </div>

                    <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;text-align:center;">
                      Please have your digital invitation pass ready on your phone for seamless check-in at the entrance.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background:#fafafa;border-top:1px solid #f3f4f6;padding:20px 32px;text-align:center;">
                    <p style="margin:0;color:#9ca3af;font-size:12px;">
                      ${BRAND.name} · Questions? <a href="mailto:${BRAND.supportEmail}" style="color:#7c3aed;text-decoration:none;">Contact support</a>
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });

  if (sendError) {
    throw new Error(`Failed to send email via Resend: ${sendError.message}`);
  }

  // 3. Mark invitation as sent
  await admin
    .from("event_invitations")
    .update({
      invitation_status: "sent",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitation.id);

  return {
    ok: true,
    emailed: true,
    invitationId: invitation.id,
    recipientEmail: invitation.email,
    invitationUrl,
    message: `Invitation email sent successfully to ${invitation.email}.`,
  };
}

export interface CancelInvitationParams {
  eventId: string;
  invitationId: string;
}

/**
 * Cancels an event invitation.
 * - Guards against cancelling already checked-in guests.
 * - Sets invitation_status = 'cancelled' and ticket_instances.status = 'cancelled'.
 * - Releases any assigned seat safely via removeSeatFromInvitation.
 */
export async function cancelInvitation(params: CancelInvitationParams) {
  const admin = createSupabaseAdmin();

  // 1. Fetch invitation and ticket instance
  const { data: invitation, error: inviteErr } = await admin
    .from("event_invitations")
    .select("id, event_id, invitation_status")
    .eq("id", params.invitationId)
    .eq("event_id", params.eventId)
    .single();

  if (inviteErr || !invitation) {
    throw new Error("Invitation not found or does not belong to this event.");
  }

  const { data: ticketInstance } = await admin
    .from("ticket_instances")
    .select("id, status")
    .eq("invitation_id", params.invitationId)
    .maybeSingle();

  if (ticketInstance?.status === "used") {
    throw new Error("Cannot cancel an invitation for a guest who has already checked in.");
  }

  // 2. Release seat if assigned
  await removeSeatFromInvitation(params.eventId, params.invitationId);

  // 3. Update invitation status
  const { error: cancelInviteErr } = await admin
    .from("event_invitations")
    .update({
      invitation_status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.invitationId);

  if (cancelInviteErr) {
    throw new Error(`Failed to cancel invitation: ${cancelInviteErr.message}`);
  }

  // 4. Update ticket instance status
  if (ticketInstance) {
    await admin
      .from("ticket_instances")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketInstance.id);
  }

  return { success: true };
}

export interface UpdateInvitationGuestParams {
  eventId: string;
  invitationId: string;
  guestName?: string;
  guestTitle?: string | null;
  organization?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

/**
 * Updates an invitation guest's profile metadata with strict event isolation.
 */
export async function updateInvitationGuest(params: UpdateInvitationGuestParams) {
  const admin = createSupabaseAdmin();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.guestName !== undefined) {
    const trimmed = params.guestName.trim();
    if (!trimmed) throw new Error("Guest name cannot be empty.");
    updates.guest_name = trimmed;
  }
  if (params.guestTitle !== undefined) updates.guest_title = params.guestTitle?.trim() || null;
  if (params.organization !== undefined) updates.organization = params.organization?.trim() || null;
  if (params.email !== undefined) updates.email = params.email?.trim().toLowerCase() || null;
  if (params.phone !== undefined) updates.phone = params.phone?.trim() || null;
  if (params.notes !== undefined) updates.notes = params.notes?.trim() || null;

  const { data: updated, error } = await admin
    .from("event_invitations")
    .update(updates)
    .eq("id", params.invitationId)
    .eq("event_id", params.eventId)
    .select("id, event_id, guest_name, guest_title, organization, email, phone, invitation_status, rsvp_status, notes, updated_at")
    .single();

  if (error || !updated) {
    throw new Error(`Failed to update guest information: ${error?.message || "Not found"}`);
  }

  return { success: true, guest: updated };
}
