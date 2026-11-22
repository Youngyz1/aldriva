import type { Metadata } from "next";
import { Suspense } from "react";
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
import { normalizeContent } from "@/lib/website-content";
import { resolveOrderSchedule } from "@/lib/website-hours";
import { resolveWebsiteTimezone } from "@/lib/date-timezone";
import { resolveAcceptOrdersWhenClosed } from "@/lib/storefront-settings";

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

/** Static shell: the slow rate-limited lookup streams behind Suspense. */
export default async function CustomerOrderTrackingPage({
  params,
}: TrackingPageProps) {
  const { slug, tracking_token: trackingToken } = await params;
  return (
    <Suspense fallback={<TrackingShell />}>
      <TrackingBody slug={slug} trackingToken={trackingToken} />
    </Suspense>
  );
}

function TrackingShell() {
  return (
    <main className="public-site flex min-h-screen items-center justify-center bg-[var(--ps-cream)] p-[var(--ps-space-6)] text-center text-[var(--ps-text)]">
      <p className="text-sm text-[var(--ps-muted)]">Loading your order…</p>
    </main>
  );
}

async function TrackingBody({
  slug,
  trackingToken,
}: {
  slug: string;
  trackingToken: string;
}) {
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
    .select("id, tenant_id, slug, metadata")
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
      "id, order_number, customer_name, customer_phone, customer_email, fulfilment_type, table_id, table_label, dine_in_confirmation, delivery_address, customer_note, currency, subtotal, delivery_fee, total_amount, status, payment_method, payment_status, payment_expires_at, scheduled_for, estimated_ready_at, status_history, cancellation_reason, rider_name, rider_phone, courier_worker_id, items, created_at, organizer_id, delivery_rating"
    )
    .eq("tracking_token", trackingToken)
    .eq("organizer_id", website.tenant_id)
    .maybeSingle();

  if (!timingError && timingOrder) {
    orderRow = timingOrder as Record<string, unknown>;
  } else {
    // Resilient fallback for installations missing newer order columns.
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
      table_id: null,
      table_label: null,
      dine_in_confirmation: null,
      payment_expires_at: null,
      estimated_ready_at: null,
      status_history: [],
      cancellation_reason: null,
      rider_name: null,
      rider_phone: null,
      courier_worker_id: null,
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

  // Registered rider contact is exposed only during an active assigned delivery.
  const isActiveCourierAssignment =
    Boolean(orderRow.courier_worker_id) &&
    ["accepted", "preparing", "ready", "picked_up", "out_for_delivery"].includes(String(orderRow.status));
  const courierContactAvailable =
    isActiveCourierAssignment && ["picked_up", "out_for_delivery"].includes(String(orderRow.status));

  // Closed-business notice: only while the business is still closed, the
  // order is waiting for that opening, and it has not been prepared yet.
  let closedPreparedFrom: string | null = null;
  if (
    orderRow.scheduled_for &&
    ["pending", "accepted"].includes(String(orderRow.status))
  ) {
    const { data: contentRow } = await admin
      .from("website_content")
      .select("content")
      .eq("website_id", (website as { id?: string }).id ?? null)
      .maybeSingle();
    const hours = normalizeContent((contentRow as { content?: unknown } | null)?.content ?? {}).hours;
    const schedule = resolveOrderSchedule(
      hours,
      resolveWebsiteTimezone((website as { metadata?: unknown }).metadata),
      new Date(),
      { acceptOrdersWhenClosed: resolveAcceptOrdersWhenClosed((website as { metadata?: unknown }).metadata) }
    );
    if (!schedule.isOpen) {
      closedPreparedFrom = String(orderRow.scheduled_for);
    }
  }

  const trackingData: OrderTrackingData = {
    orderNumber: String(orderRow.order_number),
    businessName: business?.name || "Restaurant",
    businessPhone: business?.phone || null,
    siteSlug: slug,
    status: String(orderRow.status),
    fulfilmentType: String(orderRow.fulfilment_type),
    tableLabel: orderRow.table_label ? String(orderRow.table_label) : null,
    waiterConfirmationState: orderRow.dine_in_confirmation ? String(orderRow.dine_in_confirmation) : null,
    deliveryAddress: orderRow.delivery_address ? String(orderRow.delivery_address) : null,
    customerNote: orderRow.customer_note ? String(orderRow.customer_note) : null,
    currency: String(orderRow.currency),
    subtotal: Number(orderRow.subtotal),
    deliveryFee: Number(orderRow.delivery_fee),
    totalAmount: Number(orderRow.total_amount),
    paymentMethod: String(orderRow.payment_method),
    paymentStatus: String(orderRow.payment_status),
    paymentExpiresAt: orderRow.payment_expires_at ? String(orderRow.payment_expires_at) : null,
    scheduledFor: orderRow.scheduled_for ? String(orderRow.scheduled_for) : null,
    estimatedReadyAt: orderRow.estimated_ready_at ? String(orderRow.estimated_ready_at) : null,
    cancellationReason: orderRow.cancellation_reason ? String(orderRow.cancellation_reason) : null,
    riderName: isActiveCourierAssignment && orderRow.rider_name ? String(orderRow.rider_name) : null,
    riderPhone: courierContactAvailable && orderRow.rider_phone ? String(orderRow.rider_phone) : null,
    courierAssigned: isActiveCourierAssignment,
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
    closedPreparedFrom,
  };

  return <OrderTrackingView order={trackingData} />;
}
