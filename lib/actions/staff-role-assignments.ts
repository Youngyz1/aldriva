"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { mapStaffError, NOT_FOUND_OR_DENIED } from "@/lib/staff/errors";
import { validateRoleDetails, type RoleDetails } from "@/lib/staff/role-details-validation";
import type { PlatformRoleName } from "@/lib/actions/staff-roles";

function revalidateAssignmentPaths() {
  revalidatePath("/dashboard/org/[id]/staff", "page");
  revalidatePath("/dashboard/org/[id]/workforce", "page");
}

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string; code: string };

export type AssignableRoleRow = {
  id: string;
  name: string;
  role_scope: "platform" | "business";
  platform_role: PlatformRoleName | null;
};

export type StaffRoleAssignmentRow = {
  id: string;
  role_id: string;
  role_name: string;
  platform_role: PlatformRoleName | null;
  is_active: boolean;
  details: RoleDetails;
};

type RawAssignmentRow = {
  id: string;
  role_id: string;
  is_active: boolean;
  details: unknown;
  staff_roles: { name: string; platform_role: PlatformRoleName | null } | null;
};

function mapAssignmentRow(row: RawAssignmentRow): StaffRoleAssignmentRow {
  return {
    id: row.id,
    role_id: row.role_id,
    role_name: row.staff_roles?.name ?? "",
    platform_role: row.staff_roles?.platform_role ?? null,
    is_active: row.is_active,
    details: (row.details ?? {}) as RoleDetails,
  };
}

const ASSIGNMENT_SELECT = "id, role_id, is_active, details, staff_roles ( name, platform_role )";

/** Active roles only -- an inactive role is never offered for a new
 * assignment (matches setStaffRoleActive's 0-assignment deactivate gate:
 * nothing should be able to newly point at a role once it's deactivated). */
export async function listAssignableRoles(businessId: string): Promise<ActionResult<AssignableRoleRow[]>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const [{ data: platformRoles, error: platformError }, { data: businessRoles, error: businessError }] = await Promise.all([
    supabase.from("staff_roles").select("id, name, role_scope, platform_role").eq("role_scope", "platform").eq("is_active", true),
    supabase.from("staff_roles").select("id, name, role_scope, platform_role").eq("business_id", businessId).eq("is_active", true),
  ]);
  if (platformError || businessError) {
    console.error("[listAssignableRoles]", platformError?.message ?? businessError?.message);
    return { success: false, error: "Could not load roles. Please try again.", code: "generic_error" };
  }
  const rows = [...(platformRoles ?? []), ...(businessRoles ?? [])] as AssignableRoleRow[];
  return { success: true, data: rows };
}

export async function listStaffMemberRoleAssignments(
  staffMemberId: string,
  businessId: string
): Promise<ActionResult<StaffRoleAssignmentRow[]>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_member_roles")
    .select(ASSIGNMENT_SELECT)
    .eq("staff_member_id", staffMemberId)
    .eq("business_id", businessId)
    .eq("is_active", true);

  if (error) {
    console.error("[listStaffMemberRoleAssignments]", error.message);
    return { success: false, error: "Could not load role assignments. Please try again.", code: "generic_error" };
  }
  return { success: true, data: ((data ?? []) as unknown as RawAssignmentRow[]).map(mapAssignmentRow) };
}

/**
 * Reachability only (assertCanAccessBusinessStaffArea admits both
 * organizer-level and branch-manager/staff-scope callers) -- the real
 * authorization is RLS plus the DB's own staff_guard_privileged_role
 * trigger, which rejects a non-organizer-level actor assigning the
 * owner/admin/manager platform roles regardless of what this check allows
 * through. The UI additionally disables those options up front for a
 * branch-manager caller (lib/staff/role-permission-grouping.ts), but that
 * is a UX nicety, not the security boundary.
 */
export async function assignStaffRole(
  staffMemberId: string,
  businessId: string,
  roleId: string
): Promise<ActionResult<StaffRoleAssignmentRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_member_roles")
    .insert({ staff_member_id: staffMemberId, business_id: businessId, role_id: roleId })
    .select(ASSIGNMENT_SELECT);

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as unknown as RawAssignmentRow[];
  if (rows.length === 0) return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };

  revalidateAssignmentPaths();
  return { success: true, data: mapAssignmentRow(rows[0]) };
}

export async function removeStaffRole(assignmentId: string, businessId: string): Promise<ActionResult<null>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_member_roles")
    .delete()
    .eq("id", assignmentId)
    .eq("business_id", businessId)
    .select("id");

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  if ((data ?? []).length === 0) return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };

  revalidateAssignmentPaths();
  return { success: true, data: null };
}

export async function updateRoleDetails(
  assignmentId: string,
  businessId: string,
  details: unknown
): Promise<ActionResult<RoleDetails>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const validation = validateRoleDetails(details);
  if (!validation.ok) return { success: false, error: validation.error.message, code: validation.error.code };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_member_roles")
    .update({ details: validation.value })
    .eq("id", assignmentId)
    .eq("business_id", businessId)
    .select("id, details");

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as { id: string; details: unknown }[];
  if (rows.length === 0) return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };

  revalidateAssignmentPaths();
  return { success: true, data: (rows[0].details ?? {}) as RoleDetails };
}
