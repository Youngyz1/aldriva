import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  OrderTrackingView,
  type OrderTrackingData,
} from "@/components/site/OrderTrackingView";
import type { DashboardOrderItem } from "@/components/dashboard/orders/OrderCard";
import { maskCustomerName, maskCustomerPhone } from "@/lib/order-masking";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

interface TrackingPageProps {
  params: Promise<{
    slug: string;
    tracking_token: string;
  }>;
}

export default async function CustomerOrderTrackingPage({
  params,
}: TrackingPageProps) {
  const { slug, tracking_token: trackingToken } = await params;

  // 1. Rate limiting by IP: 60 reads per 10 minutes
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip =
    headerList.get("x-real-ip") ||
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
    "unknown";

  const rateCheck = await checkRateLimit("orderTrackingView", `ip:${ip}`);
  if (!rateCheck.allowed) {
    return (
      <main className="public-site flex min-h-screen items-center justify-center bg-[var(--ps-cream)] p-[var(--ps-space-6)] text-center text-[var(--ps-text)]">
        <div className="ps-card max-w-md p-[var(--ps-space-8)]">
          <h1 className="font-bold">Too many requests</h1>
          <p className="mt-[var(--ps-space-2)] text-xs text-[var(--ps-muted)]">
            Please wait a moment before refreshing your order tracking page.
          </p>
        </div>
      </main>
    );
  }

  const admin = createSupabaseAdmin();

  // 2. Fetch published website by slug
  const { data: website } = await admin
    .from("tenant_websites")
    .select("tenant_id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!website) {
    return notFound();
  }

  // 3. Fetch linked business details (name, phone)
  const { data: business } = await admin
    .from("businesses")
    .select("name, phone")
    .eq("organizer_id", website.tenant_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // 4. Fetch order by tracking_token (resilient to migration 174 status)
  let orderRow: Record<string, unknown> | null = null;

  const { data: timingOrder, error: timingError } = await admin
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_phone, customer_email, fulfilment_type, delivery_address, customer_note, currency, subtotal, delivery_fee, total_amount, status, payment_method, payment_status, scheduled_for, estimated_ready_at, status_history, cancellation_reason, rider_name, rider_phone, items, created_at, organizer_id, delivery_rating"
    )
    .eq("tracking_token", trackingToken)
    .eq("organizer_id", website.tenant_id)
    .maybeSingle();

  if (!timingError && timingOrder) {
    orderRow = timingOrder as Record<string, unknown>;
  } else {
    // Resilient fallback if migration 175/174 columns are not yet applied
    const { data: baselineOrder, error: baselineError } = await admin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_phone, customer_email, fulfilment_type, delivery_address, customer_note, currency, subtotal, delivery_fee, total_amount, status, payment_method, payment_status, scheduled_for, items, created_at, organizer_id"
      )
      .eq("tracking_token", trackingToken)
      .eq("organizer_id", website.tenant_id)
      .maybeSingle();

    if (baselineError || !baselineOrder) {
      return notFound();
    }

    orderRow = {
      ...baselineOrder,
      estimated_ready_at: null,
      status_history: [],
      cancellation_reason: null,
      rider_name: null,
      rider_phone: null,
    };
  }

  if (!orderRow) {
    return notFound();
  }

  const rawItems = Array.isArray(orderRow.items)
    ? (orderRow.items as DashboardOrderItem[])
    : [];

  const rawHistory = Array.isArray(orderRow.status_history)
    ? (orderRow.status_history as Array<{
        status: string;
        at: string;
        reason?: string | null;
        note?: string | null;
        estimated_ready_at?: string | null;
      }>)
    : [];

  // Rider contact is exposed only while the order is out for delivery —
  // completed/delivered/cancelled views never carry it.
  const isOutForDeliveryRow = String(orderRow.status) === "out_for_delivery";

  const trackingData: OrderTrackingData = {
    orderNumber: String(orderRow.order_number),
    businessName: business?.name || "Restaurant",
    businessPhone: business?.phone || null,
    siteSlug: slug,
    status: String(orderRow.status),
    fulfilmentType: String(orderRow.fulfilment_type),
    deliveryAddress: orderRow.delivery_address ? String(orderRow.delivery_address) : null,
    customerNote: orderRow.customer_note ? String(orderRow.customer_note) : null,
    currency: String(orderRow.currency),
    subtotal: Number(orderRow.subtotal),
    deliveryFee: Number(orderRow.delivery_fee),
    totalAmount: Number(orderRow.total_amount),
    paymentMethod: String(orderRow.payment_method),
    paymentStatus: String(orderRow.payment_status),
    scheduledFor: orderRow.scheduled_for ? String(orderRow.scheduled_for) : null,
    estimatedReadyAt: orderRow.estimated_ready_at ? String(orderRow.estimated_ready_at) : null,
    cancellationReason: orderRow.cancellation_reason ? String(orderRow.cancellation_reason) : null,
    riderName: isOutForDeliveryRow && orderRow.rider_name ? String(orderRow.rider_name) : null,
    riderPhone: isOutForDeliveryRow && orderRow.rider_phone ? String(orderRow.rider_phone) : null,
    trackingToken,
    deliveryRating:
      orderRow.delivery_rating !== undefined && orderRow.delivery_rating !== null
        ? Number(orderRow.delivery_rating)
        : null,
    statusHistory: rawHistory,
    items: rawItems,
    createdAt: String(orderRow.created_at),
    maskedCustomerName: maskCustomerName(String(orderRow.customer_name || "")),
    maskedCustomerPhone: maskCustomerPhone(String(orderRow.customer_phone || "")),
  };

  return <OrderTrackingView order={trackingData} />;
}
