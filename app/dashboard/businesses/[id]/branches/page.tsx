import { notFound } from "next/navigation";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import BranchesClient from "./BranchesClient";

export default async function BusinessBranchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageBusiness(id);
  if (!auth.ok) return notFound();
  const admin = createSupabaseAdmin();
  const { data: business } = await admin.from("businesses").select("id, name, business_type, industry, category").eq("id", id).maybeSingle();
  if (!business) return notFound();
  const { data: branches } = await admin.from("business_branches").select("*").eq("business_id", id).order("is_main", { ascending: false }).order("created_at", { ascending: true });
  return <BranchesClient businessId={id} businessName={business.name} initialBranches={branches ?? []} />;
}
