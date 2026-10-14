/**
 * lib/storefront-order-payments.ts
 *
 * Phase 3: online card payment for storefront orders (Stripe PaymentIntent,
 * USD only). No "use server" directive: the API route supplies real clients,
 * tests inject mocks.
 *
 * Creation reuses submitOrderRequestWithClient (same repricing + validation,
 * never client prices) with payment_method "online" and deferred owner
 * notification; the webhook is the ONLY source of truth for paid state.
 */

import type Stripe from "stripe";
import { submitOrderRequestWithClient, type SubmitOrderRequestInput, type OrderSubmitClient } from "@/lib/order-submit";
import { toMinorUnits } from "@/lib/money";
import { dispatchOrderNotifications } from "@/lib/order-notifications";

/** Online-payment intent window: abandoned intents read as expired after this. */
export const ONLINE_ORDER_PAYMENT_EXPIRY_MINUTES = 30;

export type StripeIntentClient = Pick<Stripe, "paymentIntents">;

export interface CreateOnlineOrderPaymentResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  trackingToken?: string;
  clientSecret?: string;
  paymentIntentId?: string;
  scheduledFor?: string | null;
  error?:
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
    | "invalid_schedule"
    | "online_unavailable"
    | "no_open_hours"
    | "db_error"
    | "payment_unavailable"
    | "unexpected";
  message?: string;
  itemId?: string;
}

/**
 * Creates an online-pay order (unpaid, no owner notification yet) then a
 * Stripe PaymentIntent for its DB total. Idempotent on the client key: a
 * replay returns the existing order with a FRESH intent (the old one may be
 * abandoned; PaymentIntents are single-use after success).
 */
export async function createOnlineOrderPayment(
  input: SubmitOrderRequestInput,
  clients: { admin: OrderSubmitClient; stripe: StripeIntentClient; now?: Date }
): Promise<CreateOnlineOrderPaymentResult> {
  const { admin, stripe, now } = clients;
  const nowDate = now ?? new Date();

  const created = await submitOrderRequestWithClient(input, admin, {
    paymentMethod: "online",
    deferNotification: true,
  });
  if (!created.success) return created;

  // Re-read the authoritative row (organizer, totals, currency) — never the client.
  const idempotencyKey = (input.idempotencyKey || "").trim() || null;
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, organizer_id, order_number, currency, subtotal, delivery_fee, total_amount, payment_method, payment_status")
    .eq("id", created.orderId)
    .maybeSingle();

  if (orderError || !order) {
    console.error("[storefront-order-payments] created order unreadable: code=db_error");
    return { success: false, error: "db_error", message: "Failed to load the created order." };
  }

  if (order.payment_method !== "online") {
    return { success: false, error: "online_unavailable", message: "Online payment is not available for this site." };
  }

  let intent: { id: string; client_secret: string | null };
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: toMinorUnits(Number(order.total_amount), order.currency),
        currency: String(order.currency).toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: undefined,
        metadata: {
          kind: "storefront_order",
          organizer_id: order.organizer_id,
          order_id: order.id,
          order_number: order.order_number,
          total_amount: String(Number(order.total_amount).toFixed(2)),
          currency: String(order.currency).toUpperCase(),
        },
      },
      { idempotencyKey: `storefront-order-${order.id}-${idempotencyKey ?? "noid"}-${nowDate.getTime()}` }
    );
  } catch (err) {
    console.error("[storefront-order-payments] PaymentIntent creation failed:", err instanceof Error ? err.name : "unknown");
    return { success: false, error: "payment_unavailable", message: "Could not start the card payment. Your order is saved as unpaid." };
  }

  if (!intent.client_secret) {
    console.error("[storefront-order-payments] PaymentIntent missing client_secret: code=payment_unavailable");
    return { success: false, error: "payment_unavailable", message: "Could not start the card payment. Your order is saved as unpaid." };
  }

  const expiresAt = new Date(nowDate.getTime() + ONLINE_ORDER_PAYMENT_EXPIRY_MINUTES * 60_000).toISOString();
  const { error: stampError } = await admin
    .from("orders")
    .update({ provider: "stripe", provider_reference: intent.id, payment_expires_at: expiresAt })
    .eq("id", order.id);

  if (stampError) {
    console.error("[storefront-order-payments] provider stamp failed:", stampError.message);
    return { success: false, error: "db_error", message: "Failed to attach the payment. Your order is saved as unpaid." };
  }

  return {
    success: true,
    orderId: order.id,
    orderNumber: order.order_number,
    trackingToken: created.trackingToken,
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    scheduledFor: created.scheduledFor,
  };
}

export interface StorefrontOrderWebhookOutcome {
  handled: boolean;
  alreadyPaid?: boolean;
  rejected?: "not_found" | "tenant_mismatch" | "amount_mismatch" | "currency_mismatch";
}

interface WebhookClients {
  admin: OrderSubmitClient;
  notify?: (payload: Parameters<typeof dispatchOrderNotifications>[0]) => Promise<void>;
  alert?: (params: { kind: string; stripePaymentIntentId: string; amount: number; currency: string; buyerEmail: string | null; rawMetadata: Record<string, unknown>; errorMessage: string }) => Promise<void>;
}

/**
 * Webhook source of truth for storefront orders. Idempotent under Stripe
 * retries: only the unpaid -> paid flip notifies, exactly once. Tenant,
 * amount and currency are matched from the DB row, never the client.
 * Failure/cancel/expiry events need no action: the order stays unpaid and
 * reads as awaiting (or expired) in the owner list; never notify as paid.
 */
export async function handleStorefrontOrderPaymentSucceeded(
  pi: Pick<Stripe.PaymentIntent, "id" | "amount" | "currency" | "metadata">,
  clients: WebhookClients
): Promise<StorefrontOrderWebhookOutcome> {
  const { admin, notify, alert } = clients;
  const meta = (pi.metadata ?? {}) as Record<string, string | undefined>;
  const orderId = meta.order_id;

  const fail = async (
    rejected: NonNullable<StorefrontOrderWebhookOutcome["rejected"]>,
    detail: string,
    order?: { id: string; total_amount: number; currency: string; customer_email: string | null }
  ): Promise<StorefrontOrderWebhookOutcome> => {
    console.error(`[storefront-order-payments] intent ${pi.id} rejected (${rejected}): ${detail}`);
    if (alert) {
      await alert({
        kind: "storefront_order",
        stripePaymentIntentId: pi.id,
        amount: typeof pi.amount === "number" ? pi.amount : 0,
        currency: typeof pi.currency === "string" ? pi.currency : "unknown",
        buyerEmail: order?.customer_email ?? null,
        rawMetadata: meta,
        errorMessage: `${rejected}: ${detail}`,
      });
    }
    return { handled: true, rejected };
  };

  // Primary match: the stamped provider reference (unique index guarantees
  // at most one row).
  let order: Record<string, unknown> | null = null;
  if (orderId) {
    const { data } = await admin
      .from("orders")
      .select("id, organizer_id, order_number, customer_name, customer_phone, customer_email, fulfilment_type, delivery_address, currency, subtotal, delivery_fee, total_amount, status, payment_method, payment_status, scheduled_for, items, provider, provider_reference, payment_expires_at")
      .eq("id", orderId)
      .maybeSingle();
    order = (data as Record<string, unknown> | null) ?? null;
  }
  if (!order) {
    const { data } = await admin
      .from("orders")
      .select("id, organizer_id, order_number, customer_name, customer_phone, customer_email, fulfilment_type, delivery_address, currency, subtotal, delivery_fee, total_amount, status, payment_method, payment_status, scheduled_for, items, provider, provider_reference, payment_expires_at")
      .eq("provider", "stripe")
      .eq("provider_reference", pi.id)
      .maybeSingle();
    order = (data as Record<string, unknown> | null) ?? null;
  }
  if (!order) {
    return fail("not_found", "no order for this payment");
  }

  if (order["payment_status"] === "paid") {
    return { handled: true, alreadyPaid: true };
  }

  if (typeof meta.organizer_id === "string" && meta.organizer_id !== order["organizer_id"]) {
    return fail("tenant_mismatch", "metadata organizer does not own the order", order as never);
  }

  const currency = String(order["currency"] ?? "").toUpperCase();
  if (typeof pi.currency !== "string" || pi.currency.toUpperCase() !== currency) {
    return fail("currency_mismatch", `charge ${pi.currency} != order ${currency}`, order as never);
  }
  const expectedMinor = toMinorUnits(Number(order["total_amount"]), currency);
  if (pi.amount !== expectedMinor) {
    return fail("amount_mismatch", `charge ${pi.amount} != order ${expectedMinor}`, order as never);
  }

  // Conditional flip: exactly one retry wins; replays see paid above.
  const { data: flipped, error: flipError } = await admin
    .from("orders")
    .update({ payment_status: "paid", provider: "stripe", provider_reference: pi.id })
    .eq("id", order["id"] as string)
    .eq("payment_status", "unpaid")
    .select("id")
    .maybeSingle();

  if (flipError || !flipped) {
    if (flipError) {
      console.error("[storefront-order-payments] paid flip failed:", flipError.message);
      if (alert) {
        await alert({
          kind: "storefront_order",
          stripePaymentIntentId: pi.id,
          amount: typeof pi.amount === "number" ? pi.amount : 0,
          currency: typeof pi.currency === "string" ? pi.currency : "unknown",
          buyerEmail: (order["customer_email"] as string | null) ?? null,
          rawMetadata: meta,
          errorMessage: `paid flip failed: ${flipError.message}`,
        });
      }
      return { handled: true, rejected: undefined };
    }
    return { handled: true, alreadyPaid: true };
  }

  // Notify once, only on success. Stored order identity stays authoritative
  // even if the card holder differs.
  const items = Array.isArray(order["items"]) ? (order["items"] as Array<{ name: string; quantity: number; unit_price: number; line_total: number; chosen_options?: Array<{ name: string; price_delta?: number }> }>) : [];
  await (notify ?? dispatchOrderNotifications)({
    id: order["id"] as string,
    organizer_id: order["organizer_id"] as string,
    order_number: order["order_number"] as string,
    customer_name: order["customer_name"] as string,
    customer_phone: order["customer_phone"] as string,
    customer_email: (order["customer_email"] as string | null) ?? null,
    fulfilment_type: order["fulfilment_type"] as "pickup" | "delivery",
    delivery_address: (order["delivery_address"] as string | null) ?? null,
    currency,
    subtotal: Number(order["subtotal"] ?? 0),
    delivery_fee: Number(order["delivery_fee"] ?? 0),
    total_amount: Number(order["total_amount"]),
    scheduled_for: (order["scheduled_for"] as string | null) ?? null,
    items,
  });

  return { handled: true };
}
