"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { mapStaffError, NOT_FOUND_OR_DENIED } from "@/lib/staff/errors";

type Db = Awaited<ReturnType<typeof createSupabaseServer>>;

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string; code: string };

export type BookingStaffAssignment = {
  id: string;
  staff_member_id: string;
  staff_name: string;
  role_id: string | null;
  role_name: string | null;
  status: string;
  notes: string | null;
};

export type AssignableStaffMember = {
  id: string;
  full_name: string;
  roles: { id: string; name: string }[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Resolved =
  | { ok: true; businessId: string; userId: string }
  | { ok: false; result: { success: false; error: string; code: string } };

// The booking is read with the RLS client. The business id always comes from the
// database row, never from the browser. The 262 policies and triggers are the real gate.
async function resolveBooking(db: Db, organizerId: string, bookingId: string): Promise<Resolved> {
  const denied = {
    ok: false as const,
    result: { success: false as const, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code },
  };
  if (!UUID_RE.test(organizerId) || !UUID_RE.test(bookingId)) return denied;

  const { data: booking, error } = await db
    .from("rental_bookings")
    .select("id, business_id")
    .eq("id", bookingId)
    .eq("organizer_id", organizerId)
    .maybeSingle();
  if (error) {
    const mapped = mapStaffError(error);
    return { ok: false, result: { success: false, error: mapped.message, code: mapped.code } };
  }
  if (!booking) return denied;

  const businessId = booking.business_id as string;
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { ok: false, result: { success: false, error: auth.error, code: "not_allowed" } };
  return { ok: true, businessId, userId: auth.userId };
}

export async function listBookingStaffAssignments(
  organizerId: string,
  bookingId: string
): Promise<ActionResult<BookingStaffAssignment[]>> {
  const db = await createSupabaseServer();
  const r = await resolveBooking(db, organizerId, bookingId);
  if (!r.ok) return r.result;

  const { data: rows, error } = await db
    .from("staff_assignments")
    .select("id, staff_member_id, role_id, status, notes, assigned_at")
    .eq("business_id", r.businessId)
    .eq("subject_type", "rental_booking")
    .eq("subject_id", bookingId)
    .order("assigned_at", { ascending: true });
  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const list = rows ?? [];
  if (list.length === 0) return { success: true, data: [] };

  const staffIds = Array.from(new Set(list.map((x) => x.staff_member_id as string)));
  const roleIds = Array.from(new Set(list.map((x) => x.role_id as string | null).filter((x): x is string => !!x)));

  const { data: people, error: peopleError } = await db
    .from("staff_members")
    .select("id, full_name")
    .eq("business_id", r.businessId)
    .in("id", staffIds);
  if (peopleError) {
    const mapped = mapStaffError(peopleError);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const nameById = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));

  const roleNameById = new Map<string, string>();
  if (roleIds.length > 0) {
    const { data: roles, error: rolesError } = await db.from("staff_roles").select("id, name").in("id", roleIds);
    if (rolesError) {
      const mapped = mapStaffError(rolesError);
      return { success: false, error: mapped.message, code: mapped.code };
    }
    for (const role of roles ?? []) roleNameById.set(role.id as string, role.name as string);
  }

  return {
    success: true,
    data: list.map((x) => ({
      id: x.id as string,
      staff_member_id: x.staff_member_id as string,
      staff_name: nameById.get(x.staff_member_id as string) ?? "Unknown",
      role_id: (x.role_id as string | null) ?? null,
      role_name: x.role_id ? roleNameById.get(x.role_id as string) ?? null : null,
      status: x.status as string,
      notes: (x.notes as string | null) ?? null,
    })),
  };
}

// Active staff of the booking's business with the active business roles each holds.
// Platform roles are left out: migration 262 refuses them as an assignment label.
export async function listAssignableStaff(
  organizerId: string,
  bookingId: string
): Promise<ActionResult<AssignableStaffMember[]>> {
  const db = await createSupabaseServer();
  const r = await resolveBooking(db, organizerId, bookingId);
  if (!r.ok) return r.result;

  const { data: people, error } = await db
    .from("staff_members")
    .select("id, full_name")
    .eq("business_id", r.businessId)
    .eq("status", "active")
    .order("full_name", { ascending: true });
  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const staff = people ?? [];
  if (staff.length === 0) return { success: true, data: [] };

  const { data: held, error: heldError } = await db
    .from("staff_member_roles")
    .select("staff_member_id, role_id")
    .eq("business_id", r.businessId)
    .eq("is_active", true)
    .in("staff_member_id", staff.map((s) => s.id as string));
  if (heldError) {
    const mapped = mapStaffError(heldError);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const roleIds = Array.from(new Set((held ?? []).map((h) => h.role_id as string)));

  const roleNameById = new Map<string, string>();
  if (roleIds.length > 0) {
    const { data: roles, error: rolesError } = await db
      .from("staff_roles")
      .select("id, name")
      .eq("business_id", r.businessId)
      .eq("role_scope", "business")
      .eq("is_active", true)
      .in("id", roleIds);
    if (rolesError) {
      const mapped = mapStaffError(rolesError);
      return { success: false, error: mapped.message, code: mapped.code };
    }
    for (const role of roles ?? []) roleNameById.set(role.id as string, role.name as string);
  }

  return {
    success: true,
    data: staff.map((s) => ({
      id: s.id as string,
      full_name: s.full_name as string,
      roles: (held ?? [])
        .filter((h) => h.staff_member_id === s.id && roleNameById.has(h.role_id as string))
        .map((h) => ({ id: h.role_id as string, name: roleNameById.get(h.role_id as string) as string })),
    })),
  };
}

export async function assignStaffToBooking(
  organizerId: string,
  bookingId: string,
  staffMemberId: string,
  roleId: string | null
): Promise<ActionResult<{ id: string }>> {
  const db = await createSupabaseServer();
  const r = await resolveBooking(db, organizerId, bookingId);
  if (!r.ok) return r.result;
  if (!UUID_RE.test(staffMemberId) || (roleId && !UUID_RE.test(roleId))) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }

  const { data, error } = await db
    .from("staff_assignments")
    .insert({
      business_id: r.businessId,
      staff_member_id: staffMemberId,
      subject_type: "rental_booking",
      subject_id: bookingId,
      role_id: roleId || null,
      status: "assigned",
      assigned_by: r.userId,
    })
    .select("id")
    .single();
  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }

  revalidatePath("/dashboard/org/[id]/rentals/[bookingId]", "page");
  return { success: true, data: { id: data.id as string } };
}

export async function unassignStaffFromBooking(
  organizerId: string,
  bookingId: string,
  assignmentId: string
): Promise<ActionResult<{ id: string }>> {
  const db = await createSupabaseServer();
  const r = await resolveBooking(db, organizerId, bookingId);
  if (!r.ok) return r.result;
  if (!UUID_RE.test(assignmentId)) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }

  const { data, error } = await db
    .from("staff_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("business_id", r.businessId)
    .eq("subject_type", "rental_booking")
    .eq("subject_id", bookingId)
    .select("id");
  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  // RLS gotcha: a delete excluded by a USING clause returns zero rows, not an error.
  if (!data || data.length === 0) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }

  revalidatePath("/dashboard/org/[id]/rentals/[bookingId]", "page");
  return { success: true, data: { id: assignmentId } };
}