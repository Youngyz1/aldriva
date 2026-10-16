import { redirect, notFound } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { checkTenantAccess, ENTITY_ROLES_MANAGE } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getTenantWebsite } from "@/lib/actions/website";
import { resolveWebsiteCategoryForOrganizer } from "@/lib/website-category";
import NewWebsiteClient from "./NewWebsiteClient";

export default async function NewWebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = createSupabaseAdmin();
  const { data: org } = await supabase.from("organizers").select("id, name, slug, photo, status, org_type").eq("id", id).maybeSingle();
  if (!org) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[website/new] notFound: no organizer row for id=${id}`);
    }
    return notFound();
  }
  const { data: linkedBusiness } = await supabase
    .from("businesses")
    .select("name, logo, industry, category, business_type, created_at")
    .eq("organizer_id", id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const res = await getTenantWebsite(id);
  if (res.success && res.data?.website) {
    // Already has site -> go to overview
    redirect(`/dashboard/org/${id}/website`);
  }

  const isSuperAdmin = await isAdmin();
  const access = isSuperAdmin
    ? null
    : await checkTenantAccess(user.id, id, ENTITY_ROLES_MANAGE);

  return (
    <NewWebsiteClient
      orgId={id}
      orgName={org.name}
      previewBusinessName={
        typeof linkedBusiness?.name === "string" && linkedBusiness.name.trim()
          ? linkedBusiness.name.trim()
          : org.name
      }
      previewBusinessLogo={
        typeof linkedBusiness?.logo === "string" && linkedBusiness.logo.trim()
          ? linkedBusiness.logo.trim()
          : null
      }
      initialCategory={resolveWebsiteCategoryForOrganizer(
        org.org_type,
        linkedBusiness?.category ?? linkedBusiness?.business_type ?? linkedBusiness?.industry
      )}
      canCreate={isSuperAdmin || Boolean(access?.hasAccess)}
    />
  );
}
