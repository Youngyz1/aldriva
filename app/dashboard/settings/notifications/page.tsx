/**
 * app/dashboard/settings/notifications/page.tsx - SERVER COMPONENT
 * Fetches user notification preferences and renders NotificationsClient.
 */

import { redirect } from "next/navigation";
import { getDashboardContext, supabaseAdmin } from "@/lib/dashboard-context";
import NotificationsClient from "./NotificationsClient";
import { type NotificationPreferences } from "@/types/settings";

const defaultPrefs: NotificationPreferences = {
  notify_ticket_purchase: true,
  notify_donation: true,
  notify_event_reminder: false,
  notify_marketing: false,
  notify_security_alerts: true,
};

export default async function NotificationsSettingsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { user } = ctx;

  // Fetch preferences from profiles
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .maybeSingle();

  const prefs: NotificationPreferences = {
    ...defaultPrefs,
    ...((profile?.preferences ?? {}) as Partial<NotificationPreferences>),
  };

  return (
    <NotificationsClient
      userId={user.id}
      initialPrefs={prefs}
    />
  );
}
