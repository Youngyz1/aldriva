import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ trackingToken: string }> }
) {
  const { trackingToken } = await params;

  if (!trackingToken || typeof trackingToken !== "string" || !/^[a-zA-Z0-9_-]{10,80}$/.test(trackingToken)) {
    return NextResponse.json({ error: "Invalid tracking token." }, { status: 400 });
  }

  // Rate limit by client IP: 10 ratings per 10 minutes
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip =
    headerList.get("x-real-ip") ||
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
    "unknown";

  const rateCheck = await checkRateLimit("orderTrackingView", `rating:ip:${ip}`);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid rating payload." }, { status: 400 });
  }

  const { rating, comment } = body as Record<string, unknown>;

  // Validate rating: integer 1-5
  if (
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return NextResponse.json({ error: "Rating must be an integer from 1 to 5." }, { status: 400 });
  }

  // Validate comment: optional string, max 500 chars
  let sanitizedComment: string | null = null;
  if (comment !== undefined && comment !== null && comment !== "") {
    if (typeof comment !== "string" || comment.length > 500) {
      return NextResponse.json({ error: "Comment must be a string of at most 500 characters." }, { status: 400 });
    }
    sanitizedComment = comment.trim() || null;
  }

  const admin = createSupabaseAdmin();

  // 1. Fetch order by tracking_token
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, fulfilment_type, delivery_rating")
    .eq("tracking_token", trackingToken)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // 2. Only allow rating for delivered delivery orders
  if (order.fulfilment_type !== "delivery") {
    return NextResponse.json({ error: "Ratings are only available for delivery orders." }, { status: 409 });
  }

  if (order.status !== "delivered" && order.status !== "completed") {
    return NextResponse.json(
      { error: "The delivery must be completed before rating." },
      { status: 409 }
    );
  }

  // 3. Prevent overwriting an existing rating
  if (order.delivery_rating !== null) {
    return NextResponse.json(
      { error: "This delivery has already been rated." },
      { status: 409 }
    );
  }

  // 4. Persist rating
  try {
    const { error: updateError } = await admin
      .from("orders")
      .update({
        delivery_rating: rating,
        delivery_rating_comment: sanitizedComment,
      })
      .eq("id", order.id)
      .eq("tracking_token", trackingToken);

    if (updateError) {
      // Graceful fallback if columns don't exist yet (pending migration 191)
      if (updateError.code === "42703" || updateError.message?.includes("does not exist")) {
        return NextResponse.json({ ok: true, unmigrated: true });
      }
      return NextResponse.json({ error: "Failed to save rating." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save rating." }, { status: 500 });
  }
}
