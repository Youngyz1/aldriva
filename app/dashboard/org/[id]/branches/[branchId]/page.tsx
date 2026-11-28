import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import BranchDetailClient from "./BranchDetailClient";

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ id: string; branchId: string }>;
}) {
  const { id: organizerId, branchId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // business_branches has a public SELECT policy ("Public can view
  // branches", migration_132, USING (true)), so this read needs no admin
  // client -- same reasoning as the staff profile page, where business_id
  // comes from a row the caller can already read before any authorization
  // check runs. organizerId is cosmetic here (back-link only); the real
  // gate is assertCanManageBusiness(branch.business_id) below, which is
  // organizer-level only -- branches have no staff-scope admission, unlike
  // the staff area (business_branches' own "Owners can manage branches"
  // policy has no branch-manager clause either).
  const supabase = await createSupabaseServer();
  const { data: branch } = await supabase
    .from("business_branches")
    .select("*")
    .eq("id", branchId)
    .maybeSingle();
  if (!branch) return notFound();

  const auth = await assertCanManageBusiness(branch.business_id);
  if (!auth.ok) return notFound();

  // Staff data is RLS-gated (staff_members has no public SELECT policy);
  // the same user-session client above already satisfies that.
  const { data: staffRows } = await supabase
    .from("staff_members")
    .select("id, full_name, photo_url, status, employment_type")
    .eq("business_id", branch.business_id)
    .eq("branch_id", branchId)
    .order("full_name", { ascending: true });

  // Full branch list (not just this one) so "Add staff here"'s dialog can
  // still show the normal branch picker, pre-selected to this branch --
  // same StaffFormDialog every other staff screen uses, same public policy.
  const { data: allBranches } = await supabase
    .from("business_branches")
    .select("id, label, status")
    .eq("business_id", branch.business_id)
    .order("label", { ascending: true });

  return (
    <BranchDetailClient
      organizerId={organizerId}
      branch={branch}
      initialStaff={staffRows ?? []}
      branches={(allBranches ?? []) as { id: string; label: string; status: "active" | "archived" }[]}
    />
  );
}
