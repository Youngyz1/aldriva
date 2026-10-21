import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { courierJson, validateCourierRequestSession } from "@/lib/courier/http";

function stateLabel(isAvailable: boolean, hasActiveOrder: boolean) {
  if (hasActiveOrder) return isAvailable ? "On delivery" : "Offline, delivery in progress";
  return isAvailable ? "Available" : "Offline";
}

export async function PATCH(request: Request) {
  const { session } = await validateCourierRequestSession(request);
  if (!session) return courierJson({ error: "Courier session is no longer valid." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return courierJson({ error: "Choose Available or Offline." }, 400);
  }
  if (!body || typeof body !== "object" || !("isAvailable" in body) || typeof body.isAvailable !== "boolean") {
    return courierJson({ error: "Choose Available or Offline." }, 400);
  }

  const admin = createSupabaseAdmin();
  const { data: worker, error: updateError } = await admin
    .from("business_workers")
    .update({ is_available: body.isAvailable, updated_at: new Date().toISOString() })
    .eq("id", session.workerId)
    .eq("business_id", session.businessId)
    .eq("role", "courier")
    .eq("is_active", true)
    .is("deactivated_at", null)
    .select("id, is_available")
    .maybeSingle();
  if (updateError || !worker) return courierJson({ error: "Courier availability could not be updated." }, 403);

  const { data: activeOrder, error: activeError } = await admin
    .from("orders")
    .select("id")
    .eq("courier_worker_id", session.workerId)
    .eq("business_id", session.businessId)
    .eq("status", "out_for_delivery")
    .maybeSingle();
  if (activeError) return courierJson({ error: "Courier availability could not be checked." }, 503);

  return courierJson({
    ok: true,
    isAvailable: worker.is_available,
    state: stateLabel(worker.is_available, Boolean(activeOrder)),
  });
}
