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

  const admin = createSupabaseAdmin();
  const { data: worker, error: workerError } = await admin
    .from("business_workers")
    .select("id, full_name, phone")
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
    .eq("status", "ready")
    .maybeSingle();
  if (orderError || !order || order.status !== "ready") {
    return courierJson({ error: "This delivery is not ready for pickup or no longer assigned to you." }, 404);
  }

  const result = await executeOrderStatusTransitionCore(
    {
      orderId,
      organizerId: order.organizer_id,
      expectedCurrentStatus: "ready",
      nextStatus: "picked_up",
      historyNote: "Order picked up by courier",
      riderName: worker.full_name.trim(),
      riderPhone: worker.phone,
      courierWorkerId: session.workerId,
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
    return courierJson({ error: result.message ?? "Pickup could not be confirmed." }, status);
  }

  return courierJson({ ok: true, status: "picked_up" });
}
