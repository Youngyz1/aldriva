import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to retry delivery dispatch." }, { status: 401 });

  const { orderId } = await params;
  if (!UUID_PATTERN.test(orderId)) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, organizer_id, business_id, status, fulfilment_type, estimated_ready_at, courier_worker_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const access = await checkTenantAccess(user.id, order.organizer_id, ["owner", "admin", "manager"]);
  if (!access.hasAccess) return NextResponse.json({ error: "You cannot manage delivery dispatch for this business." }, { status: 403 });

  if (
    order.fulfilment_type !== "delivery" ||
    !["accepted", "preparing", "ready"].includes(order.status) ||
    !order.estimated_ready_at ||
    order.courier_worker_id
  ) {
    return NextResponse.json({ error: "This order is not waiting for a courier assignment." }, { status: 409 });
  }

  const { data: openOfferCount, error: dispatchError } = await admin.rpc("dispatch_business_courier_order", {
    p_order_id: order.id,
    p_reoffer: true,
  });
  if (dispatchError) {
    if (dispatchError.message?.includes("COURIER_DISPATCH_BATCH_STILL_OPEN")) {
      return NextResponse.json({ error: "Courier offers are still within their response window. Retry after the current offers expire." }, { status: 409 });
    }
    return NextResponse.json({ error: "Courier dispatch is unavailable. Check the staging database migration." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, openOfferCount: Number(openOfferCount ?? 0) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
