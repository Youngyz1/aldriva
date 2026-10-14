/**
 * app/dashboard/organizations/[slug]/overview/page.tsx
 *
 * Legacy organization overview route by slug.
 * Looks up the organization ID by slug and redirects to the canonical
 * /dashboard/org/[id]/overview route so all bookmarks and legacy links continue working.
 */

import { notFound, redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export default async function LegacyOrgOverviewPage({
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
