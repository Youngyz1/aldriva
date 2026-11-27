import { notFound } from "next/navigation";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import BranchesClient from "./BranchesClient";

export default async function BusinessBranchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageBusiness(id);
  if (!auth.ok) return notFound();
  const admin = createSupabaseAdmin();
  const { data: business } = await admin.from("businesses").select("id, name, business_type, industry, category").eq("id", id).maybeSingle();
  if (!business) return notFound();
  const { data: branches } = await admin
    .from("business_branches")
    .select("*")
    .eq("business_id", id)
    .order("is_main", { ascending: false })
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });

  // Staff count per branch is staff data -- fetched with the RLS-respecting
  // user-session client, not the admin client above (which is only used for
  // the business/branches rows themselves, matching the pre-existing pattern
  // in this file).
  const supabase = await createSupabaseServer();
  const { data: staffRows } = await supabase.from("staff_members").select("branch_id").eq("business_id", id);
  const staffCountByBranch: Record<string, number> = {};
  for (const row of staffRows ?? []) {
    if (!row.branch_id) continue;
    staffCountByBranch[row.branch_id] = (staffCountByBranch[row.branch_id] ?? 0) + 1;
  }

  return <BranchesClient businessId={id} initialBranches={branches ?? []} staffCountByBranch={staffCountByBranch} />;
}
