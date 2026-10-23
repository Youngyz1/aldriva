"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  submitOrderRequestWithClient,
  type OrderItemInput,
  type SubmitOrderRequestInput,
  type SubmitOrderResult,
} from "@/lib/order-submit";
import { checkRateLimit } from "@/lib/rate-limit";
import { calculatePromotionCartPricing, MAX_LINE_QUANTITY, resolveItemOptionGroups, validateSelection, type MenuPricingItem, type MenuItemOptionGroup, type NormalizedOptionAssignmentRow, type OptionGroupSelection } from "@/lib/menu-pricing";
import { loadMenuPromotions } from "@/lib/menu-promotion-data";
import { isMissingMenuOptionSchema, warnMissingMenuOptionSchemaOnce } from "@/lib/menu-option-schema";
import { resolveStorefrontCurrency } from "@/lib/website-v2-theme";
import {
  executeOrderStatusTransitionCore,
  type OrderRowRecord,
  type OrderStatus,
  type CancellationReasonCode,
  type UpdateOrderStatusInput,
  type UpdateOrderStatusResult,
} from "@/lib/orders/transition-core";

export type { OrderItemInput, SubmitOrderRequestInput, SubmitOrderResult };
export type { OrderStatus, CancellationReasonCode, UpdateOrderStatusInput, UpdateOrderStatusResult } from "@/lib/orders/transition-core";

const PICKUP_TRANSITION_GRAPH: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  picked_up: [],
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
  picked_up: ["out_for_delivery", "delivered", "cancelled"],
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

export interface ValidatePromoCodeLine {
  lineIndex: number;
  itemId: string;
  name: string;
  unitPrice: number;
  optionsDelta: number;
  lineTotal: number;
  originalUnitPrice: number;
  discountPerUnit: number;
  promotionName: string | null;
}

export type ValidatePromoCodeResult =
  | { success: true; valid: true; subtotal: number; lines: ValidatePromoCodeLine[]; freeDeliveryPromotionApplied: boolean }
  | { success: true; valid: false; message: string }
  | { success: false; error: "rate_limited" | "invalid_cart" | "unavailable"; message: string };

const INVALID_PROMO_CODE_MESSAGE = "This promo code is invalid or cannot be applied to this order.";

/** Public code validation. Input contains menu references and choices only; all prices are loaded here. */
export async function validatePromoCode(
  slug: string,
  code: string,
  cartLines: OrderItemInput[]
): Promise<ValidatePromoCodeResult> {
  const invalidCode = (): ValidatePromoCodeResult => ({ success: true, valid: false, message: INVALID_PROMO_CODE_MESSAGE });
  try {
    const rawCode = typeof code === "string" ? code.trim() : "";
    if (rawCode && !/^[A-Za-z0-9_-]{3,40}$/.test(rawCode)) return invalidCode();
    if (!Array.isArray(cartLines) || cartLines.length < 1 || cartLines.length > 50 || cartLines.some((line) =>
      !line || typeof line.itemId !== "string" || !line.itemId || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY
    )) {
      return { success: false, error: "invalid_cart", message: "Please review the items in your order and try again." };
    }

    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ip = headerList.get("x-real-ip") || (forwarded ? forwarded.split(",")[0]?.trim() : null) || "unknown";
    const ipLimit = await checkRateLimit("orderRequestIp", `ip:${ip}`);
    if (!ipLimit.allowed) return { success: false, error: "rate_limited", message: "Too many requests. Please wait a moment." };

    const admin = createSupabaseAdmin();
    const { data: website, error: websiteError } = await admin.from("tenant_websites")
      .select("id, slug, status, tenant_id, metadata").eq("slug", slug).maybeSingle();
    if (websiteError || !website || website.status !== "published" || !website.tenant_id) return invalidCode();
    const organizerId = website.tenant_id as string;
    const { data: business } = await admin.from("businesses").select("country")
      .eq("organizer_id", organizerId).order("created_at", { ascending: true }).limit(1).maybeSingle();
    const itemIds = [...new Set(cartLines.map((line) => line.itemId))];
    const loadItems = (includeOptionsSource: boolean) => admin.from("menu_items")
      .select(`id, section_id, name, price, promo_price, is_active, is_sold_out, option_groups, organizer_id, created_at${includeOptionsSource ? ", options_source" : ""}`)
      .eq("organizer_id", organizerId).in("id", itemIds);
    let normalizedSchemaAvailable = true;
    let itemResult = await loadItems(true);
    if (itemResult.error && isMissingMenuOptionSchema(itemResult.error)) {
      warnMissingMenuOptionSchemaOnce("validatePromoCode", itemResult.error);
      normalizedSchemaAvailable = false;
      itemResult = await loadItems(false) as typeof itemResult;
    }
    if (itemResult.error || !Array.isArray(itemResult.data)) return invalidCode();
    const itemsById = new Map(itemResult.data.map((item: any) => [item.id, item]));
    let assignments: NormalizedOptionAssignmentRow[] = [];
    if (normalizedSchemaAvailable) {
      const assignmentResult = await admin.from("menu_item_option_groups")
        .select("id, organizer_id, item_id, group_id, position, hidden_option_ids, price_overrides")
        .in("item_id", itemIds);
      if (assignmentResult.error && isMissingMenuOptionSchema(assignmentResult.error)) {
        warnMissingMenuOptionSchemaOnce("validatePromoCode", assignmentResult.error);
        normalizedSchemaAvailable = false;
      } else if (assignmentResult.error) {
        return invalidCode();
      } else {
        assignments = (assignmentResult.data || []) as NormalizedOptionAssignmentRow[];
      }
    }
    const groupIds = [...new Set(assignments.map((row) => row.group_id).filter(Boolean))];
    const groupsById = new Map<string, any>();
    const optionsByGroupId = new Map<string, any[]>();
    if (normalizedSchemaAvailable && groupIds.length > 0) {
      const [groupsResult, optionsResult] = await Promise.all([
        admin.from("menu_option_groups").select("id, organizer_id, name, kind, min_select, max_select, is_required, position, is_active").in("id", groupIds).eq("is_active", true),
        admin.from("menu_options").select("id, group_id, organizer_id, name, description, price, image_url, is_default, max_qty, is_available, allergens, position").in("group_id", groupIds).eq("is_available", true),
      ]);
      const missingSchema = [groupsResult.error, optionsResult.error].find(isMissingMenuOptionSchema);
      if (missingSchema) {
        warnMissingMenuOptionSchemaOnce("validatePromoCode", missingSchema);
        normalizedSchemaAvailable = false;
        assignments = [];
      } else if (groupsResult.error || optionsResult.error) {
        return invalidCode();
      } else {
        for (const group of groupsResult.data || []) groupsById.set(group.id, group);
        for (const option of optionsResult.data || []) {
          const options = optionsByGroupId.get(option.group_id) || [];
          options.push(option);
          optionsByGroupId.set(option.group_id, options);
        }
      }
    }
    const assignmentsByItem = new Map<string, NormalizedOptionAssignmentRow[]>();
    for (const assignment of assignments) {
      const group = groupsById.get(assignment.group_id);
      const list = assignmentsByItem.get(assignment.item_id) || [];
      list.push({ ...assignment, group: group ? { ...group, options: optionsByGroupId.get(group.id) || [] } : null });
      assignmentsByItem.set(assignment.item_id, list);
    }

    const pricingLines: Array<{ item: MenuPricingItem; selection: OptionGroupSelection[]; quantity: number }> = [];
    for (const line of cartLines) {
      const item = itemsById.get(line.itemId) as any;
      if (!item || !item.is_active || item.is_sold_out) return invalidCode();
      const groups = resolveItemOptionGroups({
        ...item,
        id: item.id,
        price: Number(item.price),
        options_source: normalizedSchemaAvailable ? item.options_source : "json",
        option_groups: Array.isArray(item.option_groups) ? item.option_groups : [],
      }, normalizedSchemaAvailable ? assignmentsByItem.get(item.id) || [] : []) as MenuItemOptionGroup[];
      const selectedIds = Array.isArray(line.selectedOptionIds) ? line.selectedOptionIds : [];
      const requested: Array<{ groupId?: string; optionId: string; qty: number }> = Array.isArray(line.selectedOptions)
        ? line.selectedOptions
        : selectedIds.map((optionId) => ({ optionId, qty: 1 }));
      if (Array.isArray(line.selectedOptions) && line.selectedOptionIds !== undefined) {
        const actualIds = requested.map((entry) => entry.optionId).sort();
        const expectedIds = [...selectedIds].sort();
        if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) return invalidCode();
      }
      const byGroup = new Map<string, Array<{ optionId: string; qty: number }>>();
      for (const selected of requested) {
        const matches = groups.filter((group) => (!selected.groupId || group.id === selected.groupId) && group.options.some((option) => option.id === selected.optionId));
        if (matches.length !== 1) return invalidCode();
        const list = byGroup.get(matches[0].id) || [];
        list.push({ optionId: selected.optionId, qty: selected.qty });
        byGroup.set(matches[0].id, list);
      }
      const selection = groups.map((group) => {
        const selected = byGroup.get(group.id) || [];
        return { groupId: group.id, optionIds: selected.map((entry) => entry.optionId), selectedOptions: selected };
      }).filter((entry) => entry.optionIds.length > 0);
      const itemPricing: MenuPricingItem = {
        id: item.id, organizer_id: organizerId, section_id: item.section_id, created_at: item.created_at,
        price: Number(item.price), promo_price: item.promo_price != null ? Number(item.promo_price) : null,
        is_active: true, is_sold_out: false, option_groups: groups,
      };
      if (!validateSelection(itemPricing, selection).valid) return invalidCode();
      pricingLines.push({ item: itemPricing, selection, quantity: line.quantity });
    }

    const promotionLoad = await loadMenuPromotions(admin, organizerId, { includeCodes: true, status: "active", context: "validatePromoCode" });
    if (promotionLoad.error) return invalidCode();
    const now = new Date();
    const currency = resolveStorefrontCurrency(website.metadata, business?.country ?? null);
    const pricing = calculatePromotionCartPricing(pricingLines, promotionLoad.promotions, { code: rawCode ? rawCode.toUpperCase() : null, now, currency, organizerId });
    if (!pricing.validCode) return invalidCode();
    return {
      success: true,
      valid: true,
      subtotal: pricing.subtotal,
      freeDeliveryPromotionApplied: pricing.lines.some((line) => line.appliedPromotion?.offer_type === "free_delivery"),
      lines: pricing.lines.map((line, index) => ({
        lineIndex: index,
        itemId: pricingLines[index].item.id || cartLines[index].itemId,
        name: (itemsById.get(cartLines[index].itemId) as any).name,
        unitPrice: line.unitPrice,
        optionsDelta: line.optionsDelta,
        lineTotal: line.lineTotal,
        originalUnitPrice: line.originalPrice ?? line.unitPrice,
        discountPerUnit: line.discountPerUnit ?? 0,
        promotionName: line.appliedPromotion?.name ?? null,
      })),
    };
  } catch {
    return invalidCode();
  }
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

    return executeOrderStatusTransitionCore(
      { ...input, courierWorkerId: undefined },
      admin,
      userId,
      targetOrder,
      supports174,
      supports175
    );
  } catch (err) {
    console.error("[updateOrderStatus] Unexpected error:", err instanceof Error ? err.name : "unknown");
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}

export type AssignRegisteredCourierResult =
  | { success: true; offlineWarning: boolean }
  | { success: false; error: "unauthorized" | "forbidden" | "not_found" | "invalid_status" | "courier_on_delivery" | "courier_already_on_delivery" | "db_error"; message: string };

/** Assign a registered courier from the owner picker using the shared transition core. */
export async function assignRegisteredCourier(input: {
  organizerId: string;
  orderId: string;
  courierWorkerId: string;
}): Promise<AssignRegisteredCourierResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "unauthorized", message: "Sign in to assign a courier." };
  const access = await checkTenantAccess(user.id, input.organizerId, ["owner", "admin", "manager"]);
  if (!access.hasAccess) return { success: false, error: "forbidden", message: "You cannot assign couriers for this business." };

  const admin = createSupabaseAdmin();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, organizer_id, business_id, order_number, status, payment_method, payment_status, provider, provider_reference, customer_email, customer_name, fulfilment_type, currency, total_amount, tracking_token, website_id, status_history, estimated_ready_at, rider_name, rider_phone, courier_worker_id")
    .eq("id", input.orderId)
    .eq("organizer_id", input.organizerId)
    .maybeSingle();
  if (orderError || !order || !order.business_id || order.organizer_id !== input.organizerId) {
    return { success: false, error: "not_found", message: "Order not found." };
  }
  if (order.status !== "ready" || order.fulfilment_type !== "delivery") {
    return { success: false, error: "invalid_status", message: "A registered courier can only be assigned to a ready delivery order." };
  }

  const { data: courier, error: courierError } = await admin
    .from("business_workers")
    .select("id, business_id, role, full_name, phone, is_active, deactivated_at, is_available")
    .eq("id", input.courierWorkerId)
    .eq("business_id", order.business_id)
    .eq("role", "courier")
    .eq("is_active", true)
    .is("deactivated_at", null)
    .maybeSingle();
  if (courierError || !courier || !courier.full_name?.trim()) {
    return { success: false, error: "forbidden", message: "This courier is not active for this business." };
  }

  const { data: activeOrder, error: activeError } = await admin
    .from("orders")
    .select("id")
    .eq("courier_worker_id", courier.id)
    .in("status", ["ready", "picked_up", "out_for_delivery"])
    .maybeSingle();
  if (activeError) return { success: false, error: "db_error", message: "Courier availability could not be checked." };
  if (activeOrder) {
    return { success: false, error: "courier_on_delivery", message: "This courier already has a delivery in progress." };
  }

  const result = await executeOrderStatusTransitionCore(
    {
      orderId: order.id,
      organizerId: input.organizerId,
      expectedCurrentStatus: "ready",
      nextStatus: "out_for_delivery",
      riderName: courier.full_name.trim(),
      riderPhone: courier.phone,
      courierWorkerId: courier.id,
    },
    admin,
    user.id,
    order as unknown as OrderRowRecord,
    true,
    true,
    undefined,
    [],
    order.business_id
  );
  if (!result.success) {
    if (result.error === "courier_already_on_delivery") {
      return { success: false, error: "courier_already_on_delivery", message: result.message ?? "This courier has just been assigned another delivery. Choose someone else." };
    }
    if (result.error === "order_already_updated") {
      return { success: false, error: "invalid_status", message: "The order changed. Refresh before assigning a courier." };
    }
    return { success: false, error: "db_error", message: result.message ?? "The courier could not be assigned." };
  }
  return { success: true, offlineWarning: courier.is_available !== true };
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
