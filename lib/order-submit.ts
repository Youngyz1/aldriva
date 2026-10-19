/**
 * lib/order-submit.ts
 *
 * Internal order-request implementation shared by the public server action
 * (`lib/actions/orders.ts`) and hermetic tests. Has NO "use server"
 * directive so tests can call it directly with an injected Supabase client.
 * The exported server action takes only serializable input and supplies
 * `createSupabaseAdmin()` itself.
 */

import { headers } from "next/headers";
import type { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCapabilitiesForBusiness } from "@/lib/business-taxonomy";
import { getBuiltStorefrontFeatures, resolveStorefrontFeatures } from "@/lib/storefront-features";
import { getV2TemplateForWebsite, resolveStorefrontCurrency } from "@/lib/website-v2-theme";
import { normalizeContent } from "@/lib/website-content";
import { resolveOrderSchedule, validateScheduledOrderTime } from "@/lib/website-hours";
import {
  MAX_LINE_QUANTITY,
  computeLineTotal,
  effectiveUnitPrice,
  resolveItemOptionGroups,
  validateSelection,
  type NormalizedOptionAssignmentRow,
  type MenuItemOptionGroup,
  type MenuPricingItem,
  type OptionGroupSelection,
} from "@/lib/menu-pricing";
import { dispatchOrderNotifications } from "@/lib/order-notifications";
import { isValidPhoneNumber, normalizePhone } from "@/lib/order-phone";
import { getOrgApproval } from "@/lib/server-approval";
import { canTakeOrders } from "@/lib/business-approval";
import { extractDeliverySettings, computeOrderDeliveryFee } from "@/lib/delivery-settings";
import { isMissingMenuOptionSchema, warnMissingMenuOptionSchemaOnce } from "@/lib/menu-option-schema";

export interface OrderItemInput {
  itemId: string;
  selectedOptionIds?: string[];
  selectedOptions?: Array<{ groupId?: string; optionId: string; qty: number }>;
  quantity: number;
}

export interface SubmitOrderRequestInput {
  slug: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  fulfilmentType: "pickup" | "delivery";
  deliveryAddress?: string | null;
  customerNote?: string | null;
  items: OrderItemInput[];
  idempotencyKey?: string | null;
  hp?: string | null;
  scheduledFor?: string | null;
}

export type SubmitOrderResult =
  | {
      success: true;
      orderId: string;
      orderNumber: string;
      trackingToken: string;
      scheduledFor: string | null;
    }
  | {
      success: false;
      error:
        | "invalid_submission"
        | "rate_limited"
        | "website_not_found"
        | "ordering_disabled"
        | "fulfilment_unavailable"
        | "invalid_customer_info"
        | "invalid_items"
        | "item_not_found"
        | "item_inactive"
        | "item_sold_out"
        | "invalid_options"
        | "unknown_option"
        | "online_unavailable"
        | "no_open_hours"
        | "invalid_schedule"
        | "db_error"
        | "unexpected";
      message?: string;
      itemId?: string;
    };


export type OrderSubmitClient = ReturnType<typeof createSupabaseAdmin>;

export interface SubmitOrderOptions {
  /** Stored payment_method. Defaults to "on_fulfilment" (existing flow). */
  paymentMethod?: "on_fulfilment" | "online";
  /**
   * Skip the owner notification (online flow notifies only on webhook-paid).
   * Defaults to false: pay-on-fulfilment orders notify at creation.
   */
  deferNotification?: boolean;
}

/**
 * Internal order request submission. Takes an explicit Supabase client so
 * tests can inject a mock; the public action supplies the admin client.
 */
export async function submitOrderRequestWithClient(
  input: SubmitOrderRequestInput,
  admin: OrderSubmitClient,
  options?: SubmitOrderOptions
): Promise<SubmitOrderResult> {
  try {
    // 1. Honeypot check
    if (input.hp && input.hp.trim().length > 0) {
      return { success: false, error: "invalid_submission" };
    }

    // 2. Rate limiting (per IP and per phone)
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ip =
      headerList.get("x-real-ip") ||
      (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
      "unknown";

    const ipLimit = await checkRateLimit("orderRequestIp", `ip:${ip}`);
    if (!ipLimit.allowed) {
      return { success: false, error: "rate_limited", message: "Too many requests. Please wait a moment." };
    }

    const cleanPhone = normalizePhone(input.customerPhone || "");
    if (cleanPhone) {
      const phoneLimit = await checkRateLimit("orderRequestPhone", `phone:${cleanPhone}`);
      if (!phoneLimit.allowed) {
        return { success: false, error: "rate_limited", message: "Too many orders requested with this phone number." };
      }
    }

    // 3. Customer info validation
    const customerName = (input.customerName || "").trim();
    if (customerName.length < 1 || customerName.length > 100) {
      return { success: false, error: "invalid_customer_info", message: "Please provide your full name." };
    }

    if (!isValidPhoneNumber(input.customerPhone)) {
      return { success: false, error: "invalid_customer_info", message: "Please provide a valid phone number." };
    }

    const customerEmail = (input.customerEmail || "").trim() || null;
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return { success: false, error: "invalid_customer_info", message: "Please provide a valid email address." };
    }

    if (input.fulfilmentType !== "pickup" && input.fulfilmentType !== "delivery") {
      return { success: false, error: "fulfilment_unavailable", message: "Invalid fulfilment type." };
    }

    const deliveryAddress = (input.deliveryAddress || "").trim() || null;
    if (input.fulfilmentType === "delivery") {
      if (!deliveryAddress || deliveryAddress.length < 5 || deliveryAddress.length > 500) {
        return { success: false, error: "invalid_customer_info", message: "Delivery address is required for delivery orders." };
      }
    }

    const customerNote = (input.customerNote || "").trim().slice(0, 500) || null;

    if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 50) {
      return { success: false, error: "invalid_items", message: "Your order must contain between 1 and 50 items." };
    }

    for (const line of input.items) {
      if (
        !line.itemId ||
        typeof line.quantity !== "number" ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > MAX_LINE_QUANTITY
      ) {
        return { success: false, error: "invalid_items", message: "Invalid item quantity." };
      }
    }

    // 4. Resolve slug -> website -> organizer_id (server-side, reject unpublished)
    const { data: website, error: websiteError } = await admin
      .from("tenant_websites")
      .select("id, slug, status, metadata, tenant_id")
      .eq("slug", input.slug)
      .maybeSingle();

    if (websiteError || !website || website.status !== "published") {
      return { success: false, error: "website_not_found", message: "Website not found or not published." };
    }

    if (!website.tenant_id) {
      return { success: false, error: "website_not_found" };
    }

    const organizerId = website.tenant_id;

    // Resolve linked business & offerings
    const { data: business } = await admin
      .from("businesses")
      .select("id, industry, category, business_type, offerings, country")
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const capabilities = getCapabilitiesForBusiness(
      business?.industry ?? "",
      business?.category ?? "",
      business?.business_type ?? ""
    );

    const v2Template = getV2TemplateForWebsite(website.metadata);
    const builtFeatures = v2Template ? getBuiltStorefrontFeatures(v2Template) : { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false };

    const currency = resolveStorefrontCurrency(website.metadata, business?.country ?? null);

    const storefrontFeatures = resolveStorefrontFeatures({
      capabilities,
      offerings: Array.isArray(business?.offerings) ? business.offerings : [],
      built: builtFeatures,
      currency,
    });

    if (!storefrontFeatures.ordering) {
      return { success: false, error: "ordering_disabled", message: "Online ordering is not enabled for this business." };
    }

    // Business approval gate: customers cannot submit orders while the linked
    // business is pending_review, rejected, or archived.
    // Message is intentionally neutral — never reveals internal business status to customers.
    const orgApproval = await getOrgApproval(organizerId);
    if (!canTakeOrders(orgApproval)) {
      return { success: false, error: "ordering_disabled", message: "Ordering is not available yet." };
    }

    const paymentMethod = options?.paymentMethod ?? "on_fulfilment";
    if (paymentMethod === "online" && !storefrontFeatures.onlinePayment) {
      return { success: false, error: "online_unavailable", message: "Online payment is not available for this site." };
    }

    if (input.fulfilmentType === "delivery" && !storefrontFeatures.delivery) {
      return { success: false, error: "fulfilment_unavailable", message: "Delivery is not available." };
    }

    if (input.fulfilmentType === "pickup" && !storefrontFeatures.pickup) {
      return { success: false, error: "fulfilment_unavailable", message: "Pickup is not available." };
    }

    // 5. Idempotency check: if key supplied and exists for this organizer, return existing order
    const idempotencyKey = (input.idempotencyKey || "").trim() || null;
    if (idempotencyKey) {
      const { data: existingOrder } = await admin
        .from("orders")
        .select("id, order_number, tracking_token, scheduled_for")
        .eq("organizer_id", organizerId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingOrder) {
        return {
          success: true,
          orderId: existingOrder.id,
          orderNumber: existingOrder.order_number,
          trackingToken: existingOrder.tracking_token,
          scheduledFor: existingOrder.scheduled_for,
        };
      }
    }

    // 6. Schedule check (closed restaurant calculation & customer requested slot)
    const { data: contentRow } = await admin
      .from("website_content")
      .select("content")
      .eq("website_id", website.id)
      .maybeSingle();

    const contentDoc = normalizeContent(contentRow?.content ?? {});
    const metadata = (website.metadata && typeof website.metadata === "object" ? website.metadata : {}) as Record<string, unknown>;
    const timeZone = typeof metadata.timezone === "string" ? metadata.timezone : undefined;

    const schedule = resolveOrderSchedule(contentDoc.hours, timeZone);
    if (schedule.blocked) {
      return {
        success: false,
        error: "no_open_hours",
        message: schedule.message || "Ordering is currently unavailable as no open hours are scheduled within the next 7 days.",
      };
    }

    let finalScheduledFor: string | null = null;
    if (input.scheduledFor) {
      const scheduleValidation = validateScheduledOrderTime(input.scheduledFor, contentDoc.hours, timeZone);
      if (!scheduleValidation.valid) {
        return {
          success: false,
          error: "invalid_schedule",
          message: scheduleValidation.message || "Selected schedule time is invalid or outside business opening hours.",
        };
      }
      finalScheduledFor = scheduleValidation.scheduledFor!;
    } else {
      finalScheduledFor = schedule.scheduledFor;
    }


    // 7. Authoritative price and option calculation (NEVER trust client prices)
    const itemIds = Array.from(new Set(input.items.map((i) => i.itemId)));
    const loadItems = (includeOptionsSource: boolean) => admin
      .from("menu_items")
      .select(`id, name, price, promo_price, is_active, is_sold_out, option_groups, organizer_id${includeOptionsSource ? ", options_source" : ""}`)
      .eq("organizer_id", organizerId)
      .in("id", itemIds);
    let normalizedSchemaAvailable = true;
    let itemResult = await loadItems(true);
    if (itemResult.error && isMissingMenuOptionSchema(itemResult.error)) {
      warnMissingMenuOptionSchemaOnce("order-submit", itemResult.error);
      normalizedSchemaAvailable = false;
      itemResult = await loadItems(false) as typeof itemResult;
    }
    const dbItems = itemResult.data as any[] | null;
    const itemsError = itemResult.error;

    if (itemsError || !dbItems) {
      return { success: false, error: "db_error", message: "Failed to load menu items." };
    }

    const itemsById = new Map(dbItems.map((item) => [item.id, item]));

    let assignments: NormalizedOptionAssignmentRow[] = [];
    if (normalizedSchemaAvailable) {
      const { data: assignmentRows, error: assignmentsError } = await admin
        .from("menu_item_option_groups")
        .select("id, organizer_id, item_id, group_id, position, hidden_option_ids, price_overrides")
        .in("item_id", itemIds);
      if (assignmentsError && isMissingMenuOptionSchema(assignmentsError)) {
        warnMissingMenuOptionSchemaOnce("order-submit", assignmentsError);
        normalizedSchemaAvailable = false;
      } else if (assignmentsError) {
        return { success: false, error: "db_error", message: "Failed to load menu options." };
      } else {
        assignments = (Array.isArray(assignmentRows) ? assignmentRows : []) as NormalizedOptionAssignmentRow[];
      }
    }
    const groupIds = [...new Set(assignments.map((row) => row.group_id).filter(Boolean))];
    const groupsById = new Map<string, any>();
    const optionsByGroupId = new Map<string, any[]>();
    if (normalizedSchemaAvailable && groupIds.length > 0) {
      const [groupResult, optionResult] = await Promise.all([
        admin.from("menu_option_groups")
          .select("id, organizer_id, name, kind, min_select, max_select, is_required, position, is_active")
          .in("id", groupIds)
          .eq("is_active", true),
        admin.from("menu_options")
          .select("id, group_id, organizer_id, name, description, price, image_url, is_default, max_qty, is_available, allergens, position")
          .in("group_id", groupIds)
          .eq("is_available", true),
      ]);
      const missingSchemaError = [groupResult.error, optionResult.error].find(isMissingMenuOptionSchema);
      if (missingSchemaError) {
        warnMissingMenuOptionSchemaOnce("order-submit", missingSchemaError);
        normalizedSchemaAvailable = false;
        assignments = [];
      } else if (groupResult.error || optionResult.error) {
        return { success: false, error: "db_error", message: "Failed to load menu options." };
      } else {
        for (const group of groupResult.data || []) groupsById.set(group.id, group);
        for (const option of optionResult.data || []) {
          const list = optionsByGroupId.get(option.group_id) || [];
          list.push(option);
          optionsByGroupId.set(option.group_id, list);
        }
      }
    }
    const assignmentsByItem = new Map<string, NormalizedOptionAssignmentRow[]>();
    for (const assignment of assignments) {
      const group = groupsById.get(assignment.group_id);
      const list = assignmentsByItem.get(assignment.item_id) || [];
      list.push({
        ...assignment,
        group: group ? { ...group, options: optionsByGroupId.get(group.id) || [] } : null,
      });
      assignmentsByItem.set(assignment.item_id, list);
    }

    let subtotal = 0;
    const orderItemsSnapshot: Array<{
      item_id: string;
      name: string;
      unit_price: number;
      base_price: number;
      promo_price: number | null;
      chosen_options: Array<{
        id: string;
        name: string;
        price_delta: number;
        price?: number;
        group_id: string;
        group_name: string;
        group_kind: "variant" | "addon";
        qty: number;
      }>;
      quantity: number;
      line_total: number;
    }> = [];

    for (const line of input.items) {
      const item = itemsById.get(line.itemId);
      if (!item) {
        return { success: false, error: "item_not_found", itemId: line.itemId, message: "One of the items in your order is no longer available." };
      }

      if (!item.is_active) {
        return { success: false, error: "item_inactive", itemId: line.itemId, message: `"${item.name}" is currently unavailable.` };
      }

      if (item.is_sold_out) {
        return { success: false, error: "item_sold_out", itemId: line.itemId, message: `"${item.name}" is sold out.` };
      }

      const groups = resolveItemOptionGroups(
        { ...item, id: item.id, price: Number(item.price), options_source: normalizedSchemaAvailable ? item.options_source : "json", option_groups: Array.isArray(item.option_groups) ? item.option_groups : [] },
        normalizedSchemaAvailable ? assignmentsByItem.get(item.id) || [] : []
      ) as MenuItemOptionGroup[];
      const selectedIds = Array.isArray(line.selectedOptionIds) ? line.selectedOptionIds : [];
      const selectedInput = Array.isArray(line.selectedOptions) ? line.selectedOptions : null;
      const requestedOptions: Array<{ groupId?: string; optionId: string; qty: number }> =
        selectedInput || selectedIds.map((optionId) => ({ optionId, qty: 1 }));
      if (selectedInput && line.selectedOptionIds !== undefined) {
        const optionIds = requestedOptions.map((entry) => entry.optionId).sort();
        const declaredIds = [...selectedIds].sort();
        if (optionIds.length !== declaredIds.length || optionIds.some((id, index) => id !== declaredIds[index])) {
          return { success: false, error: "invalid_options", itemId: line.itemId, message: `Please review the selected options for "${item.name}".` };
        }
      }

      const selectionByGroup = new Map<string, Array<{ optionId: string; qty: number }>>();
      let unknownSelection = false;
      for (const selected of requestedOptions) {
        if (!selected || typeof selected.optionId !== "string") {
          return { success: false, error: "invalid_options", itemId: line.itemId, message: `Please review the selected options for "${item.name}".` };
        }
        const matches = groups.filter((group) =>
          (!selected.groupId || group.id === selected.groupId) && group.options.some((option) => option.id === selected.optionId)
        );
        if (matches.length !== 1) {
          unknownSelection = true;
          break;
        }
        const list = selectionByGroup.get(matches[0].id) || [];
        list.push({ optionId: selected.optionId, qty: selected.qty });
        selectionByGroup.set(matches[0].id, list);
      }
      if (unknownSelection) {
        return {
          success: false,
          error: "unknown_option",
          itemId: line.itemId,
          message: `Unknown option selected for "${item.name}". Please review your order and try again.`,
        };
      }

      const selection: OptionGroupSelection[] = groups
        .map((group) => {
          const selected = selectionByGroup.get(group.id) || [];
          return {
            groupId: group.id,
            optionIds: selected.map((entry) => entry.optionId),
            selectedOptions: selected,
          };
        })
        .filter((entry) => entry.optionIds.length > 0);

      const itemPricing: MenuPricingItem = {
        price: Number(item.price),
        promo_price: item.promo_price != null ? Number(item.promo_price) : null,
        option_groups: groups,
      };

      const selectionResult = validateSelection(itemPricing, selection);

      if (!selectionResult.valid) {
        return {
          success: false,
          error: "invalid_options",
          itemId: line.itemId,
          message: selectionResult.error || `Invalid options selected for "${item.name}".`,
        };
      }

      const calc = computeLineTotal({
        item: itemPricing,
        selection,
        quantity: line.quantity,
      });
      const chosenOptions = selection.flatMap((groupSelection) => {
        const group = groups.find((candidate) => candidate.id === groupSelection.groupId)!;
        return (groupSelection.selectedOptions || []).flatMap((selected) => {
          const option = group.options.find((candidate) => candidate.id === selected.optionId);
          if (!option) return [];
          return [{
            id: option.id,
            name: option.name,
            price_delta: group.kind === "variant" ? 0 : Number(option.price_delta) || 0,
            ...(group.kind === "variant" ? { price: Number(option.price) || 0 } : {}),
            group_id: group.id,
            group_name: group.name,
            group_kind: group.kind || "addon",
            qty: selected.qty,
          }];
        });
      });
      const hasVariant = groups.some((group) => group.kind === "variant");
      const unitPrice = effectiveUnitPrice(itemPricing, selection);

      subtotal += calc.lineTotal;
      orderItemsSnapshot.push({
        item_id: item.id,
        name: item.name,
        unit_price: unitPrice,
        base_price: Number(item.price),
        promo_price: !hasVariant && item.promo_price != null ? Number(item.promo_price) : null,
        chosen_options: chosenOptions,
        quantity: line.quantity,
        line_total: calc.lineTotal,
      });
    }

    const deliverySettings = extractDeliverySettings(website.metadata);
    const deliveryFee = computeOrderDeliveryFee(input.fulfilmentType, subtotal, deliverySettings);
    const totalAmount = subtotal + deliveryFee;

    // 8. Collision-safe human-readable order number generation
    const randomHex = Math.floor(1000 + Math.random() * 9000);
    const dateStamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    let orderNumber = `ORD-${dateStamp}-${randomHex}`;

    // Insert order with retry loop on order_number collision
    let insertedOrder: { id: string; order_number: string; tracking_token: string; scheduled_for: string | null } | null = null;
    let attempts = 0;

    while (!insertedOrder && attempts < 3) {
      attempts++;
      const { data: newOrder, error: insertError } = await admin
        .from("orders")
        .insert({
          organizer_id: organizerId,
          business_id: business?.id ?? null,
          website_id: website.id,
          order_number: orderNumber,
          customer_name: customerName,
          customer_phone: cleanPhone,
          customer_email: customerEmail,
          fulfilment_type: input.fulfilmentType,
          delivery_address: deliveryAddress,
          customer_note: customerNote,
          currency,
          subtotal,
          delivery_fee: deliveryFee,
          total_amount: totalAmount,
          status: "pending",
          payment_method: paymentMethod,
          payment_status: "unpaid",
          scheduled_for: finalScheduledFor,
          items: orderItemsSnapshot,
          idempotency_key: idempotencyKey,
        })
        .select("id, order_number, tracking_token, scheduled_for")
        .maybeSingle();

      if (insertError) {
        if (insertError.code === "23505" && insertError.message.includes("order_number")) {
          // Collision: retry with fresh random suffix
          orderNumber = `ORD-${dateStamp}-${Math.floor(1000 + Math.random() * 9000)}`;
          continue;
        }
        if (insertError.code === "23505" && insertError.message.includes("idempotency_key") && idempotencyKey) {
          // Idempotent duplicate: fetch existing
          const { data: existing } = await admin
            .from("orders")
            .select("id, order_number, tracking_token, scheduled_for")
            .eq("organizer_id", organizerId)
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();
          if (existing) {
            return {
              success: true,
              orderId: existing.id,
              orderNumber: existing.order_number,
              trackingToken: existing.tracking_token,
              scheduledFor: existing.scheduled_for,
            };
          }
        }
        console.error("[submitOrderRequest] Insert failed: code=" + insertError.code);
        return { success: false, error: "db_error", message: "Failed to create order." };
      }

      insertedOrder = newOrder;
    }

    if (!insertedOrder) {
      return { success: false, error: "db_error", message: "Failed to generate unique order number." };
    }

    // 9. Dispatch owner notification (in-app bell + email)
    // Non-blocking for caller; errors logged without PII and cannot fail the order.
    // Online orders defer this to the payment webhook: the owner is notified
    // only when payment succeeds, never on checkout open.
    if (!options?.deferNotification) {
      await dispatchOrderNotifications({
        id: insertedOrder.id,
        organizer_id: organizerId,
        order_number: insertedOrder.order_number,
        customer_name: customerName,
        customer_phone: cleanPhone,
        customer_email: customerEmail,
        fulfilment_type: input.fulfilmentType,
        delivery_address: deliveryAddress,
        currency,
        subtotal,
        delivery_fee: deliveryFee,
        total_amount: totalAmount,
        scheduled_for: insertedOrder.scheduled_for,
        website_slug: input.slug,
        tracking_token: insertedOrder.tracking_token,
        items: orderItemsSnapshot,
      });
    }

    return {
      success: true,
      orderId: insertedOrder.id,
      orderNumber: insertedOrder.order_number,
      trackingToken: insertedOrder.tracking_token,
      scheduledFor: insertedOrder.scheduled_for,
    };
  } catch (err) {
    console.error(
      "[submitOrderRequest] Caught unexpected error: code=unexpected",
      err instanceof Error ? err.name : "unknown"
    );
    return { success: false, error: "unexpected", message: "An unexpected error occurred while placing your order." };
  }
}
