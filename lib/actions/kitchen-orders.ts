"use server";

import { cookies } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  KITCHEN_SESSION_COOKIE,
  validateAndRenewWorkerSession,
} from "@/lib/kitchen/worker-session";
import {
  executeOrderStatusTransitionCore,
  type OrderStatus,
} from "@/lib/orders/transition-core";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type KitchenTransitionResult =
  | { success: true; nextStatus: "preparing" | "ready" }
  | { success: false; error: "unauthorized" | "forbidden" | "invalid_transition" | "not_found" | "order_already_updated" | "db_error" };

function renewSessionCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  token: string,
  expiresAt: string
) {
  const expiryMs = Date.parse(expiresAt);
  const maxAge = Number.isFinite(expiryMs)
    ? Math.max(0, Math.min(SESSION_MAX_AGE_SECONDS, Math.floor((expiryMs - Date.now()) / 1000)))
    : 0;
  cookieStore.set(KITCHEN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

/** The only kitchen order transitions available to a cook. */
export async function transitionKitchenOrder(
  orderId: string,
  expectedCurrentStatus: "accepted" | "preparing",
  nextStatus: "preparing" | "ready"
): Promise<KitchenTransitionResult> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(KITCHEN_SESSION_COOKIE)?.value;
  const session = sessionToken ? await validateAndRenewWorkerSession(sessionToken, "cook") : null;
  if (!session || !sessionToken || session.role !== "cook" || !session.kitchenId) return { success: false, error: "unauthorized" };
  renewSessionCookie(cookieStore, sessionToken, session.expiresAt);

  const allowedTransition =
    (expectedCurrentStatus === "accepted" && nextStatus === "preparing") ||
    (expectedCurrentStatus === "preparing" && nextStatus === "ready");
  if (!allowedTransition) return { success: false, error: "invalid_transition" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    return { success: false, error: "not_found" };
  }

  const admin = createSupabaseAdmin();
  const { data: worker, error: workerError } = await admin
    .from("business_workers")
    .select("id, full_name")
    .eq("id", session.workerId)
    .eq("business_id", session.businessId)
    .eq("kitchen_id", session.kitchenId)
    .eq("role", "cook")
    .eq("is_active", true)
    .is("deactivated_at", null)
    .maybeSingle();
  if (workerError || !worker || typeof worker.full_name !== "string" || !worker.full_name.trim()) {
    return { success: false, error: "forbidden" };
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, organizer_id, business_id, order_number, status, payment_method, payment_status, provider, provider_reference, customer_email, customer_name, fulfilment_type, currency, total_amount, tracking_token, website_id, status_history, estimated_ready_at")
    .eq("id", orderId)
    .eq("business_id", session.businessId)
    .maybeSingle();
  if (orderError || !order || !order.business_id || order.business_id !== session.businessId) {
    return { success: false, error: "not_found" };
  }
  if (typeof order.organizer_id !== "string" || !order.organizer_id) {
    return { success: false, error: "not_found" };
  }

  const result = await executeOrderStatusTransitionCore(
    {
      orderId,
      organizerId: order.organizer_id,
      expectedCurrentStatus: expectedCurrentStatus as OrderStatus,
      nextStatus: nextStatus as OrderStatus,
    },
    admin,
    null,
    order,
    true,
    false,
    { workerId: session.workerId, workerName: worker.full_name.trim() },
    ["/kitchen"],
    session.businessId
  );

  if (result.success) return { success: true, nextStatus };
  if (result.error === "order_already_updated") return { success: false, error: "order_already_updated" };
  return { success: false, error: "db_error" };
}
