import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

interface Props {
  searchParams: Promise<{ templateId?: string }>;
}

/**
 * Org-agnostic entry point into the (org-scoped) website template gallery.
 * Exists so a link built before an organizer id is known — e.g. the public
 * /templates/showcase/preview "Use this template" button, reached while
 * logged out — has somewhere stable to point at. Resolves the signed-in
 * user's organizer the same way MyOrganizersDropdown does (owned first,
 * then delegated via entity_members) and forwards any ?templateId= along.
 */
export default async function NewWebsiteOrgResolverPage({ searchParams }: Props) {
  const { templateId } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();
  const { data: owned } = await admin
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  let organizerId = (owned as Array<{ id: string }> | null)?.[0]?.id ?? null;

  if (!organizerId) {
    const { data: membership } = await admin
      .from("entity_members")
      .select("organizer_id")
      .eq("user_id", user.id)
      .limit(1);
    organizerId = (membership as Array<{ organizer_id: string }> | null)?.[0]?.organizer_id ?? null;
  }

  if (!organizerId) redirect("/create-organizer");

  const query = templateId ? `?templateId=${encodeURIComponent(templateId)}` : "";
  redirect(`/dashboard/org/${encodeURIComponent(organizerId)}/website/new${query}`);
}
