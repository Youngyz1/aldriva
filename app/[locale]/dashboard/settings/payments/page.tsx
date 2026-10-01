/**
 * app/dashboard/settings/payments/page.tsx - SERVER COMPONENT
 * Pre-fetches payment configurations and loads PaymentsClient.
 */

import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { getRecipientPaymentsOverview } from "@/lib/payouts";
import PaymentsClient from "./PaymentsClient";

export default async function PaymentsSettingsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { user, organizer, organizerId } = ctx;

  const recipientType = organizerId ? "organizer" : "user";
  const entityId = organizerId || undefined;

  let initialOverview = null;
  let initialError = null;

  try {
    initialOverview = await getRecipientPaymentsOverview(recipientType, entityId, "usd");
  } catch (err) {
    initialError = err instanceof Error ? err.message : "Failed to load payment overview.";
  }

  return (
    <PaymentsClient
      userId={user.id}
      organizerName={organizer?.name ?? null}
      recipientType={recipientType}
      entityId={entityId}
      initialOverview={initialOverview}
      initialError={initialError}
    />
  );
}

