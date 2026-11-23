"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { mapStaffError, NOT_FOUND_OR_DENIED } from "@/lib/staff/errors";
import { validateInviteContact } from "@/lib/staff/invitation-contact";

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string; code: string };

export type CreateStaffInvitationInput = {
  email?: string | null;
  phone?: string | null;
  channel?: string | null;
  role_id?: string | null;
};

export type StaffInvitationCreated = {
  id: string;
  token: string;
  expires_at: string;
  channel: string;
  email: string | null;
  phone: string | null;
};

// Creates a pending invitation for an EXISTING staff member who has no login yet.
// branch_id always comes from the staff row (the database does not tie the two
// together). Role escalation and privileged-role rules are enforced by the
// staff_invitations BEFORE INSERT triggers; the database is the real gate.
export async function createStaffInvitation(
  businessId: string,
  staffMemberId: string,
  input: CreateStaffInvitationInput
): Promise<ActionResult<StaffInvitationCreated>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();

  // RLS client: a row the caller cannot reach comes back empty (proves reach).
  const { data: staff, error: staffError } = await supabase
    .from("staff_members")
    .select("id, business_id, branch_id, auth_user_id, status, email, phone")
    .eq("id", staffMemberId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (staffError) {
    const mapped = mapStaffError(staffError);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  if (!staff) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }
  if (staff.auth_user_id) {
    return { success: false, error: "This staff member already has a login.", code: "staff_already_linked" };
  }
  if (staff.status === "deactivated") {
    return { success: false, error: "This staff member is deactivated.", code: "staff_deactivated" };
  }

  // Fall back to the staff record's own contact details when the form leaves them blank.
  const contact = validateInviteContact({
    email: input.email || staff.email,
    phone: input.phone || staff.phone,
    channel: input.channel,
  });
  if (!contact.ok) return { success: false, error: contact.error.message, code: contact.error.code };

  // The token is generated here and only its SHA-256 (hex of the lowercase uuid)
  // is stored. The plaintext is returned to the caller once and never saved.
  const token = randomUUID();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

  const insertInvitation = () =>
    supabase
      .from("staff_invitations")
      .insert({
        business_id: businessId,
        branch_id: staff.branch_id,
        staff_member_id: staff.id,
        email: contact.value.email,
        phone: contact.value.phone,
        delivery_channel: contact.value.channel,
        role_id: input.role_id || null,
        invited_by: auth.userId,
        status: "pending",
        token_hash: tokenHash,
      })
      .select("id, expires_at, delivery_channel, email, phone")
      .single();

  let result = await insertInvitation();

  // 23505: this person already has a pending invitation (one-pending index).
  // Revoke the older pending invitation(s) through the database function, then
  // retry once. Any other failure (for example a refused role) revokes nothing.
  if (result.error && result.error.code === "23505") {
    const { data: older, error: olderError } = await supabase
      .from("staff_invitations")
      .select("id")
      .eq("business_id", businessId)
      .eq("staff_member_id", staff.id)
      .eq("status", "pending");
    if (olderError) {
      const mapped = mapStaffError(olderError);
      return { success: false, error: mapped.message, code: mapped.code };
    }
    for (const row of older ?? []) {
      const { error: revokeError } = await supabase.rpc("revoke_staff_invitation", {
        p_invitation_id: row.id as string,
      });
      if (revokeError) {
        const mapped = mapStaffError(revokeError);
        return { success: false, error: mapped.message, code: mapped.code };
      }
    }
    result = await insertInvitation();
  }

  const { data, error } = result;

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }

  revalidatePath("/dashboard/org/[id]/staff", "page");
  return {
    success: true,
    data: {
      id: data.id as string,
      token,
      expires_at: data.expires_at as string,
      channel: (data.delivery_channel as string | null) ?? contact.value.channel,
      email: (data.email as string | null) ?? null,
      phone: (data.phone as string | null) ?? null,
    },
  };
}
