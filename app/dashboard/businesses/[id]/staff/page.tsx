import { notFound } from "next/navigation";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { getStaffUiCapabilities } from "@/lib/staff/staff-capabilities-server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { listStaffMembers } from "@/lib/actions/staff-members";
import StaffClient from "./StaffClient";

export default async function BusinessStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanAccessBusinessStaffArea(id);
  if (!auth.ok) return notFound();

  // business_branches has a public SELECT policy (no auth required), so this
  // is safe for both organizer-level and staff-scope users via the RLS client.
  const supabase = await createSupabaseServer();
  const { data: branches } = await supabase
    .from("business_branches")
    .select("id, label, status")
    .eq("business_id", id)
    .order("label", { ascending: true });

  const staffResult = await listStaffMembers(id);

  // Button visibility only (RLS is the real gate). Delete is head-office only,
  // because staff_members' DELETE policy has no branch-manager clause.
  const capabilities = await getStaffUiCapabilities(id);

  return (
    <StaffClient
      businessId={id}
      branches={branches ?? []}
      initialStaff={staffResult.success ? staffResult.data : []}
      initialError={staffResult.success ? null : staffResult.error}
      capabilities={capabilities}
    />
  );
}
