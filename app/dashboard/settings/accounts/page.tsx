/**
 * app/dashboard/settings/accounts/page.tsx
 * Connected accounts — alias route per dashboard settings spec.
 */

import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import ConnectedClient from "../connected/ConnectedClient";

export default async function AccountsSettingsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  return <ConnectedClient userId={ctx.user.id} />;
}
