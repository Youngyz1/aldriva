import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { courierJson, validCourierOrderId, validateCourierRequestSession } from "@/lib/courier/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { session } = await validateCourierRequestSession(request);
  if (!session) return courierJson({ error: "Courier session is no longer valid." }, 401);
  const { orderId } = await params;
  if (!validCourierOrderId(orderId)) return courierJson({ error: "This offer is no longer available." }, 404);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return courierJson({ error: "Invalid request." }, 400);
  }
  const message = body && typeof body === "object" && "message" in body
    ? body.message
    : null;
  if (message !== null && (typeof message !== "string" || message.trim().length > 300)) {
    return courierJson({ error: "Keep the decline message to 300 characters or fewer." }, 400);
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("decline_business_courier_offer", {
    p_order_id: orderId,
    p_worker_id: session.workerId,
    p_message: typeof message === "string" ? message.trim() || null : null,
  });
  if (error) return courierJson({ error: "This offer could not be declined." }, 503);
  const declined = Array.isArray(data) ? data[0] : data;
  if (declined !== true) return courierJson({ error: "This offer is no longer available." }, 409);
  return courierJson({ ok: true });
}
