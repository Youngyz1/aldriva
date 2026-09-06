/**
 * app/dashboard/settings/verification/identity/page.tsx
 * Personal User Identity Verification Wizard Page.
 * Lives under Settings → Verification (moved from /dashboard/verify-identity,
 * which now redirects here).
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import IdentityVerificationWizardClient from "./IdentityVerificationWizardClient";

const supabaseAdmin = createSupabaseAdmin();

export default async function VerifyIdentityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch profile identity_status
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("identity_status, identity_verified_at")
    .eq("id", user.id)
    .single();

  // Fetch latest user_identity_verifications submission
  const { data: submission } = await supabaseAdmin
    .from("user_identity_verifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <IdentityVerificationWizardClient
      user={user}
      profile={profile ?? { identity_status: "pending", identity_verified_at: null }}
      initialSubmission={submission ?? null}
    />
  );
}
