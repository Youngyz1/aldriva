import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  buildStaffUiCapabilities,
  type StaffReach,
  type StaffUiCapabilities,
} from "@/lib/staff/staff-capabilities";

const HEAD_OFFICE_ROLES = ["owner", "admin", "manager"] as string[];

type Supabase = Awaited<ReturnType<typeof createSupabaseServer>>;

// Asks the database the same question the staff_members policies ask (250):
// staff_has_permission(business, key, branch), once at NULL and once per branch.
// Any RPC error counts as "no" (fails closed: fewer buttons; RLS still decides writes).
async function reachFor(
  supabase: Supabase,
  businessId: string,
  key: string,
  branchIds: string[],
): Promise<StaffReach> {
  const ask = async (branchId: string | null): Promise<boolean> => {
    const { data, error } = await supabase.rpc("staff_has_permission", {
      p_business_id: businessId,
      p_permission_key: key,
      p_branch_id: branchId,
    });
    return !error && data === true;
  };
  const [all, ...perBranch] = await Promise.all([ask(null), ...branchIds.map((b) => ask(b))]);
  return { all, branches: branchIds.filter((_, i) => perBranch[i]) };
}

// Deliberately does NOT use assertCanManageStaffArea: that helper writes a
// denial-log row on every failure, and this runs on every staff page load.
// Any failure here fails closed (fewer buttons); RLS still decides writes.
export async function getStaffUiCapabilities(businessId: string): Promise<StaffUiCapabilities> {
  const user = await getCurrentUser();
  if (!user) return buildStaffUiCapabilities({ headOffice: false, managedBranchId: null, myStaffId: null });

  const org = await assertCanManageBusiness(businessId);
  // businesses.owner_id passes without a role; entity members carry a role.
  const headOffice = org.ok && (org.role == null || HEAD_OFFICE_ROLES.includes(org.role));

  const supabase = await createSupabaseServer();
  const { data: mine } = await supabase
    .from("staff_members")
    .select("id, branch_id")
    .eq("business_id", businessId)
    .eq("auth_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  let managedBranchId: string | null = null;
  if (mine?.branch_id) {
    const { data, error } = await supabase.rpc("is_staff_branch_manager", {
      p_business_id: businessId,
      p_branch_id: mine.branch_id,
    });
    if (!error && data === true) managedBranchId = mine.branch_id;
  }

  // Head office already passes every clause, so skip the extra calls for it.
  if (headOffice) return buildStaffUiCapabilities({ headOffice, managedBranchId, myStaffId: mine?.id ?? null });

  const { data: branchRows } = await supabase
    .from("business_branches")
    .select("id")
    .eq("business_id", businessId);
  const branchIds = (branchRows ?? []).map((b: { id: string }) => b.id);

  const [update, view] = await Promise.all([
    reachFor(supabase, businessId, "workforce.update", branchIds),
    reachFor(supabase, businessId, "workforce.view", branchIds),
  ]);

  return buildStaffUiCapabilities({
    headOffice,
    managedBranchId,
    myStaffId: mine?.id ?? null,
    reach: { update, view },
  });
}
