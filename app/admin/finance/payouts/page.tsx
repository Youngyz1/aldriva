/**
 * app/admin/finance/payouts/page.tsx
 * Admin Payout Management Page. Protected by requireAdmin().
 */

import { requireAdmin } from "@/lib/auth";
import { getAdminPayoutQueue, type AdminPayoutQueueItem } from "@/lib/payouts";
import { payoutsStrings } from "./payouts-strings";
import PayoutsAdminClient from "./PayoutsAdminClient";

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  // Overview "Needs attention" deep-links ?status=requested; anything
  // invalid falls back to "all". The queue itself is still fetched once
  // here and refetched per tab by the client, as before.
  const params = await searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  const valid: string[] = payoutsStrings.tabs.map((t) => t.value);
  const initialFilter = raw && valid.includes(raw) ? raw : "all";

  let initialQueue: AdminPayoutQueueItem[] = [];
  let initialError: string | null = null;

  try {
    initialQueue = await getAdminPayoutQueue(initialFilter);
  } catch (err) {
    initialError = err instanceof Error ? err.message : "Failed to load admin payout queue.";
  }

  return (
    <PayoutsAdminClient
      initialQueue={initialQueue}
      initialError={initialError}
      initialFilter={initialFilter}
    />
  );
}
