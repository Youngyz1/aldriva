import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingToken: string }> }
) {
  const { trackingToken } = await params;

  if (!trackingToken || typeof trackingToken !== "string" || !/^[a-zA-Z0-9_-]{10,80}$/.test(trackingToken)) {
    return NextResponse.json({ error: "Invalid tracking token." }, { status: 400 });
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
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const admin = createSupabaseAdmin();

  // 1. Fetch order by tracking_token
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, fulfilment_type, delivery_address, rider_name, rider_phone")
    .eq("tracking_token", trackingToken)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // 2. Privacy gate: Only stream live courier coordinates when status is 'out_for_delivery'
  if (order.status !== "out_for_delivery") {
    return NextResponse.json({
      status: order.status,
      liveTrackingActive: false,
      location: null,
      message:
        order.status === "delivered" || order.status === "completed"
          ? "Delivery completed."
          : "Live tracking will become active when courier departs with your order.",
    });
  }

  // 3. Fetch latest courier breadcrumb for this order
  try {
    const { data: latestLoc, error: locError } = await admin
      .from("order_delivery_locations")
      .select("latitude, longitude, accuracy, heading, speed, recorded_at")
      .eq("order_id", order.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (locError) {
      // Graceful fallback if table not yet created on target database
      return NextResponse.json({
        status: order.status,
        liveTrackingActive: true,
        location: null,
      });
    }

    if (!latestLoc) {
      return NextResponse.json({
        status: order.status,
        liveTrackingActive: true,
        location: null,
      });
    }

    const recordedMs = new Date(latestLoc.recorded_at).getTime();
    const isStale = Date.now() - recordedMs > STALE_THRESHOLD_MS;

    return NextResponse.json({
      status: order.status,
      liveTrackingActive: true,
      location: {
        latitude: latestLoc.latitude,
        longitude: latestLoc.longitude,
        accuracy: latestLoc.accuracy,
        heading: latestLoc.heading,
        speed: latestLoc.speed,
        recordedAt: latestLoc.recorded_at,
        isStale,
      },
    });
  } catch {
    return NextResponse.json({
      status: order.status,
      liveTrackingActive: true,
      location: null,
    });
  }
}
