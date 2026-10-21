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
  const [workerResult, businessResult, offersResult, assignedResult, resolvedOffersResult] = await Promise.all([
    admin
      .from("business_workers")
      .select("id, is_available")
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
      .select("offer_id, order_id, business_id, courier_worker_id, offered_at, pickup_name, pickup_address, delivery_address, items, amount_to_collect, currency")
      .eq("courier_worker_id", session.workerId)
      .eq("business_id", session.businessId)
      .order("offered_at", { ascending: false })
      .limit(50),
    admin
      .from("orders")
      .select("id, business_id, order_number, status, customer_name, customer_phone, delivery_address, items, payment_method, payment_status, total_amount, currency, updated_at")
      .eq("courier_worker_id", session.workerId)
      .eq("business_id", session.businessId)
      .eq("status", "out_for_delivery")
      .maybeSingle(),
    admin
      .from("business_courier_offers")
      .select("id, order_id, status, decline_message, offered_at, declined_at")
      .eq("courier_worker_id", session.workerId)
      .eq("business_id", session.businessId)
      .in("status", ["taken", "declined"])
      .order("updated_at", { ascending: false })
      .limit(50),
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
  const response = courierJson({
    ok: true,
    isAvailable,
    state: assigned ? (isAvailable ? "On delivery" : "Offline, delivery in progress") : (isAvailable ? "Available" : "Offline"),
    offers: offersResult.data ?? [],
    resolvedOffers,
    assignedOrder: assigned
      ? {
          id: assigned.id,
          orderNumber: assigned.order_number,
          status: assigned.status,
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
        }
      : null,
  });
  setCourierSessionCookie(response, token, session.expiresAt);
  return response;
}
