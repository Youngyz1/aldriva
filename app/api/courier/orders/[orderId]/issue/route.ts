import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { courierJson, validCourierOrderId, validateCourierRequestSession } from "@/lib/courier/http";

export const ALLOWED_ISSUE_CATEGORIES = [
  "customer_unavailable",
  "invalid_address",
  "customer_unreachable",
  "pickup_issue",
  "vehicle_issue",
  "safety_concern",
  "other",
] as const;

export type DeliveryIssueCategory = typeof ALLOWED_ISSUE_CATEGORIES[number];

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
    return courierJson({ error: "Invalid issue report payload." }, 400);
  }

  const category = (body && typeof body === "object" && "category" in body && typeof body.category === "string"
    ? body.category.trim()
    : "") as DeliveryIssueCategory;

  if (!ALLOWED_ISSUE_CATEGORIES.includes(category)) {
    return courierJson({ error: "Please select a valid issue category." }, 400);
  }

  const rawNote = body && typeof body === "object" && "note" in body && typeof body.note === "string"
    ? body.note.trim()
    : "";
  if (rawNote.length > 300) {
    return courierJson({ error: "Issue note must be 300 characters or fewer." }, 400);
  }
  const note = rawNote || null;

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
    .select("id, organizer_id, business_id, status, status_history")
    .eq("id", orderId)
    .eq("business_id", session.businessId)
    .eq("courier_worker_id", session.workerId)
    .in("status", ["ready", "picked_up", "out_for_delivery"])
    .maybeSingle();
  if (orderError || !order) {
    return courierJson({ error: "This delivery is no longer assigned to you or is already closed." }, 404);
  }

  const nowIso = new Date().toISOString();
  const issueRecord = {
    category,
    note,
    reported_at: nowIso,
    worker_id: session.workerId,
    worker_name: worker.full_name.trim(),
  };

  const existingHistory = Array.isArray(order.status_history) ? (order.status_history as unknown[]) : [];
  const issueHistoryEvent = {
    type: "issue_report",
    status: order.status,
    category,
    note,
    at: nowIso,
    worker_id: session.workerId,
    worker_name: worker.full_name.trim(),
  };

  const { error: updateError } = await admin
    .from("orders")
    .update({
      delivery_issue: issueRecord,
      status_history: [...existingHistory, issueHistoryEvent],
      updated_at: nowIso,
    })
    .eq("id", orderId)
    .eq("business_id", session.businessId)
    .eq("courier_worker_id", session.workerId);

  if (updateError) {
    return courierJson({ error: "Issue report could not be saved. Please try again." }, 503);
  }

  try {
    revalidatePath("/courier");
    if (order.organizer_id) {
      revalidatePath(`/dashboard/org/${order.organizer_id}/orders`);
    }
  } catch {
    // Non-fatal outside request context
  }

  return courierJson({ ok: true, issue: issueRecord });
}
