/**
 * lib/order-overdue.ts
 *
 * Pure, render-time calculation for order overdue highlighting.
 * No cron, no background process.
 *
 * Rules:
 * - Pending orders: Overdue if created more than 10 minutes ago.
 * - Accepted / Preparing orders: Overdue if current time is past estimated_ready_at.
 * - Ready / Completed / Cancelled: Never overdue.
 */

export type OrderOverdueReason = "pending_timeout" | "past_promised_time" | "waiting_for_courier" | null;

export interface OrderOverdueResult {
  isOverdue: boolean;
  minutesLate: number;
  reason: OrderOverdueReason;
  isWaitingForCourier?: boolean;
  waitingMinutes?: number;
}

export function computeOrderOverdue(
  order: {
    status: string;
    fulfilment_type?: string | null;
    created_at?: string;
    updated_at?: string;
    estimated_ready_at?: string | null;
    status_history?: unknown;
  },
  now: Date = new Date()
): OrderOverdueResult {
  const nowMs = now.getTime();

  if (order.status === "pending") {
    if (!order.created_at) return { isOverdue: false, minutesLate: 0, reason: null };
    const createdMs = new Date(order.created_at).getTime();
    if (isNaN(createdMs)) return { isOverdue: false, minutesLate: 0, reason: null };
    const diffMin = Math.floor((nowMs - createdMs) / 60000);
    if (diffMin > 10) {
      return { isOverdue: true, minutesLate: diffMin - 10, reason: "pending_timeout" };
    }
    return { isOverdue: false, minutesLate: 0, reason: null };
  }

  if (order.status === "accepted" || order.status === "preparing") {
    if (!order.estimated_ready_at) {
      return { isOverdue: false, minutesLate: 0, reason: null };
    }
    const readyMs = new Date(order.estimated_ready_at).getTime();
    if (isNaN(readyMs)) return { isOverdue: false, minutesLate: 0, reason: null };
    if (nowMs > readyMs) {
      const diffMin = Math.floor((nowMs - readyMs) / 60000);
      return { isOverdue: true, minutesLate: Math.max(1, diffMin), reason: "past_promised_time" };
    }
    return { isOverdue: false, minutesLate: 0, reason: null };
  }

  if (order.status === "ready" && order.fulfilment_type === "delivery") {
    let readyAtIso: string | undefined = undefined;
    if (Array.isArray(order.status_history)) {
      const historyEntry = (order.status_history as Array<{ status?: string; at?: string }>).find(
        (h) => h && h.status === "ready" && h.at
      );
      if (historyEntry?.at) {
        readyAtIso = historyEntry.at;
      }
    }
    if (!readyAtIso && order.updated_at) {
      readyAtIso = order.updated_at;
    }

    if (readyAtIso) {
      const readyAtMs = new Date(readyAtIso).getTime();
      if (!isNaN(readyAtMs)) {
        const diffMin = Math.floor((nowMs - readyAtMs) / 60000);
        if (diffMin > 20) {
          return {
            isOverdue: false,
            minutesLate: 0,
            reason: "waiting_for_courier",
            isWaitingForCourier: true,
            waitingMinutes: diffMin,
          };
        }
      }
    }
  }

  return { isOverdue: false, minutesLate: 0, reason: null };
}
