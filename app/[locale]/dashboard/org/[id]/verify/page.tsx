/**
 * app/dashboard/org/[id]/verify/page.tsx
 * SERVER COMPONENT — Verification Submission Wizard for Organizations.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getEntityRole, ENTITY_ROLES_MANAGE } from "@/lib/entity-auth";
import VerificationWizardClient from "./VerificationWizardClient";

export default async function OrgVerificationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const supabaseAdmin = createSupabaseAdmin();

  // 1. Fetch organizer details
  const { data: organizer } = await supabaseAdmin
    .from("organizers")
    .select("id, user_id, name, slug, org_type, status, verified_at, tax_id, nonprofit_registration_number")
    .eq("id", id)
    .maybeSingle();

  if (!organizer) {
    redirect("/dashboard");
  }

  // 2. Route Guard: verify caller is owner or authorized manager/admin
  const role = await getEntityRole(user.id, id);
  const isOwner = organizer.user_id === user.id;
  const isAuthorized = isOwner || (role !== null && ENTITY_ROLES_MANAGE.includes(role));

  if (!isAuthorized) {
    redirect("/dashboard");
  }

  // 3. Fetch most recent submission
  const { data: submission } = await supabaseAdmin
    .from("organizer_verification_submissions")
    .select("*")
    .eq("organizer_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <VerificationWizardClient
      organizer={organizer}
      initialSubmission={submission ?? null}
    />
  );
}
