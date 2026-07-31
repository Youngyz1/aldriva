/**
 * app/dashboard/settings/privacy/page.tsx - SERVER COMPONENT
 * Fetches user privacy settings and renders PrivacyClient.
 */

import { redirect } from "next/navigation";
import { getDashboardContext, supabaseAdmin } from "@/lib/dashboard-context";
import PrivacyClient from "./PrivacyClient";
import { type PrivacySettings } from "@/types/settings";

const defaultPrivacy: PrivacySettings = {
  profile_visibility: "public",
  show_email: false,
  show_organized_events: true,
  show_donations: true,
  allow_search_indexing: true,
};

export default async function PrivacySettingsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { user } = ctx;

  // Fetch privacy_settings JSONB column from profiles
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("privacy_settings")
    .eq("id", user.id)
    .maybeSingle();

  const privacySettings: PrivacySettings = {
    ...defaultPrivacy,
    ...((profile?.privacy_settings ?? {}) as Partial<PrivacySettings>),
  };

  return (
    <PrivacyClient
      userId={user.id}
      initialPrivacy={privacySettings}
    />
  );
}
