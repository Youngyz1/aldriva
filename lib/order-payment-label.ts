/**
 * lib/order-payment-label.ts
 *
 * Pure read-time payment label for owner order rows (Phase 3, no cron):
 * online + paid = Paid; online + unpaid past payment_expires_at = Expired;
 * online + unpaid = Awaiting payment; anything else = To collect.
 */

export type OrderPaymentLabel = "paid" | "awaitingPayment" | "expired" | "toCollect";

export function resolveOrderPaymentLabel(order: {
  payment_method: string;
  payment_status: string;
  payment_expires_at: string | null;
}): OrderPaymentLabel {
  if (order.payment_status === "paid") return "paid";
  if (order.payment_method === "online") {
    if (order.payment_expires_at && new Date(order.payment_expires_at).getTime() <= Date.now()) {
      return "expired";
    }
    return "awaitingPayment";
  }
  return "toCollect";
}
