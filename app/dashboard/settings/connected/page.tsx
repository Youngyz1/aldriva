/**
 * app/dashboard/settings/connected/page.tsx - SERVER COMPONENT
 * Checks authentication and renders ConnectedClient.
 */

import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import ConnectedClient from "./ConnectedClient";

export default async function ConnectedSettingsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { user } = ctx;

  return (
    <ConnectedClient
      userId={user.id}
    />
  );
}
