import type { OrderRowRecord, OrderStatus, WorkerHistoryAttribution } from "@/lib/orders/transition-core";
import {
  executeOrderStatusTransitionCore,
  type UpdateOrderStatusInput,
  type UpdateOrderStatusResult,
} from "@/lib/orders/transition-core";
import type { ScanErrorCode, ScanOrderInput, ScanOrderResult } from "./types";

export const ORDER_SCAN_COLUMNS = [
  "id",
  "organizer_id",
  "business_id",
  "order_number",
  "status",
  "payment_method",
  "payment_status",
  "provider",
  "provider_reference",
  "customer_email",
  "customer_name",
  "fulfilment_type",
  "currency",
  "total_amount",
  "tracking_token",
  "website_id",
  "scheduled_for",
  "status_history",
  "estimated_ready_at",
  "rider_name",
  "rider_phone",
  "courier_worker_id",
] as const satisfies readonly (keyof OrderRowRecord | "organizer_id")[];

/**
 * Parse a Supabase order row into a typed OrderRowRecord. Returns null if the
 * data is malformed (missing required string fields), so the caller can decide
 * how to handle it (e.g. return "unavailable" without finalizing).
 *
 * ONE documented cast here: the result is cast to OrderRowRecord after the
 * field-type checks guarantee the shape. Every other call site must not cast.
 */
export function parseOrderRow(data: unknown): OrderRowRecord | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const requiredStrings = [
    "id",
    "status",
    "payment_method",
    "payment_status",
    "fulfilment_type",
    "customer_name",
    "order_number",
  ];
  for (const field of requiredStrings) {
    if (typeof row[field] !== "string") return null;
  }
  return row as unknown as OrderRowRecord;
}

function isTerminalSuccess(nextStatus: OrderStatus): boolean {
  return nextStatus === "completed" || nextStatus === "delivered";
}

type CoreErrorMapEntry = {
  reason: ScanErrorCode;
  shouldFinalize: boolean;
};

type CoreErrorMap = {
  [K in Extract<UpdateOrderStatusResult, { success: false }>["error"]]: CoreErrorMapEntry;
};

const CORE_ERROR_MAP: CoreErrorMap = {
  unauthorized: { reason: "not_found", shouldFinalize: true },
  forbidden: { reason: "not_found", shouldFinalize: true },
  not_found: { reason: "not_found", shouldFinalize: true },
  invalid_transition: { reason: "invalid_transition", shouldFinalize: true },
  order_already_updated: { reason: "status_changed", shouldFinalize: true },
  missing_ready_time: { reason: "invalid_transition", shouldFinalize: true },
  missing_cancellation_reason: { reason: "invalid_transition", shouldFinalize: true },
  missing_rider_name: { reason: "invalid_transition", shouldFinalize: true },
  invalid_rider_phone: { reason: "invalid_transition", shouldFinalize: true },
  payment_collection_required: { reason: "cash_confirmation_required", shouldFinalize: true },
  invalid_ready_time: { reason: "invalid_transition", shouldFinalize: true },
  online_payment_required: { reason: "payment_required", shouldFinalize: true },
  online_payment_cannot_be_manually_marked_paid: { reason: "payment_required", shouldFinalize: true },
  courier_already_on_delivery: { reason: "courier_required", shouldFinalize: true },
  db_error: { reason: "not_found", shouldFinalize: false },
  unexpected: { reason: "not_found", shouldFinalize: false },
};

function alreadyDone(targetStatus: OrderStatus): ScanOrderResult {
  return { ok: true, outcome: "already_done", fromStatus: targetStatus, toStatus: targetStatus, reason: null, paymentStatus: null, shouldFinalize: true };
}

function rejected(fromStatus: OrderStatus | null, reason: ScanErrorCode, shouldFinalize: boolean): ScanOrderResult {
  return { ok: false, outcome: "rejected", fromStatus, toStatus: null, reason, paymentStatus: null, shouldFinalize };
}

export async function runOrderScanAction(input: ScanOrderInput): Promise<ScanOrderResult> {
  const { admin, actor, order, organizerId, expectedBusinessId, action, cashCollected } = input;
  const fromStatus = order.status as OrderStatus;
  const fulfilment_type = order.fulfilment_type as "pickup" | "delivery" | "dine_in";
  const payment_method = order.payment_method;
  const payment_status = order.payment_status;

  // Determine target status per the edge matrix.
  let nextStatus: OrderStatus;
  let requireCourier = false;

  if (action === "pick_up") {
    if (fulfilment_type === "pickup" || fulfilment_type === "dine_in") {
      if (fromStatus !== "ready") {
        return fromStatus === "completed" ? alreadyDone("completed") : rejected(fromStatus, "invalid_transition", true);
      }
      nextStatus = "completed";
    } else if (fulfilment_type === "delivery") {
      if (fromStatus !== "ready") {
        return fromStatus === "picked_up" ? alreadyDone("picked_up") : rejected(fromStatus, "invalid_transition", true);
      }
      nextStatus = "picked_up";
      requireCourier = true;
    } else {
      return rejected(fromStatus, "fulfilment_not_supported", true);
    }
  } else if (action === "deliver") {
    if (fulfilment_type !== "delivery") {
      return rejected(fromStatus, "fulfilment_not_supported", true);
    }
    if (fromStatus !== "picked_up" && fromStatus !== "out_for_delivery") {
      return fromStatus === "delivered" ? alreadyDone("delivered") : rejected(fromStatus, "invalid_transition", true);
    }
    nextStatus = "delivered";
    requireCourier = true;
  } else {
    // refund and any action not valid for the code type: rejected/action_not_supported, no core call.
    return rejected(fromStatus, "action_not_supported", true);
  }

  // Courier rule: strict — actor.kind==="worker" AND order.courier_worker_id !== null AND === actor.workerId.
  // Business must also match: order.business_id === actor.businessId.
  if (requireCourier) {
    if (
      actor.kind !== "worker" ||
      !order.courier_worker_id ||
      order.courier_worker_id !== actor.workerId ||
      (order.business_id && actor.businessId && order.business_id !== actor.businessId)
    ) {
      return rejected(fromStatus, "courier_required", true);
    }
  }

  // Payment gate ONLY on completed/delivered terminal transitions.
  if (isTerminalSuccess(nextStatus) && payment_status !== "paid") {
    if (payment_method === "online") {
      return rejected(fromStatus, "payment_required", true);
    }
    if (!cashCollected) {
      return rejected(fromStatus, "cash_confirmation_required", true);
    }
  }

  // Execute through the core with CAS. Never set markPaymentCollected for online orders.
  const coreInput: UpdateOrderStatusInput = {
    orderId: order.id,
    organizerId,
    expectedCurrentStatus: fromStatus,
    nextStatus,
    historyNote: "Scanned",
    markPaymentCollected: payment_method !== "online" && cashCollected && payment_status !== "paid" && isTerminalSuccess(nextStatus),
  };

  const workerAttribution: WorkerHistoryAttribution | undefined =
    actor.kind === "worker" ? { workerId: actor.workerId, workerName: actor.workerName } : undefined;

  // supports174/supports175 gate migration-174/175 columns (not the select list).
  // Hardcoded true like the courier routes; requires migrations 174 and 175 applied.
  const result = await executeOrderStatusTransitionCore(
    coreInput,
    admin,
    actor.kind === "user" ? actor.userId : null,
    order,
    true,
    true,
    workerAttribution,
    [],
    expectedBusinessId ?? undefined,
  );

  if (result.success) {
    return {
      ok: true,
      outcome: "success",
      fromStatus,
      toStatus: result.nextStatus,
      reason: null,
      paymentStatus: result.paymentStatus ?? null,
      shouldFinalize: true,
    };
  }

  const errorResult = result as Extract<UpdateOrderStatusResult, { success: false }>;
  const mapping = CORE_ERROR_MAP[errorResult.error];

  if (errorResult.error === "order_already_updated") {
    // B1: Re-read the order status; never compare against the original order.status.
    const { data: reRead, error: reReadError } = await admin
      .from("orders")
      .select("status")
      .eq("id", order.id)
      .eq("organizer_id", organizerId)
      .maybeSingle();

    if (reReadError || !reRead) {
      return { ok: false, outcome: "error", fromStatus, toStatus: null, reason: null, paymentStatus: null, shouldFinalize: false };
    }

    const reReadStatus = reRead.status as OrderStatus;
    if (reReadStatus === nextStatus) {
      return alreadyDone(nextStatus);
    }
    return rejected(reReadStatus, "status_changed", true);
  }

  return {
    ok: false,
    outcome: mapping.shouldFinalize ? "rejected" : "error",
    fromStatus,
    toStatus: null,
    reason: mapping.reason,
    paymentStatus: null,
    shouldFinalize: mapping.shouldFinalize,
  };
}
