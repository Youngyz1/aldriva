"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";

export type StaffEmploymentType = "full_time" | "part_time" | "contract" | "seasonal" | "volunteer";
export type StaffStatus = "active" | "suspended" | "deactivated";

export type StaffMemberRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  employment_type: StaffEmploymentType;
  department: string | null;
  status: StaffStatus;
  branch_id: string | null;
  branch_label: string | null;
  role_names: string[];
};

type StaffMemberQueryRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  employment_type: StaffEmploymentType;
  department: string | null;
  status: StaffStatus;
  branch_id: string | null;
  business_branches: { label: string } | null;
  staff_member_roles: { is_active: boolean; staff_roles: { name: string } | null }[] | null;
};

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

// Read-only for now (Slice A). Every staff action, including this one, must
// authorize itself -- the business layout now also admits staff-scope users
// (see app/dashboard/businesses/[id]/layout.tsx), so a page being reachable
// is not proof an action is allowed.
export async function listStaffMembers(businessId: string): Promise<ActionResult<StaffMemberRow[]>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_members")
    .select(
      `id, full_name, phone, email, employment_type, department, status, branch_id,
       business_branches ( label ),
       staff_member_roles ( is_active, staff_roles ( name ) )`
    )
    .eq("business_id", businessId)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[listStaffMembers]", error.message);
    return { success: false, error: "Could not load staff. Please try again." };
  }

  const rows = (data ?? []) as unknown as StaffMemberQueryRow[];
  const staff: StaffMemberRow[] = rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    employment_type: row.employment_type,
    department: row.department,
    status: row.status,
    branch_id: row.branch_id,
    branch_label: row.business_branches?.label ?? null,
    role_names: (row.staff_member_roles ?? [])
      .filter((r) => r.is_active && r.staff_roles?.name)
      .map((r) => r.staff_roles!.name),
  }));

  return { success: true, data: staff };
}
