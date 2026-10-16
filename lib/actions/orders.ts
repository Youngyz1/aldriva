"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  submitOrderRequestWithClient,
  type OrderItemInput,
  type SubmitOrderRequestInput,
  type SubmitOrderResult,
} from "@/lib/order-submit";
import { dispatchCustomerOrderStatusEmail } from "@/lib/order-notifications";

export type { OrderItemInput, SubmitOrderRequestInput, SubmitOrderResult };

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

const PICKUP_TRANSITION_GRAPH: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  out_for_delivery: [],
  delivered: [],
  completed: [],
  cancelled: [],
};

const DELIVERY_TRANSITION_GRAPH: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  completed: [],
  cancelled: [],
};

const CANCELLATION_REASONS: readonly CancellationReasonCode[] = [
  "out_of_stock",
  "kitchen_closed",
  "cannot_deliver_there",
  "other",
] as const;

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

export interface AdjustEstimatedReadyTimeInput {
  orderId: string;
  organizerId: string;
  newEstimatedReadyAt: string;
  note?: string | null;
}

export type AdjustEstimatedReadyTimeResult =
  | {
      success: true;
      estimatedReadyAt: string;
    }
  | {
      success: false;
      error: "unauthorized" | "forbidden" | "not_found" | "invalid_status" | "invalid_time" | "db_error" | "unexpected";
      message?: string;
    };

/**
 * Server-side order request submission for guest storefront checkout.
 */
export async function submitOrderRequest(
  input: SubmitOrderRequestInput
): Promise<SubmitOrderResult> {
  const admin = createSupabaseAdmin();
  return submitOrderRequestWithClient(input, admin);
}

/**
 * Server action to update an order's operational lifecycle status.
 * Re-checks roles (owner, admin, manager only), enforces the state graph,
 * handles optimistic concurrency, records status history, and dispatches customer emails.
 */
export async function updateOrderStatus(
  input: UpdateOrderStatusInput
): Promise<UpdateOrderStatusResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized", message: "You must be signed in." };
  }

  const access = await checkTenantAccess(user.id, input.organizerId, ["owner", "admin", "manager"]);
  if (!access.hasAccess) {
    return { success: false, error: "forbidden", message: "Only owners, admins, and managers can update order status." };
  }

  const admin = createSupabaseAdmin();
  return updateOrderStatusWithClient(input, admin, user.id);
}

/**
 * Core testable implementation for status update.
 */
export async function updateOrderStatusWithClient(
  input: UpdateOrderStatusInput,
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<UpdateOrderStatusResult> {
  try {
    // 1. Fetch current order row (scoped strictly to organizer_id)
    const { data: order, error: fetchErr } = await admin
      .from("orders")
      .select(
        "id, order_number, status, payment_method, payment_status, provider, provider_reference, customer_email, customer_name, fulfilment_type, currency, total_amount, tracking_token, website_id, status_history, estimated_ready_at, rider_name, rider_phone"
      )
      .eq("id", input.orderId)
      .eq("organizer_id", input.organizerId)
      .maybeSingle();

    let targetOrder: OrderRowRecord | null = order
      ? ({ ...order } as unknown as OrderRowRecord)
      : null;
    let supports174 = true;
    let supports175 = true;

    if (fetchErr) {
      // Fallback 1: without migration 175 columns (rider_name, rider_phone)
      const { data: fallback174, error: err174 } = await admin
        .from("orders")
        .select(
          "id, order_number, status, payment_method, payment_status, provider, provider_reference, customer_email, customer_name, fulfilment_type, currency, total_amount, tracking_token, website_id, status_history, estimated_ready_at"
        )
        .eq("id", input.orderId)
        .eq("organizer_id", input.organizerId)
        .maybeSingle();

      if (err174) {
        // Fallback 2: without migration 174 columns
        const { data: fallbackBase, error: errBase } = await admin
          .from("orders")
          .select(
            "id, order_number, status, payment_method, payment_status, provider, provider_reference, customer_email, customer_name, fulfilment_type, currency, total_amount, tracking_token, website_id"
          )
          .eq("id", input.orderId)
          .eq("organizer_id", input.organizerId)
          .maybeSingle();

        if (errBase || !fallbackBase) {
          return { success: false, error: "not_found", message: "Order not found." };
        }
        targetOrder = { ...fallbackBase } as unknown as OrderRowRecord;
        supports174 = false;
        supports175 = false;
      } else if (fallback174) {
        targetOrder = { ...fallback174 } as unknown as OrderRowRecord;
        supports174 = true;
        supports175 = false;
      } else {
        return { success: false, error: "not_found", message: "Order not found." };
      }
    }

    if (!targetOrder) {
      return { success: false, error: "not_found", message: "Order not found." };
    }

    // 2. Fulfilment-aware transition graph check
    const isDelivery = targetOrder.fulfilment_type === "delivery";
    const graph = isDelivery ? DELIVERY_TRANSITION_GRAPH : PICKUP_TRANSITION_GRAPH;
    const allowed = graph[input.expectedCurrentStatus] || [];

    if (!allowed.includes(input.nextStatus)) {
      return {
        success: false,
        error: "invalid_transition",
        message: `Cannot transition ${targetOrder.fulfilment_type} order from "${input.expectedCurrentStatus}" to "${input.nextStatus}".`,
      };
    }

    // 3. Accept requires estimated ready time
    if (input.nextStatus === "accepted") {
      if (!input.estimatedReadyAt || isNaN(new Date(input.estimatedReadyAt).getTime())) {
        return {
          success: false,
          error: "missing_ready_time",
          message: "Estimated ready time is required to accept an order.",
        };
      }
    }

    // 4. Moving to out_for_delivery requires rider_name (required) and rider_phone (optional but validated)
    if (input.nextStatus === "out_for_delivery") {
      if (!input.riderName || !input.riderName.trim()) {
        return {
          success: false,
          error: "missing_rider_name",
          message: "Rider name is required when marking an order out for delivery.",
        };
      }
      if (input.riderPhone && input.riderPhone.trim()) {
        const cleanPhone = input.riderPhone.trim().replace(/[\s\-\(\)\.]/g, "");
        if (cleanPhone.length < 8 || cleanPhone.length > 20) {
          return {
            success: false,
            error: "invalid_rider_phone",
            message: "Rider phone number format is invalid.",
          };
        }
      }
    }

    // 5. Cancel requires reason
    if (input.nextStatus === "cancelled") {
      if (!input.cancellationReason || !CANCELLATION_REASONS.includes(input.cancellationReason)) {
        return {
          success: false,
          error: "missing_cancellation_reason",
          message: "A valid cancellation reason is required.",
        };
      }
    }

    return executeUpdateOnRow(input, admin, userId, targetOrder, supports174, supports175);
  } catch (err) {
    console.error("[updateOrderStatus] Unexpected error:", err instanceof Error ? err.name : "unknown");
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}

interface OrderRowRecord {
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

async function executeUpdateOnRow(
  input: UpdateOrderStatusInput,
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  order: OrderRowRecord,
  supports174Columns: boolean,
  supports175Columns: boolean = true
): Promise<UpdateOrderStatusResult> {
  // Concurrency check
  if (order.status !== input.expectedCurrentStatus) {
    return {
      success: false,
      error: "order_already_updated",
      message: "Order was already updated by another team member.",
    };
  }

  // Payment completion / delivery guard
  let nextPaymentStatus: string | undefined = undefined;
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

  let updatePayload: Record<string, unknown> = {
    status: input.nextStatus,
    updated_at: nowIso,
  };

  if (nextPaymentStatus) {
    updatePayload.payment_status = nextPaymentStatus;
  }

  if (supports175Columns) {
    if (input.nextStatus === "out_for_delivery") {
      if (input.riderName) updatePayload.rider_name = input.riderName.trim().slice(0, 80);
      if (input.riderPhone) updatePayload.rider_phone = input.riderPhone.trim().slice(0, 32);
    }
  }

  if (supports174Columns) {
    const existingHistory = Array.isArray(order.status_history) ? (order.status_history as unknown[]) : [];
    const newHistoryEvent = {
      status: input.nextStatus,
      at: nowIso,
      by_user_id: userId,
      reason: input.cancellationReason ?? null,
      note: input.cancellationNote?.trim().slice(0, 300) || null,
      estimated_ready_at: input.estimatedReadyAt ?? order.estimated_ready_at ?? null,
      rider_name: input.riderName?.trim() ?? order.rider_name ?? null,
      rider_phone: input.riderPhone?.trim() ?? order.rider_phone ?? null,
    };
    updatePayload.status_history = [...existingHistory, newHistoryEvent];

    if (input.nextStatus === "accepted" && input.estimatedReadyAt) {
      updatePayload.estimated_ready_at = input.estimatedReadyAt;
    }
    if (input.nextStatus === "cancelled") {
      updatePayload.cancellation_reason = input.cancellationReason;
    }
  }

  const { data: updated, error: updateErr } = await admin
    .from("orders")
    .update(updatePayload)
    .eq("id", input.orderId)
    .eq("organizer_id", input.organizerId)
    .eq("status", input.expectedCurrentStatus)
    .select("id, status, payment_status")
    .maybeSingle();

  if (updateErr) {
    // Retry without 175 rider columns if they caused the error.
    // Exception: an out_for_delivery transition REQUIRES persisted rider
    // details — a save that drops them must report failure, never success.
    if (supports175Columns) {
      if (input.nextStatus === "out_for_delivery") {
        return { success: false, error: "db_error", message: "Rider details could not be saved. Please try again." };
      }
      delete updatePayload.rider_name;
      delete updatePayload.rider_phone;
      const { data: retry175, error: retry175Err } = await admin
        .from("orders")
        .update(updatePayload)
        .eq("id", input.orderId)
        .eq("organizer_id", input.organizerId)
        .eq("status", input.expectedCurrentStatus)
        .select("id, status, payment_status")
        .maybeSingle();

      if (retry175Err || !retry175) {
        // Fallback to base
        const fallbackPayload: Record<string, unknown> = {
          status: input.nextStatus,
          updated_at: nowIso,
        };
        if (nextPaymentStatus) fallbackPayload.payment_status = nextPaymentStatus;
        const { data: retryUpdated, error: retryErr } = await admin
          .from("orders")
          .update(fallbackPayload)
          .eq("id", input.orderId)
          .eq("organizer_id", input.organizerId)
          .eq("status", input.expectedCurrentStatus)
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

  try {
    revalidatePath(`/dashboard/org/${input.organizerId}/orders`);
  } catch {
    // Non-fatal outside request context (e.g. hermetic tests)
  }

  // Customer status email notification (fire-and-forget, non-blocking)
  const customerEmail = order.customer_email;
  const notifyStatuses = ["accepted", "ready", "out_for_delivery", "delivered", "cancelled"];
  if (customerEmail && notifyStatuses.includes(input.nextStatus)) {
    (async () => {
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

/**
 * Adjust the estimated ready time for an order already in accepted or preparing status.
 */
export async function adjustEstimatedReadyTime(
  input: AdjustEstimatedReadyTimeInput
): Promise<AdjustEstimatedReadyTimeResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized", message: "You must be signed in." };
  }

  const access = await checkTenantAccess(user.id, input.organizerId, ["owner", "admin", "manager"]);
  if (!access.hasAccess) {
    return { success: false, error: "forbidden", message: "Only owners, admins, and managers can adjust prep time." };
  }

  const admin = createSupabaseAdmin();
  return adjustEstimatedReadyTimeWithClient(input, admin, user.id);
}

export async function adjustEstimatedReadyTimeWithClient(
  input: AdjustEstimatedReadyTimeInput,
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<AdjustEstimatedReadyTimeResult> {
  try {
    const readyDate = new Date(input.newEstimatedReadyAt);
    if (isNaN(readyDate.getTime())) {
      return { success: false, error: "invalid_time", message: "Invalid date format." };
    }

    const { data: order, error: fetchErr } = await admin
      .from("orders")
      .select("id, status, status_history, website_id, customer_email, order_number, customer_name, fulfilment_type, currency, total_amount, tracking_token")
      .eq("id", input.orderId)
      .eq("organizer_id", input.organizerId)
      .maybeSingle();

    if (fetchErr || !order) {
      return { success: false, error: "not_found", message: "Order not found." };
    }

    if (order.status !== "accepted" && order.status !== "preparing") {
      return { success: false, error: "invalid_status", message: "Prep time can only be adjusted for accepted or preparing orders." };
    }

    const nowIso = new Date().toISOString();
    const existingHistory = Array.isArray(order.status_history) ? (order.status_history as unknown[]) : [];
    const newHistoryEvent = {
      status: order.status,
      at: nowIso,
      by_user_id: userId,
      note: input.note?.trim().slice(0, 300) || "Adjusted ready time",
      estimated_ready_at: input.newEstimatedReadyAt,
    };

    const { error: updateErr } = await admin
      .from("orders")
      .update({
        estimated_ready_at: input.newEstimatedReadyAt,
        status_history: [...existingHistory, newHistoryEvent],
        updated_at: nowIso,
      })
      .eq("id", input.orderId)
      .eq("organizer_id", input.organizerId);

    if (updateErr) {
      return { success: false, error: "db_error", message: "Failed to update estimated ready time." };
    }

    try {
      revalidatePath(`/dashboard/org/${input.organizerId}/orders`);
    } catch {
      // Non-fatal
    }

    return { success: true, estimatedReadyAt: input.newEstimatedReadyAt };
  } catch {
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}

export interface UpdateRiderDetailsInput {
  orderId: string;
  organizerId: string;
  riderName: string;
  riderPhone?: string | null;
}

export type UpdateRiderDetailsResult =
  | { success: true; riderName: string; riderPhone: string | null }
  | { success: false; error: "unauthorized" | "forbidden" | "not_found" | "invalid_status" | "missing_rider_name" | "invalid_rider_phone" | "db_error" | "unexpected"; message?: string };

/**
 * Edit rider details while order is out_for_delivery.
 */
export async function updateRiderDetails(
  input: UpdateRiderDetailsInput
): Promise<UpdateRiderDetailsResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized", message: "You must be signed in." };
  }

  const access = await checkTenantAccess(user.id, input.organizerId, ["owner", "admin", "manager"]);
  if (!access.hasAccess) {
    return { success: false, error: "forbidden", message: "Only owners, admins, and managers can update rider details." };
  }

  const admin = createSupabaseAdmin();
  return updateRiderDetailsWithClient(input, admin, user.id);
}

export async function updateRiderDetailsWithClient(
  input: UpdateRiderDetailsInput,
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<UpdateRiderDetailsResult> {
  try {
    if (!input.riderName || !input.riderName.trim()) {
      return { success: false, error: "missing_rider_name", message: "Rider name is required." };
    }

    if (input.riderPhone && input.riderPhone.trim()) {
      const cleanPhone = input.riderPhone.trim().replace(/[\s\-\(\)\.]/g, "");
      if (cleanPhone.length < 8 || cleanPhone.length > 20) {
        return { success: false, error: "invalid_rider_phone", message: "Rider phone number format is invalid." };
      }
    }

    const { data: order, error: fetchErr } = await admin
      .from("orders")
      .select("id, status, status_history, rider_name, rider_phone")
      .eq("id", input.orderId)
      .eq("organizer_id", input.organizerId)
      .maybeSingle();

    if (fetchErr || !order) {
      return { success: false, error: "not_found", message: "Order not found." };
    }

    if (order.status !== "out_for_delivery") {
      return { success: false, error: "invalid_status", message: "Rider details can only be edited while out for delivery." };
    }

    const nowIso = new Date().toISOString();
    const existingHistory = Array.isArray(order.status_history) ? (order.status_history as unknown[]) : [];
    const newHistoryEvent = {
      status: "out_for_delivery",
      at: nowIso,
      by_user_id: userId,
      note: "Updated rider details",
      rider_name: input.riderName.trim(),
      rider_phone: input.riderPhone?.trim() || null,
    };

    const { error: updateErr } = await admin
      .from("orders")
      .update({
        rider_name: input.riderName.trim().slice(0, 80),
        rider_phone: input.riderPhone?.trim().slice(0, 32) || null,
        status_history: [...existingHistory, newHistoryEvent],
        updated_at: nowIso,
      })
      .eq("id", input.orderId)
      .eq("organizer_id", input.organizerId);

    if (updateErr) {
      return { success: false, error: "db_error", message: "Failed to update rider details." };
    }

    try {
      revalidatePath(`/dashboard/org/${input.organizerId}/orders`);
    } catch {
      // Non-fatal
    }

    return {
      success: true,
      riderName: input.riderName.trim(),
      riderPhone: input.riderPhone?.trim() || null,
    };
  } catch {
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}

export interface SaveDeliverySettingsInput {
  organizerId: string;
  websiteId: string;
  fee: number;
  free_above?: number | null;
  courier_whatsapp?: string | null;
}

export type SaveDeliverySettingsResult =
  | { success: true }
  | { success: false; error: "unauthorized" | "forbidden" | "not_found" | "no_website" | "validation_error" | "db_error" | "unexpected"; message?: string };

/**
 * Saves delivery settings with merge-safe jsonb update preserving all other metadata keys.
 */
export async function saveDeliverySettings(
  input: SaveDeliverySettingsInput
): Promise<SaveDeliverySettingsResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized", message: "You must be signed in." };
  }

  const access = await checkTenantAccess(user.id, input.organizerId, ["owner", "admin", "manager"]);
  if (!access.hasAccess) {
    return { success: false, error: "forbidden", message: "Only owners, admins, and managers can update delivery settings." };
  }

  const admin = createSupabaseAdmin();
  return saveDeliverySettingsWithClient(input, admin);
}

export async function saveDeliverySettingsWithClient(
  input: SaveDeliverySettingsInput,
  admin: ReturnType<typeof createSupabaseAdmin>
): Promise<SaveDeliverySettingsResult> {
  try {
    // 1. Fetch current website metadata, scoped by tenant_id — the canonical
    // tenant column on tenant_websites (same pattern as the Orders page,
    // overview, tracking route, and order-submit). Never organizer_id:
    // that column does not exist and the lookup misses every org.
    const { data: website, error: fetchErr } = await admin
      .from("tenant_websites")
      .select("id, tenant_id, metadata")
      .eq("id", input.websiteId)
      .eq("tenant_id", input.organizerId)
      .maybeSingle();

    if (fetchErr) {
      return { success: false, error: "db_error", message: "Failed to load website. Please try again." };
    }

    if (!website) {
      return { success: false, error: "no_website", message: "Create your website first to configure delivery." };
    }

    // 2. Pure validation
    const { validateDeliverySettings } = await import("@/lib/delivery-settings");
    const valResult = validateDeliverySettings({
      fee: input.fee,
      free_above: input.free_above,
      courier_whatsapp: input.courier_whatsapp,
    });

    if (!valResult.valid) {
      return { success: false, error: "validation_error", message: valResult.error };
    }

    // 3. Merge-safe update: Preserve root metadata and storefront keys
    const currentMeta = website.metadata && typeof website.metadata === "object" && !Array.isArray(website.metadata)
      ? (website.metadata as Record<string, unknown>)
      : {};

    const currentStorefront = currentMeta.storefront && typeof currentMeta.storefront === "object" && !Array.isArray(currentMeta.storefront)
      ? (currentMeta.storefront as Record<string, unknown>)
      : {};

    const mergedMetadata: Record<string, unknown> = {
      ...currentMeta,
      storefront: {
        ...currentStorefront,
        delivery: {
          fee: valResult.settings.fee,
          free_above: valResult.settings.free_above,
          courier_whatsapp: valResult.settings.courier_whatsapp,
        },
      },
    };

    const { error: updateErr } = await admin
      .from("tenant_websites")
      .update({ metadata: mergedMetadata })
      .eq("id", input.websiteId)
      .eq("tenant_id", input.organizerId);

    if (updateErr) {
      return { success: false, error: "db_error", message: "Failed to save delivery settings." };
    }

    try {
      revalidatePath(`/dashboard/org/${input.organizerId}/orders`);
      revalidatePath(`/dashboard/org/${input.organizerId}/overview`);
    } catch {
      // Non-fatal
    }

    return { success: true };
  } catch {
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}
