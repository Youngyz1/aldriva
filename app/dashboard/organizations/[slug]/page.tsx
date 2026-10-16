import { notFound, redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

// /dashboard/organizations/[slug] → redirect directly to canonical /dashboard/org/[id]/overview
export default async function OrgDashboardRoot({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createSupabaseAdmin();

  const { data: org } = await supabase
    .from("organizers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!org) {
    return notFound();
  }

  redirect(`/dashboard/org/${org.id}/overview`);
}
