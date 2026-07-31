/**
 * app/dashboard/settings/payments/page.tsx - SERVER COMPONENT
 * Pre-fetches payment configurations and loads PaymentsClient.
 */

import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import PaymentsClient from "./PaymentsClient";

export default async function PaymentsSettingsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { user, organizer } = ctx;

  return (
    <PaymentsClient
      userId={user.id}
      organizerName={organizer?.name ?? null}
    />
  );
}
