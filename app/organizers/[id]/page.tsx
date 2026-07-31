/**
 * app/organizers/[id]/page.tsx
 * Legacy route — kept for backward compatibility.
 * Redirects all traffic to the canonical Organization profile at /org/[slug].
 */
import { redirect, notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export default async function LegacyOrganizerRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data } = await supabase
    .from("organizers")
    .select("slug")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (data?.slug) {
    // 308 Permanent Redirect — preserves the HTTP method
    redirect(`/org/${data.slug}`);
  }

  return notFound();
}
