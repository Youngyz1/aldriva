import "server-only";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveRolesAccess } from "@/lib/staff/roles-access";

const HEAD_OFFICE_ROLES = ["owner", "admin", "manager"] as string[];

type Supabase = Awaited<ReturnType<typeof createSupabaseServer>>;

// Same question the policies ask: business-wide (branch NULL). Errors count as "no".
async function holds(supabase: Supabase, businessId: string, key: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("staff_has_permission", {
    p_business_id: businessId,
    p_permission_key: key,
    p_branch_id: null,
  });
  return !error && data === true;
}

export async function getRolesAccess(businessId: string, organizerScope: boolean) {
  const org = await assertCanManageBusiness(businessId);
  const headOffice = org.ok && (org.role == null || HEAD_OFFICE_ROLES.includes(org.role));
  const supabase = await createSupabaseServer();
  const [hasManage, hasView] = await Promise.all([
    holds(supabase, businessId, "workforce.roles.manage"),
    holds(supabase, businessId, "workforce.roles.view"),
  ]);
  return resolveRolesAccess({ organizerScope, headOffice, hasManage, hasView });
}

export async function assertCanManageRoles(
  businessId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const access = await getRolesAccess(businessId, false);
  if (access.canManage) return { ok: true };
  return { ok: false, error: "Forbidden", status: 403 };
}

// Admin client on purpose: the RLS client hides assignments outside the actor's
// branch reach, which would make an in-use role look unused. Authorization has
// already passed before this is called. Fails closed: an error throws.
export async function countActiveRoleAssignmentsAdmin(roleId: string): Promise<number> {
  const { count, error } = await createSupabaseAdmin()
    .from("staff_member_roles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId)
    .eq("is_active", true);
  if (error) throw new Error("Could not count role assignments");
  return count ?? 0;
}
