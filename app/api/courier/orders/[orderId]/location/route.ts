import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { courierJson, validCourierOrderId, validateCourierRequestSession } from "@/lib/courier/http";
import { haversineDistanceMeters } from "@/lib/routing/haversine";

const MIN_INTERVAL_SECONDS = 4;
const MIN_DISTANCE_METERS = 10;
const MAX_LOCATION_AGE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FUTURE_TOLERANCE_MS = 60 * 1000; // 1 minute

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { session } = await validateCourierRequestSession(request);
  if (!session) return courierJson({ error: "Courier session is no longer valid." }, 401);

  const { orderId } = await params;
  if (!validCourierOrderId(orderId)) return courierJson({ error: "Delivery not found." }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return courierJson({ error: "Invalid JSON body." }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return courierJson({ error: "Invalid location payload." }, 400);
  }

  const { latitude, longitude, accuracy, heading, speed, recordedAt } = body as Record<string, unknown>;

  if (
    typeof latitude !== "number" ||
    Number.isNaN(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    Number.isNaN(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return courierJson({ error: "Invalid coordinates." }, 400);
  }

  const parsedAccuracy =
    typeof accuracy === "number" && !Number.isNaN(accuracy) && accuracy >= 0 ? accuracy : null;
  const parsedHeading =
    typeof heading === "number" && !Number.isNaN(heading) && heading >= 0 && heading <= 360 ? heading : null;
  const parsedSpeed =
    typeof speed === "number" && !Number.isNaN(speed) && speed >= 0 ? speed : null;

  let recordedDate = new Date();
  if (typeof recordedAt === "string" || typeof recordedAt === "number") {
    const candidate = new Date(recordedAt);
    if (!Number.isNaN(candidate.getTime())) {
      recordedDate = candidate;
    }
  }

  const nowMs = Date.now();
  const recordedMs = recordedDate.getTime();
  if (nowMs - recordedMs > MAX_LOCATION_AGE_MS || recordedMs - nowMs > MAX_FUTURE_TOLERANCE_MS) {
    return courierJson({ error: "Location timestamp is stale or invalid." }, 400);
  }

  const admin = createSupabaseAdmin();

  // 1. Verify worker is active
  const { data: worker, error: workerError } = await admin
    .from("business_workers")
    .select("id")
    .eq("id", session.workerId)
    .eq("business_id", session.businessId)
    .eq("role", "courier")
    .eq("is_active", true)
    .is("deactivated_at", null)
    .maybeSingle();

  if (workerError || !worker) {
    return courierJson({ error: "Courier access is no longer valid." }, 403);
  }

  // 2. Verify order belongs to this courier and is in active delivery transit
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, courier_worker_id")
    .eq("id", orderId)
    .eq("business_id", session.businessId)
    .eq("courier_worker_id", session.workerId)
    .maybeSingle();

  if (orderError || !order) {
    return courierJson({ error: "Order not found or not assigned to you." }, 404);
  }

  if (order.status !== "picked_up" && order.status !== "out_for_delivery") {
    return courierJson(
      { error: "Location updates are only accepted during active delivery." },
      409
    );
  }

  // 3. Throttling: Check latest recorded location
  try {
    const { data: latestLoc, error: queryError } = await admin
      .from("order_delivery_locations")
      .select("latitude, longitude, recorded_at")
      .eq("order_id", orderId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!queryError && latestLoc) {
      const prevRecordedMs = new Date(latestLoc.recorded_at).getTime();
      const secondsSinceLast = (recordedMs - prevRecordedMs) / 1000;

      if (secondsSinceLast < MIN_INTERVAL_SECONDS) {
        const distanceMoved = haversineDistanceMeters(
          { latitude, longitude },
          { latitude: latestLoc.latitude, longitude: latestLoc.longitude }
        );

        if (distanceMoved < MIN_DISTANCE_METERS) {
          // Throttled: No significant movement within min interval
          return courierJson({ ok: true, throttled: true });
        }
      }
    }

    // 4. Insert new breadcrumb
    const { error: insertError } = await admin.from("order_delivery_locations").insert({
      order_id: orderId,
      courier_worker_id: session.workerId,
      latitude,
      longitude,
      accuracy: parsedAccuracy,
      heading: parsedHeading,
      speed: parsedSpeed,
      recorded_at: recordedDate.toISOString(),
    });

    if (insertError) {
      // If table does not exist yet in staging (pending manual migration), don't break courier app
      if (insertError.code === "42P01" || insertError.message?.includes("does not exist")) {
        return courierJson({ ok: true, unmigrated: true });
      }
      return courierJson({ error: "Failed to persist location." }, 500);
    }

    return courierJson({ ok: true, inserted: true });
  } catch {
    return courierJson({ error: "Failed to record location." }, 500);
  }
}
