/**
 * app/dashboard/settings/security/page.tsx - SERVER COMPONENT
 * Fetches user auth meta and renders SecurityClient.
 */

import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import SecurityClient from "./SecurityClient";

export default async function SecuritySettingsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { user } = ctx;

  return (
    <SecurityClient
      email={user.email ?? ""}
      createdAt={user.created_at}
      lastSignIn={user.last_sign_in_at}
    />
  );
}
