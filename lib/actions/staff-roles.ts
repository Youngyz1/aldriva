"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { assertCanManageRoles, countActiveRoleAssignmentsAdmin } from "@/lib/staff/roles-access-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { mapStaffError, NOT_FOUND_OR_DENIED } from "@/lib/staff/errors";

function revalidateRolesPaths() {
  // Route-pattern form: revalidates every org/[id]/roles, org/[id]/staff,
  // and org/[id]/workforce page without needing this role's business's
  // organizer_id -- same convention as lib/actions/staff-members.ts and
  // lib/actions/business-branches.ts.
  revalidatePath("/dashboard/org/[id]/roles", "page");
  revalidatePath("/dashboard/org/[id]/staff", "page");
  revalidatePath("/dashboard/org/[id]/workforce", "page");
}

export type PlatformRoleName = "owner" | "admin" | "manager" | "viewer";

export type StaffRoleRow = {
  id: string;
  business_id: string | null;
  name: string;
  description: string | null;
  role_scope: "platform" | "business";
  platform_role: PlatformRoleName | null;
  is_active: boolean;
  permission_keys: string[];
  /** Active staff_member_roles rows pointing at this role. Drives the
   * deactivate/delete "only when assigned to 0 staff" gate and the confirm
   * dialog's count. */
  assigned_count: number;
};

export type StaffPermissionRow = {
  id: string;
  key: string;
  description: string | null;
  domain: string;
};

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string; code: string };

const ROLE_SELECT = "id, business_id, name, description, role_scope, platform_role, is_active";

const RESERVED_ROLE_NAMES: readonly PlatformRoleName[] = ["owner", "admin", "manager", "viewer"];

function validateRoleName(name: string): { code: string; message: string } | null {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 60) {
    return { code: "role_name_length", message: "Role name must be 2-60 characters." };
  }
  if (RESERVED_ROLE_NAMES.includes(trimmed.toLowerCase() as PlatformRoleName)) {
    return { code: "role_name_reserved", message: "That name is reserved for a built-in role." };
  }
  return null;
}

type RawRoleRow = {
  id: string;
  business_id: string | null;
  name: string;
  description: string | null;
  role_scope: "platform" | "business";
  platform_role: PlatformRoleName | null;
  is_active: boolean;
};

/**
 * Lists every role visible to this business: the 4 seeded platform roles
 * (role_scope = 'platform', readable everywhere per staff_roles' own SELECT
 * policy) plus this business's own custom roles. Two separate queries,
 * not a single `.or()` filter string, to avoid interpolating businessId
 * into a raw PostgREST filter expression.
 */
export async function listStaffRoles(businessId: string): Promise<ActionResult<StaffRoleRow[]>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const [{ data: platformRoles, error: platformError }, { data: businessRoles, error: businessError }] = await Promise.all([
    supabase.from("staff_roles").select(ROLE_SELECT).eq("role_scope", "platform").order("name", { ascending: true }),
    supabase.from("staff_roles").select(ROLE_SELECT).eq("business_id", businessId).order("name", { ascending: true }),
  ]);
  if (platformError || businessError) {
    console.error("[listStaffRoles]", platformError?.message ?? businessError?.message);
    return { success: false, error: "Could not load roles. Please try again.", code: "generic_error" };
  }

  const roles = [...(platformRoles ?? []), ...(businessRoles ?? [])] as RawRoleRow[];
  if (roles.length === 0) return { success: true, data: [] };

  const roleIds = roles.map((r) => r.id);
  const [{ data: permissionLinks }, { data: assignmentLinks }] = await Promise.all([
    supabase.from("staff_role_permissions").select("role_id, staff_permissions ( key )").in("role_id", roleIds),
    createSupabaseAdmin().from("staff_member_roles").select("role_id").eq("business_id", businessId).eq("is_active", true).in("role_id", roleIds),
  ]);

  const permissionKeysByRole = new Map<string, string[]>();
  for (const link of (permissionLinks ?? []) as unknown as { role_id: string; staff_permissions: { key: string } | null }[]) {
    const list = permissionKeysByRole.get(link.role_id) ?? [];
    if (link.staff_permissions?.key) list.push(link.staff_permissions.key);
    permissionKeysByRole.set(link.role_id, list);
  }

  const assignedCountByRole = new Map<string, number>();
  for (const link of (assignmentLinks ?? []) as { role_id: string }[]) {
    assignedCountByRole.set(link.role_id, (assignedCountByRole.get(link.role_id) ?? 0) + 1);
  }

  return {
    success: true,
    data: roles.map((role) => ({
      ...role,
      permission_keys: permissionKeysByRole.get(role.id) ?? [],
      assigned_count: assignedCountByRole.get(role.id) ?? 0,
    })),
  };
}

/** Global, business-independent permission registry (staff_permissions'
 * own SELECT policy: `is_active = true` is readable by anyone). */
export async function listStaffPermissions(): Promise<ActionResult<StaffPermissionRow[]>> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_permissions")
    .select("id, key, description, domain")
    .eq("is_active", true)
    .order("domain", { ascending: true })
    .order("key", { ascending: true });
  if (error) {
    console.error("[listStaffPermissions]", error.message);
    return { success: false, error: "Could not load permissions. Please try again.", code: "generic_error" };
  }
  return { success: true, data: data ?? [] };
}

export async function createStaffRole(
  businessId: string,
  input: { name: string; description?: string | null }
): Promise<ActionResult<StaffRoleRow>> {
  const auth = await assertCanManageRoles(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const nameError = validateRoleName(input.name);
  if (nameError) return { success: false, error: nameError.message, code: nameError.code };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_roles")
    .insert({
      business_id: businessId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      role_scope: "business",
    })
    .select(ROLE_SELECT);

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as RawRoleRow[];
  if (rows.length === 0) return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };

  revalidateRolesPaths();
  return { success: true, data: { ...rows[0], permission_keys: [], assigned_count: 0 } };
}

export async function updateStaffRole(
  roleId: string,
  businessId: string,
  input: { name?: string; description?: string | null }
): Promise<ActionResult<StaffRoleRow>> {
  const auth = await assertCanManageRoles(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const nameError = validateRoleName(input.name);
    if (nameError) return { success: false, error: nameError.message, code: nameError.code };
    updates.name = input.name.trim();
  }
  if (input.description !== undefined) updates.description = input.description?.trim() || null;

  const supabase = await createSupabaseServer();
  // business_id filter is also a defense-in-depth belt: role_scope='platform'
  // rows always have business_id IS NULL, so this update can never touch one
  // even before RLS's own INSERT/UPDATE/DELETE policies (business-scope
  // only) get a chance to reject it.
  const { data, error } = await supabase
    .from("staff_roles")
    .update(updates)
    .eq("id", roleId)
    .eq("business_id", businessId)
    .select(ROLE_SELECT);

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as RawRoleRow[];
  if (rows.length === 0) return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };

  revalidateRolesPaths();
  const { data: permissionLinks } = await supabase
    .from("staff_role_permissions")
    .select("staff_permissions ( key )")
    .eq("role_id", roleId);
  const permissionKeys = ((permissionLinks ?? []) as unknown as { staff_permissions: { key: string } | null }[])
    .map((link) => link.staff_permissions?.key)
    .filter((key): key is string => Boolean(key));

  const { count } = await supabase
    .from("staff_member_roles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId)
    .eq("is_active", true);

  return { success: true, data: { ...rows[0], permission_keys: permissionKeys, assigned_count: count ?? 0 } };
}

async function countActiveRoleAssignments(roleId: string): Promise<number> {
  return countActiveRoleAssignmentsAdmin(roleId);
}

export async function setStaffRoleActive(
  roleId: string,
  businessId: string,
  isActive: boolean
): Promise<ActionResult<StaffRoleRow>> {
  const auth = await assertCanManageRoles(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  if (!isActive) {
    const assigned = await countActiveRoleAssignments(roleId);
    if (assigned > 0) {
      return {
        success: false,
        error: `This role is assigned to ${assigned} staff member${assigned === 1 ? "" : "s"}. Remove those assignments before deactivating it.`,
        code: "role_in_use",
      };
    }
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_roles")
    .update({ is_active: isActive })
    .eq("id", roleId)
    .eq("business_id", businessId)
    .select(ROLE_SELECT);

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as RawRoleRow[];
  if (rows.length === 0) return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };

  revalidateRolesPaths();
  // Reaching here means the 0-assignment gate above already held (either
  // just confirmed for a deactivate, or trivially true for a reactivate,
  // since nothing can be assigned to a role while it's inactive -- see
  // listAssignableRoles' is_active filter).
  return { success: true, data: { ...rows[0], permission_keys: [], assigned_count: 0 } };
}

export async function deleteStaffRole(roleId: string, businessId: string): Promise<ActionResult<null>> {
  const auth = await assertCanManageRoles(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const assigned = await countActiveRoleAssignments(roleId);
  if (assigned > 0) {
    return {
      success: false,
      error: `This role is assigned to ${assigned} staff member${assigned === 1 ? "" : "s"}. Remove those assignments before deleting it.`,
      code: "role_in_use",
    };
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_roles")
    .delete()
    .eq("id", roleId)
    .eq("business_id", businessId)
    .select("id");

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  if ((data ?? []).length === 0) return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };

  revalidateRolesPaths();
  return { success: true, data: null };
}

/**
 * Replace-all semantics: insert the keys that are missing first, then
 * delete the rows for keys that were removed. Insert runs first so a
 * mid-operation failure never leaves the role with fewer permissions than
 * it started with -- at worst it ends up with extra ones from a partially
 * applied insert, which is the safer failure direction.
 */
export async function setRolePermissions(
  roleId: string,
  businessId: string,
  permissionKeys: string[]
): Promise<ActionResult<string[]>> {
  const auth = await assertCanManageRoles(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const { data: roleRow } = await supabase.from("staff_roles").select("id").eq("id", roleId).eq("business_id", businessId).maybeSingle();
  if (!roleRow) return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };

  const { data: permissionRows, error: permissionError } = await supabase
    .from("staff_permissions")
    .select("id, key")
    .in("key", permissionKeys.length > 0 ? permissionKeys : [""]);
  if (permissionError) {
    console.error("[setRolePermissions]", permissionError.message);
    return { success: false, error: "Could not resolve permissions. Please try again.", code: "generic_error" };
  }
  // Unknown keys (a client-side bug, since the UI only ever offers keys it
  // loaded from listStaffPermissions) are silently dropped rather than
  // failing the whole save -- the keys that DO resolve are still correct.
  const resolved = (permissionRows ?? []) as { id: string; key: string }[];
  const desiredPermissionIds = new Set(resolved.map((p) => p.id));

  const { data: existingRows, error: existingError } = await supabase
    .from("staff_role_permissions")
    .select("id, permission_id")
    .eq("role_id", roleId);
  if (existingError) {
    console.error("[setRolePermissions]", existingError.message);
    return { success: false, error: "Could not load current permissions. Please try again.", code: "generic_error" };
  }
  const existing = (existingRows ?? []) as { id: string; permission_id: string }[];
  const existingPermissionIds = new Set(existing.map((row) => row.permission_id));

  const toInsert = [...desiredPermissionIds].filter((id) => !existingPermissionIds.has(id));
  const toDeleteRowIds = existing.filter((row) => !desiredPermissionIds.has(row.permission_id)).map((row) => row.id);

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("staff_role_permissions")
      .insert(toInsert.map((permissionId) => ({ role_id: roleId, permission_id: permissionId })));
    if (insertError) {
      const mapped = mapStaffError(insertError);
      return { success: false, error: mapped.message, code: mapped.code };
    }
  }

  if (toDeleteRowIds.length > 0) {
    const { data: deletedRows, error: deleteError } = await supabase
      .from("staff_role_permissions")
      .delete()
      .in("id", toDeleteRowIds)
      .select("id");
    if (deleteError) {
      const mapped = mapStaffError(deleteError);
      return { success: false, error: mapped.message, code: mapped.code };
    }
    // RLS reports a denied delete as zero rows, not an error: never report success for it.
    if ((deletedRows ?? []).length !== toDeleteRowIds.length) {
      revalidateRolesPaths();
      return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
    }
  }

  revalidateRolesPaths();
  return { success: true, data: resolved.map((p) => p.key) };
}
