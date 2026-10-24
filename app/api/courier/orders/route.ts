import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimitFailClosed } from "@/lib/rate-limit";
import { courierJson, validateCourierRequestSession } from "@/lib/courier/http";
import { setCourierSessionCookie } from "@/lib/kitchen/http";
import { hashWorkerToken } from "@/lib/kitchen/worker-session";

export async function GET(request: Request) {
  const { token, session } = await validateCourierRequestSession(request);
  if (!session || !token) return courierJson({ error: "Courier session is no longer valid." }, 401);

  const limit = await checkRateLimitFailClosed("courierFeed", `session:${hashWorkerToken(token)}`);
  if (!limit.allowed) return courierJson({ error: "Too many requests. Try again shortly." }, 429);

  const admin = createSupabaseAdmin();
  // Initial dispatch is committed by the order trigger. This idempotent tick
  // advances expired cohorts while courier dashboards are polling for offers.
  const { error: dispatchAdvanceError } = await admin.rpc("advance_business_courier_dispatch");
  if (dispatchAdvanceError) {
    console.error("[courier-dispatch] Timeout advancement failed", { code: dispatchAdvanceError.code ?? "unknown" });
  }
  const [workerResult, businessResult, offersResult, assignedResult, resolvedOffersResult, historyResult] = await Promise.all([
    admin
      .from("business_workers")
      .select("id, full_name, is_available")
      .eq("id", session.workerId)
      .eq("business_id", session.businessId)
      .eq("role", "courier")
      .eq("is_active", true)
      .is("deactivated_at", null)
      .maybeSingle(),
    admin
      .from("businesses")
      .select("id, name, address")
      .eq("id", session.businessId)
      .maybeSingle(),
    admin
      .from("business_courier_offer_feed")
      .select("offer_id, order_id, business_id, courier_worker_id, offered_at, pickup_name, pickup_address, items, amount_to_collect, currency, estimated_ready_at")
      .eq("courier_worker_id", session.workerId)
      .eq("business_id", session.businessId)
      .order("offered_at", { ascending: false })
      .limit(50),
    admin
      .from("orders")
      .select("id, business_id, order_number, status, customer_name, customer_phone, delivery_address, items, payment_method, payment_status, total_amount, currency, updated_at, delivery_issue, estimated_ready_at")
      .eq("courier_worker_id", session.workerId)
      .eq("business_id", session.businessId)
      .in("status", ["accepted", "preparing", "ready", "picked_up", "out_for_delivery"])
      .maybeSingle(),
    admin
      .from("business_courier_offers")
      .select("id, order_id, status, decline_message, offered_at, declined_at")
      .eq("courier_worker_id", session.workerId)
      .eq("business_id", session.businessId)
      .in("status", ["taken", "declined"])
      .order("updated_at", { ascending: false })
      .limit(50),
    admin
      .from("orders")
      .select("id, order_number, status, delivery_address, total_amount, currency, payment_method, payment_status, updated_at")
      .eq("courier_worker_id", session.workerId)
      .eq("business_id", session.businessId)
      .eq("status", "delivered")
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);
  if (workerResult.error || !workerResult.data || businessResult.error || offersResult.error || assignedResult.error || resolvedOffersResult.error) {
    return courierJson({ error: "Courier orders are temporarily unavailable." }, 503);
  }

  const isAvailable = workerResult.data.is_available === true;
  const assigned = assignedResult.data;
  const resolvedOfferRows = resolvedOffersResult.data ?? [];
  const resolvedOffers = resolvedOfferRows.map((offer) => ({
      offerId: offer.id,
      orderId: offer.order_id,
      status: offer.status,
      declineMessage: offer.decline_message,
      offeredAt: offer.offered_at,
      declinedAt: offer.declined_at,
    }));

  const completedOrders = historyResult?.data ?? [];
  const cashCollectedTotal = completedOrders
    .filter((o) => o.payment_method === "on_fulfilment" && o.payment_status === "paid")
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  const recentDeliveries = completedOrders.map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    deliveryAddress: o.delivery_address,
    totalAmount: o.total_amount,
    currency: o.currency,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    deliveredAt: o.updated_at,
  }));

  const response = courierJson({
    ok: true,
    isAvailable,
    state: assigned ? (isAvailable ? "On delivery" : "Offline, delivery in progress") : (isAvailable ? "Available" : "Offline"),
    businessName: businessResult.data?.name ?? null,
    courierName: workerResult.data.full_name ?? null,
    offers: offersResult.data ?? [],
    resolvedOffers,
    recentDeliveries,
    cashCollectedTotal,
    assignedOrder: assigned
      ? {
          id: assigned.id,
          orderNumber: assigned.order_number,
          status: assigned.status,
          estimatedReadyAt: assigned.estimated_ready_at,
          customerName: assigned.customer_name,
          customerPhone: assigned.customer_phone,
          pickupName: businessResult.data?.name ?? null,
          pickupAddress: businessResult.data?.address ?? null,
          deliveryAddress: assigned.delivery_address,
          items: assigned.items,
          amountToCollect:
            assigned.payment_method === "on_fulfilment" && assigned.payment_status === "unpaid"
              ? assigned.total_amount
              : 0,
          requiresCashCollection: assigned.payment_method === "on_fulfilment" && assigned.payment_status === "unpaid",
          currency: assigned.currency,
          updatedAt: assigned.updated_at,
          deliveryIssue: assigned.delivery_issue ?? null,
        }
      : null,
  });
  setCourierSessionCookie(response, token, session.expiresAt);
  return response;
}
