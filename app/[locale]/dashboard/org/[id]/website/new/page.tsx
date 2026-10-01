import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getTenantWebsite } from "@/lib/actions/website";
import NewWebsiteClient from "./NewWebsiteClient";

export default async function NewWebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = createSupabaseAdmin();
  const { data: org } = await supabase.from("organizers").select("id, name, slug, status").eq("id", id).maybeSingle();
  if (!org) return notFound();

  const res = await getTenantWebsite(id);
  if (res.success && res.data?.website) {
    // Already has site -> go to overview
    redirect(`/dashboard/org/${id}/website`);
  }

  return <NewWebsiteClient orgId={id} orgName={org.name} />;
}
