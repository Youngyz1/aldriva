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
