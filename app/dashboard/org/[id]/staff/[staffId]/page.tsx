import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getStaffUiCapabilities } from "@/lib/staff/staff-capabilities-server";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { getStaffMember } from "@/lib/actions/staff-members";
import { listAssignableRoles, listStaffMemberRoleAssignments } from "@/lib/actions/staff-role-assignments";
import StaffProfileClient from "./StaffProfileClient";
import { getSiteUrl } from "@/lib/site-url";

export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ id: string; staffId: string }>;
}) {
  const { id: organizerId, staffId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // RLS-filtered: this row is visible only to a caller already authorized to
  // see it (staff_members' own SELECT policy -- organizer-level entity
  // member, branch manager, or the staff member themselves). No admin
  // client: business_id comes from a row the caller can already read, and
  // getStaffMember below re-derives the real authorization from that
  // business_id via assertCanAccessBusinessStaffArea -- not from the
  // organizerId route param, which is cosmetic (used only for back-links).
  const supabase = await createSupabaseServer();
  const { data: staffRow } = await supabase
    .from("staff_members")
    .select("business_id, auth_user_id")
    .eq("id", staffId)
    .maybeSingle();
  if (!staffRow) return notFound();

  const result = await getStaffMember(staffRow.business_id, staffId);
  if (!result.success) return notFound();

  const { data: branches } = await supabase
    .from("business_branches")
    .select("id, label, status")
    .eq("business_id", staffRow.business_id)
    .order("label", { ascending: true });

  // Button visibility only (RLS is the real gate). Delete is head-office only,
  // because staff_members' DELETE policy has no branch-manager clause.
  const capabilities = await getStaffUiCapabilities(staffRow.business_id);

  // scope ("organizer" | "staff") drives the assignment panel's privileged-
  // role disabling -- same reachability check getStaffMember already ran
  // internally, called again here only to read its `scope` field.
  const staffAreaAuth = await assertCanAccessBusinessStaffArea(staffRow.business_id);
  const callerScope = staffAreaAuth.ok ? (staffAreaAuth.scope ?? "staff") : "staff";

  const [assignmentsResult, assignableRolesResult] = await Promise.all([
    listStaffMemberRoleAssignments(staffId, staffRow.business_id),
    listAssignableRoles(staffRow.business_id),
  ]);

  return (
    <StaffProfileClient
      organizerId={organizerId}
      businessId={staffRow.business_id}
      staff={result.data}
      branches={(branches ?? []) as { id: string; label: string; status: "active" | "archived" }[]}
      capabilities={capabilities}
      roleAssignments={assignmentsResult.success ? assignmentsResult.data : []}
      assignableRoles={assignableRolesResult.success ? assignableRolesResult.data : []}
      callerScope={callerScope}
      hasLogin={Boolean(staffRow.auth_user_id)}
      siteUrl={getSiteUrl()}
    />
  );
}
