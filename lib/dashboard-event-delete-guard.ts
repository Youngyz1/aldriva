/**
 * Pure payment-history guard for event deletion. Kept separate from the
 * Supabase query in dashboard-delete.ts so the rule is directly testable.
 */

export type EventDeleteOrderRecord = {
  status?: string | null;
  total_amount?: unknown;
  stripe_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
};

function moneyValue(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function isEventDeleteBlockingOrder(order: EventDeleteOrderRecord): boolean {
  return (
    moneyValue(order.total_amount) > 0 ||
    order.status === "pending" ||
    order.status === "refunded" ||
    Boolean(order.stripe_session_id) ||
    Boolean(order.stripe_payment_intent_id)
  );
}

export function getEventDeleteBlockMessage(
  orders: readonly EventDeleteOrderRecord[]
): string | null {
  return orders.some(isEventDeleteBlockingOrder)
    ? "This event has paid, pending, or refunded ticket orders. Archive or unpublish it instead of deleting payment history."
    : null;
}
