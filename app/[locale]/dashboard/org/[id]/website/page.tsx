import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTenantWebsite } from "@/lib/actions/website";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import WebsiteSettingsClient from "./WebsiteSettingsClient";

export default async function OrgWebsitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = createSupabaseAdmin();
  const { data: org } = await supabase
    .from("organizers")
    .select("id, name, slug, photo, status, org_type, user_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!org) return notFound();

  // Load website data for this organizer
  const res = await getTenantWebsite(id);
  const initialData = (res.success && res.data) ? res.data : null;

  return (
    <div className="space-y-6">
      <WebsiteSettingsClient
        orgId={id}
        orgName={org.name}
        orgSlug={org.slug}
        initialData={initialData}
      />
    </div>
  );
}
