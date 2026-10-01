/**
 * app/dashboard/settings/profile/page.tsx - SERVER COMPONENT
 * Fetches user profile data on the server and loads ProfileClient.
 */

import { redirect } from "next/navigation";
import { getDashboardContext, supabaseAdmin } from "@/lib/dashboard-context";
import ProfileClient from "./ProfileClient";
import { type AccountInfo, defaultAccountInfo } from "@/types/settings";

export default async function ProfileSettingsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { user, organizer } = ctx;

  // Fetch profiles table columns
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("account_info, profile_photo")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = (user.user_metadata?.display_name as string | undefined) ?? "";
  const accountInfo: AccountInfo = {
    ...defaultAccountInfo,
    ...((profile?.account_info ?? {}) as Partial<AccountInfo>),
  };

  return (
    <ProfileClient
      userId={user.id}
      initialEmail={user.email ?? ""}
      initialDisplayName={displayName}
      initialProfilePhoto={profile?.profile_photo ?? ""}
      initialAccountInfo={accountInfo}
      organizer={organizer}
    />
  );
}
