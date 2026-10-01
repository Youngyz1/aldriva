/**
 * app/dashboard/settings/page.tsx
 * Redirects the settings root page to the profile page.
 */

import { redirect } from "next/navigation";

export default function SettingsIndexPage() {
  redirect("/dashboard/settings/profile");
}
