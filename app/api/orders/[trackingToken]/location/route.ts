import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

function trackingJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingToken: string }> }
) {
  const { trackingToken } = await params;

  if (!trackingToken || typeof trackingToken !== "string" || !/^[a-zA-Z0-9_-]{10,80}$/.test(trackingToken)) {
    return trackingJson({ error: "Invalid tracking token." }, 400);
  }

  // Rate limit by client IP: 60 queries per 5 minutes
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip =
    headerList.get("x-real-ip") ||
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
    "unknown";

  const rateCheck = await checkRateLimit("orderTrackingView", `loc:ip:${ip}`);
  if (!rateCheck.allowed) {
    return trackingJson({ error: "Too many requests. Please slow down." }, 429);
  }

  const admin = createSupabaseAdmin();

  // 1. Fetch order by tracking_token
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, fulfilment_type, delivery_address, rider_name, rider_phone, courier_worker_id")
    .eq("tracking_token", trackingToken)
    .maybeSingle();

  if (orderError || !order) {
    return trackingJson({ error: "Order not found." }, 404);
  }

  // Tracking tokens authorize one order only. Do not expose coordinates unless
  // a registered courier is assigned and the delivery is still active.
  const canTrackAssignedCourier =
    order.fulfilment_type === "delivery" &&
    Boolean(order.courier_worker_id) &&
    ["accepted", "preparing", "ready", "picked_up", "out_for_delivery"].includes(order.status);
  if (!canTrackAssignedCourier) {
    return trackingJson({
      status: order.status,
      liveTrackingActive: false,
      trackingAvailable: false,
      location: null,
      message:
        order.status === "delivered" || order.status === "completed"
          ? "Delivery completed."
          : "Live tracking will become available after a registered courier is assigned.",
    });
  }

  // 3. Fetch latest courier breadcrumb for this order
  try {
    const { data: latestLoc, error: locError } = await admin
      .from("order_delivery_locations")
      .select("latitude, longitude, accuracy, heading, speed, recorded_at")
      .eq("order_id", order.id)
      .eq("courier_worker_id", order.courier_worker_id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (locError) {
      // Graceful fallback if table not yet created on target database
      return trackingJson({
        status: order.status,
        liveTrackingActive: true,
        trackingAvailable: false,
        location: null,
        message: "The courier is assigned. Location is not available yet.",
      });
    }

    if (!latestLoc) {
      return trackingJson({
        status: order.status,
        liveTrackingActive: true,
        trackingAvailable: false,
        location: null,
        message: "The courier is assigned. Location is not available yet.",
      });
    }

    const recordedMs = new Date(latestLoc.recorded_at).getTime();
    const isStale = Date.now() - recordedMs > STALE_THRESHOLD_MS;

    return trackingJson({
      status: order.status,
      liveTrackingActive: true,
      trackingAvailable: !isStale,
      location: {
        latitude: latestLoc.latitude,
        longitude: latestLoc.longitude,
        accuracy: latestLoc.accuracy,
        heading: latestLoc.heading,
        speed: latestLoc.speed,
        recordedAt: latestLoc.recorded_at,
        isStale,
      },
      message: isStale ? "The last location update is stale." : "Courier location is current.",
    });
  } catch {
    return trackingJson({
      status: order.status,
      liveTrackingActive: true,
      trackingAvailable: false,
      location: null,
      message: "The courier is assigned. Location is temporarily unavailable.",
    });
  }
}
