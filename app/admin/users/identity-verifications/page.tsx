/**
 * app/admin/users/identity-verifications/page.tsx
 * Admin Personal User Identity Verification Review Queue Page.
 */

import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import IdentityVerificationsAdminClient from "./IdentityVerificationsAdminClient";

const supabaseAdmin = createSupabaseAdmin();

export default async function AdminIdentityVerificationsPage() {
  await requireAdmin();

  // Fetch all user_identity_verifications rows ordered by created_at DESC
  const { data: rawSubmissions } = await supabaseAdmin
    .from("user_identity_verifications")
    .select("*")
    .order("created_at", { ascending: false });

  const submissions = rawSubmissions ?? [];

  // Fetch user profile details for each submission's user_id
  const userIds = Array.from(new Set(submissions.map((s) => s.user_id)));
  const { data: profiles } = userIds.length > 0
    ? await supabaseAdmin.from("profiles").select("id, display_name, identity_status").in("id", userIds)
    : { data: [] };

  const { data: usersData } = userIds.length > 0
    ? await supabaseAdmin.auth.admin.listUsers()
    : { data: { users: [] } };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const authUserMap = new Map((usersData?.users ?? []).map((u) => [u.id, u]));

  const enrichedSubmissions = submissions.map((s) => {
    const prof = profileMap.get(s.user_id);
    const authU = authUserMap.get(s.user_id);
    return {
      ...s,
      user_email: authU?.email ?? "Unknown",
      user_name: prof?.display_name || authU?.user_metadata?.display_name || authU?.email || "User",
      current_identity_status: prof?.identity_status ?? "pending",
    };
  });

  return <IdentityVerificationsAdminClient initialSubmissions={enrichedSubmissions} />;
}
