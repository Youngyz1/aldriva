/**
 * app/dashboard/organizations/[slug]/layout.tsx
 * Legacy route — resolves the org UUID from the slug and 308 redirects
 * to the new canonical /dashboard/org/[id] workspace.
 */
import { redirect, notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export default async function LegacyOrgDashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = createSupabaseAdmin();
  const { data: org } = await supabase
    .from("organizers")
    .select("id, user_id")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!org) return notFound();
  if (org.user_id !== user.id) redirect("/dashboard");

  // Redirect to the new canonical id-based workspace
  redirect(`/dashboard/org/${org.id}/overview`);
}
