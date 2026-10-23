import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { courierJson, validCourierOrderId, validateCourierRequestSession } from "@/lib/courier/http";
import { runOrderStatusPostPersistEffects, type OrderRowRecord, type OrderStatus } from "@/lib/orders/transition-core";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { session } = await validateCourierRequestSession(request);
  if (!session) return courierJson({ error: "Courier session is no longer valid." }, 401);
  const { orderId } = await params;
  if (!validCourierOrderId(orderId)) return courierJson({ error: "This offer is no longer available." }, 404);

  const admin = createSupabaseAdmin();
  const { data: claimData, error: claimError } = await admin.rpc("claim_business_courier_offer", {
    p_order_id: orderId,
    p_worker_id: session.workerId,
    p_history_entry: {
      status: "ready",
      at: new Date().toISOString(),
      by_user_id: null,
      reason: null,
      note: "Courier accepted delivery offer",
      estimated_ready_at: null,
      rider_name: null,
      rider_phone: null,
      worker_id: session.workerId,
      worker_name: null,
    },
  });
  if (claimError) {
    const error = claimError as { code?: string; constraint?: string; message?: string };
    if (error.code === "23505" || error.constraint === "idx_orders_one_active_order_per_courier") {
      return courierJson({ error: "You already have a delivery in progress." }, 409);
    }
    return courierJson({ error: "This offer could not be accepted. Please try again." }, 503);
  }
  const claimRow = Array.isArray(claimData) ? claimData[0] : claimData;
  if (!claimRow?.out_order_id || String(claimRow.out_worker_id) !== session.workerId) {
    return courierJson({ error: "This offer was taken by another courier." }, 409);
  }

  const { data: activeOrder, error: orderError } = await admin
    .from("orders")
    .select("id, organizer_id, business_id, order_number, status, payment_method, payment_status, provider, provider_reference, customer_email, customer_name, customer_phone, fulfilment_type, delivery_address, items, currency, total_amount, tracking_token, website_id, status_history, estimated_ready_at, rider_name, rider_phone")
    .eq("id", orderId)
    .eq("business_id", session.businessId)
    .eq("courier_worker_id", session.workerId)
    .in("status", ["ready", "out_for_delivery"])
    .maybeSingle();
  if (orderError) return courierJson({ error: "The assigned delivery is temporarily unavailable." }, 503);

  if (activeOrder && typeof activeOrder.organizer_id === "string") {
    await runOrderStatusPostPersistEffects(
      {
        orderId,
        organizerId: activeOrder.organizer_id,
        expectedCurrentStatus: "ready",
        nextStatus: activeOrder.status as OrderStatus,
        riderName: activeOrder.rider_name,
        riderPhone: activeOrder.rider_phone,
      },
      admin,
      activeOrder as unknown as OrderRowRecord,
      ["/courier"]
    );
  }

  return courierJson({
    ok: true,
    order: activeOrder
      ? {
          id: activeOrder.id,
          orderNumber: activeOrder.order_number,
          status: activeOrder.status,
          customerName: activeOrder.customer_name,
          customerPhone: activeOrder.customer_phone,
          deliveryAddress: activeOrder.delivery_address,
          items: activeOrder.items,
          amountToCollect:
            activeOrder.payment_method === "on_fulfilment" && activeOrder.payment_status === "unpaid"
              ? activeOrder.total_amount
              : 0,
          currency: activeOrder.currency,
        }
      : null,
  });
}
