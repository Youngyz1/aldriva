import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { courierJson, validCourierOrderId, validateCourierRequestSession } from "@/lib/courier/http";
import { executeOrderStatusTransitionCore, type OrderRowRecord } from "@/lib/orders/transition-core";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { session } = await validateCourierRequestSession(request);
  if (!session) return courierJson({ error: "Courier session is no longer valid." }, 401);
  const { orderId } = await params;
  if (!validCourierOrderId(orderId)) return courierJson({ error: "Delivery not found." }, 404);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return courierJson({ error: "Confirm delivery to continue." }, 400);
  }
  const cashCollectedConfirmed = body && typeof body === "object" && "cashCollectedConfirmed" in body
    ? body.cashCollectedConfirmed === true
    : false;

  const admin = createSupabaseAdmin();
  const { data: worker, error: workerError } = await admin
    .from("business_workers")
    .select("id, full_name")
    .eq("id", session.workerId)
    .eq("business_id", session.businessId)
    .eq("role", "courier")
    .eq("is_active", true)
    .is("deactivated_at", null)
    .maybeSingle();
  if (workerError || !worker || typeof worker.full_name !== "string" || !worker.full_name.trim()) {
    return courierJson({ error: "Courier access is no longer valid." }, 403);
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, organizer_id, business_id, order_number, status, payment_method, payment_status, provider, provider_reference, customer_email, customer_name, fulfilment_type, currency, total_amount, tracking_token, website_id, status_history, estimated_ready_at, rider_name, rider_phone, courier_worker_id")
    .eq("id", orderId)
    .eq("business_id", session.businessId)
    .eq("courier_worker_id", session.workerId)
    .in("status", ["picked_up", "out_for_delivery"])
    .maybeSingle();
  if (orderError || !order || (order.status !== "out_for_delivery" && order.status !== "picked_up")) {
    return courierJson({ error: "This delivery is no longer assigned to you." }, 404);
  }

  const unpaidOnFulfilment = order.payment_method === "on_fulfilment" && order.payment_status !== "paid";
  if (unpaidOnFulfilment && !cashCollectedConfirmed) {
    return courierJson({ error: "Confirm that you collected the cash before marking this delivery complete." }, 400);
  }

  const result = await executeOrderStatusTransitionCore(
    {
      orderId,
      organizerId: order.organizer_id,
      expectedCurrentStatus: order.status as "out_for_delivery" | "picked_up",
      nextStatus: "delivered",
      markPaymentCollected: unpaidOnFulfilment && cashCollectedConfirmed,
      historyNote: unpaidOnFulfilment && cashCollectedConfirmed ? "Cash collected; courier confirmation received." : null,
    },
    admin,
    null,
    order as unknown as OrderRowRecord,
    true,
    true,
    { workerId: session.workerId, workerName: worker.full_name.trim() },
    ["/courier"],
    session.businessId
  );

  if (!result.success) {
    const status = result.error === "order_already_updated" ? 409 : result.error === "not_found" ? 404 : 400;
    return courierJson({ error: result.message ?? "Delivery could not be completed." }, status);
  }
  return courierJson({ ok: true, status: "delivered", paymentStatus: result.paymentStatus ?? order.payment_status });
}
