import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

const STALE_THRESHOLD_MS = 3 * 60 * 1000;
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in to view courier progress." }, 401);

  const { orderId } = await params;
  if (!UUID_PATTERN.test(orderId)) return json({ error: "Order not found." }, 404);

  const limit = await checkRateLimit("orderTrackingView", `business-location:${user.id}:${orderId}`);
  if (!limit.allowed) return json({ error: "Too many location requests. Try again shortly." }, 429);

  const admin = createSupabaseAdmin();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, organizer_id, business_id, status, fulfilment_type, courier_worker_id, rider_name")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order) return json({ error: "Order not found." }, 404);

  const access = await checkTenantAccess(user.id, order.organizer_id, ["owner", "admin", "manager", "editor", "finance"]);
  if (!access.hasAccess) return json({ error: "You cannot view this delivery." }, 404);

  const isActiveAssignment =
    order.fulfilment_type === "delivery" &&
    Boolean(order.courier_worker_id) &&
    ["accepted", "preparing", "ready", "picked_up", "out_for_delivery"].includes(order.status);
  if (!isActiveAssignment) {
    return json({ status: order.status, courierAssigned: false, location: null, message: "No active courier assignment." });
  }

  const { data: latest, error: locationError } = await admin
    .from("order_delivery_locations")
    .select("latitude, longitude, accuracy, heading, speed, recorded_at")
    .eq("order_id", order.id)
    .eq("courier_worker_id", order.courier_worker_id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (locationError || !latest) {
    return json({
      status: order.status,
      courierAssigned: true,
      courierName: order.rider_name,
      location: null,
      message: "Courier is assigned. A location update is not available yet.",
    });
  }

  const isStale = Date.now() - new Date(latest.recorded_at).getTime() > STALE_THRESHOLD_MS;
  return json({
    status: order.status,
    courierAssigned: true,
    courierName: order.rider_name,
    location: { ...latest, isStale },
    message: isStale ? "The last courier location update is stale." : "Courier location is current.",
  });
}
