import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { getStaffMember } from "@/lib/actions/staff-members";
import StaffProfileClient from "./StaffProfileClient";

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
    .select("business_id")
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

  // canDelete is organizer-level only -- staff_members' DELETE policy has no
  // branch-manager clause. Computed here, not trusted from the client.
  const organizerAuth = await assertCanManageBusiness(staffRow.business_id);

  return (
    <StaffProfileClient
      organizerId={organizerId}
      businessId={staffRow.business_id}
      staff={result.data}
      branches={(branches ?? []) as { id: string; label: string; status: "active" | "archived" }[]}
      canDelete={organizerAuth.ok}
    />
  );
}
