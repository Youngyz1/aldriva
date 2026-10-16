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

export type DetailedPaymentBadgeKey =
  | "paidOnline"
  | "payOnPickup"
  | "payOnDelivery"
  | "awaitingPayment"
  | "expired"
  | "paid";

export function resolveDetailedPaymentBadge(order: {
  payment_method: string;
  payment_status: string;
  payment_expires_at?: string | null;
  fulfilment_type?: string;
}): DetailedPaymentBadgeKey {
  if (order.payment_status === "paid") {
    return order.payment_method === "online" ? "paidOnline" : "paid";
  }
  if (order.payment_method === "online") {
    if (order.payment_expires_at && new Date(order.payment_expires_at).getTime() <= Date.now()) {
      return "expired";
    }
    return "awaitingPayment";
  }
  if (order.fulfilment_type === "delivery") {
    return "payOnDelivery";
  }
  return "payOnPickup";
}
