/**
 * app/admin/finance/payouts/page.tsx
 * Admin Payout Management Page. Protected by requireAdmin().
 */

import { requireAdmin } from "@/lib/auth";
import { getAdminPayoutQueue, type AdminPayoutQueueItem } from "@/lib/payouts";
import PayoutsAdminClient from "./PayoutsAdminClient";

export default async function AdminPayoutsPage() {
  await requireAdmin();

  let initialQueue: AdminPayoutQueueItem[] = [];
  let initialError: string | null = null;

  try {
    initialQueue = await getAdminPayoutQueue("all");
  } catch (err) {
    initialError = err instanceof Error ? err.message : "Failed to load admin payout queue.";
  }

  return (
    <PayoutsAdminClient
      initialQueue={initialQueue}
      initialError={initialError}
    />
  );
}
