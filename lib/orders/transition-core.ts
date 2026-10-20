import "server-only";

import { revalidatePath } from "next/cache";
import type { createSupabaseAdmin } from "@/lib/supabase-admin";
import { dispatchCustomerOrderStatusEmail } from "@/lib/order-notifications";

export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "cancelled";

export type CancellationReasonCode = "out_of_stock" | "kitchen_closed" | "cannot_deliver_there" | "other";

export interface UpdateOrderStatusInput {
  orderId: string;
  organizerId: string;
  expectedCurrentStatus: OrderStatus;
  nextStatus: OrderStatus;
  estimatedReadyAt?: string | null;
  cancellationReason?: CancellationReasonCode | null;
  cancellationNote?: string | null;
  markPaymentCollected?: boolean;
  riderName?: string | null;
  riderPhone?: string | null;
}

export type UpdateOrderStatusResult =
  | {
      success: true;
      nextStatus: OrderStatus;
      paymentStatus?: string;
      warning?: "online_refund_required";
      providerReference?: string | null;
    }
  | {
      success: false;
      error:
        | "unauthorized"
        | "forbidden"
        | "not_found"
        | "invalid_transition"
        | "order_already_updated"
        | "missing_ready_time"
        | "missing_cancellation_reason"
        | "missing_rider_name"
        | "invalid_rider_phone"
        | "payment_collection_required"
        | "online_payment_cannot_be_manually_marked_paid"
        | "db_error"
        | "unexpected";
      message?: string;
    };

export interface OrderRowRecord {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  provider?: string | null;
  provider_reference?: string | null;
  customer_email?: string | null;
  customer_name: string;
  fulfilment_type: "pickup" | "delivery" | string;
  currency: string;
  total_amount: number;
  tracking_token: string;
  website_id?: string | null;
  status_history?: unknown;
  estimated_ready_at?: string | null;
  rider_name?: string | null;
  rider_phone?: string | null;
}

export interface WorkerHistoryAttribution {
  workerId: string;
  workerName: string;
}

type AdminClient = ReturnType<typeof createSupabaseAdmin>;

/**
 * Persists a status transition and performs its shared side effects. Manager
 * actions pass their authenticated user id; worker actions pass null plus a
 * worker snapshot. Callers remain responsible for authorization and transition
 * validation before invoking this server-only core.
 */
export async function executeOrderStatusTransitionCore(
  input: UpdateOrderStatusInput,
  admin: AdminClient,
  userId: string | null,
  order: OrderRowRecord,
  supports174Columns: boolean,
  supports175Columns = true,
  workerAttribution?: WorkerHistoryAttribution,
  additionalRevalidationPaths: string[] = [],
  expectedBusinessId?: string
): Promise<UpdateOrderStatusResult> {
  // Preserve the preflight conflict result; the update below also uses CAS.
  if (order.status !== input.expectedCurrentStatus) {
    return {
      success: false,
      error: "order_already_updated",
      message: "Order was already updated by another team member.",
    };
  }

  let nextPaymentStatus: string | undefined;
  const isTerminalSuccess = input.nextStatus === "completed" || input.nextStatus === "delivered";
  if (isTerminalSuccess && order.payment_status !== "paid") {
    if (order.payment_method === "online") {
      return {
        success: false,
        error: "online_payment_cannot_be_manually_marked_paid",
        message: "Unpaid online orders cannot be manually marked as paid.",
      };
    }
    if (!input.markPaymentCollected) {
      return {
        success: false,
        error: "payment_collection_required",
        message: "Please confirm that payment was collected before completing this order.",
      };
    }
    nextPaymentStatus = "paid";
  }

  const isPaidOnlineCancel =
    input.nextStatus === "cancelled" &&
    order.payment_method === "online" &&
    order.payment_status === "paid";

  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status: input.nextStatus,
    updated_at: nowIso,
  };

  if (nextPaymentStatus) updatePayload.payment_status = nextPaymentStatus;

  if (supports175Columns && input.nextStatus === "out_for_delivery") {
    if (input.riderName) updatePayload.rider_name = input.riderName.trim().slice(0, 80);
    if (input.riderPhone) updatePayload.rider_phone = input.riderPhone.trim().slice(0, 32);
  }

  if (supports174Columns) {
    const existingHistory = Array.isArray(order.status_history) ? (order.status_history as unknown[]) : [];
    const newHistoryEvent: Record<string, unknown> = {
      status: input.nextStatus,
      at: nowIso,
      by_user_id: userId,
      reason: input.cancellationReason ?? null,
      note: input.cancellationNote?.trim().slice(0, 300) || null,
      estimated_ready_at: input.estimatedReadyAt ?? order.estimated_ready_at ?? null,
      rider_name: input.riderName?.trim() ?? order.rider_name ?? null,
      rider_phone: input.riderPhone?.trim() ?? order.rider_phone ?? null,
    };
    if (workerAttribution) {
      newHistoryEvent.worker_id = workerAttribution.workerId;
      newHistoryEvent.worker_name = workerAttribution.workerName;
    }
    updatePayload.status_history = [...existingHistory, newHistoryEvent];

    if (input.nextStatus === "accepted" && input.estimatedReadyAt) {
      updatePayload.estimated_ready_at = input.estimatedReadyAt;
    }
    if (input.nextStatus === "cancelled") {
      updatePayload.cancellation_reason = input.cancellationReason;
    }
  }

  let updateQuery = admin
    .from("orders")
    .update(updatePayload)
    .eq("id", input.orderId)
    .eq("organizer_id", input.organizerId)
    .eq("status", input.expectedCurrentStatus);
  if (expectedBusinessId) updateQuery = updateQuery.eq("business_id", expectedBusinessId);
  const { data: updated, error: updateErr } = await updateQuery
    .select("id, status, payment_status")
    .maybeSingle();

  if (updateErr) {
    // Retry without 175 rider columns if they caused the error. Delivery
    // assignment must never report success if rider details were not persisted.
    if (supports175Columns) {
      if (input.nextStatus === "out_for_delivery") {
        return { success: false, error: "db_error", message: "Rider details could not be saved. Please try again." };
      }
      delete updatePayload.rider_name;
      delete updatePayload.rider_phone;
      let retry175Query = admin
        .from("orders")
        .update(updatePayload)
        .eq("id", input.orderId)
        .eq("organizer_id", input.organizerId)
        .eq("status", input.expectedCurrentStatus);
      if (expectedBusinessId) retry175Query = retry175Query.eq("business_id", expectedBusinessId);
      const { data: retry175, error: retry175Err } = await retry175Query
        .select("id, status, payment_status")
        .maybeSingle();

      if (retry175Err || !retry175) {
        const fallbackPayload: Record<string, unknown> = {
          status: input.nextStatus,
          updated_at: nowIso,
        };
        if (nextPaymentStatus) fallbackPayload.payment_status = nextPaymentStatus;
        let fallbackQuery = admin
          .from("orders")
          .update(fallbackPayload)
          .eq("id", input.orderId)
          .eq("organizer_id", input.organizerId)
          .eq("status", input.expectedCurrentStatus);
        if (expectedBusinessId) fallbackQuery = fallbackQuery.eq("business_id", expectedBusinessId);
        const { data: retryUpdated, error: retryErr } = await fallbackQuery
          .select("id, status, payment_status")
          .maybeSingle();

        if (retryErr || !retryUpdated) {
          return { success: false, error: "db_error", message: "Failed to update order status." };
        }
      }
    } else {
      return { success: false, error: "db_error", message: "Failed to update order status." };
    }
  } else if (!updated) {
    return {
      success: false,
      error: "order_already_updated",
      message: "Order was already updated by another team member.",
    };
  }

  for (const path of [`/dashboard/org/${input.organizerId}/orders`, ...additionalRevalidationPaths]) {
    try {
      revalidatePath(path);
    } catch {
      // Non-fatal outside request context (e.g. hermetic tests).
    }
  }

  const customerEmail = order.customer_email;
  const notifyStatuses = ["accepted", "ready", "out_for_delivery", "delivered", "cancelled"];
  if (customerEmail && notifyStatuses.includes(input.nextStatus)) {
    void (async () => {
      try {
        let slug = "";
        let timeZone = "Africa/Abidjan";
        if (order.website_id) {
          const { data: ws } = await admin
            .from("tenant_websites")
            .select("slug, metadata")
            .eq("id", order.website_id)
            .maybeSingle();
          if (ws?.slug) slug = ws.slug;
          const meta = ws?.metadata && typeof ws.metadata === "object" ? (ws.metadata as Record<string, unknown>) : {};
          if (typeof meta.timezone === "string") timeZone = meta.timezone;
        }

        if (slug) {
          await dispatchCustomerOrderStatusEmail({
            orderId: order.id,
            orderNumber: order.order_number,
            customerName: order.customer_name,
            customerEmail,
            status: input.nextStatus,
            fulfilmentType: order.fulfilment_type as "pickup" | "delivery",
            currency: order.currency,
            totalAmount: order.total_amount,
            trackingToken: order.tracking_token,
            websiteSlug: slug,
            estimatedReadyAt: input.estimatedReadyAt,
            cancellationReason: input.cancellationReason,
            cancellationNote: input.cancellationNote,
            riderName: input.riderName ?? order.rider_name,
            riderPhone: input.riderPhone ?? order.rider_phone,
            timeZone,
          });
        }
      } catch (notifyErr) {
        console.error("[updateOrderStatus] Failed to dispatch customer status email:", notifyErr);
      }
    })();
  }

  return {
    success: true,
    nextStatus: input.nextStatus,
    paymentStatus: nextPaymentStatus || order.payment_status,
    ...(isPaidOnlineCancel
      ? { warning: "online_refund_required" as const, providerReference: order.provider_reference }
      : {}),
  };
}
