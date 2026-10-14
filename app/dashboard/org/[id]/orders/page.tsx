/**
 * app/dashboard/org/[id]/orders/page.tsx
 *
 * Owner order visibility and operations page (Phase 4b+4c).
 * Fetches orders for the tenant, scoped to the authenticated organizer.
 * Allowed roles: owner, admin, manager, editor, finance (read).
 * Action buttons gated to canManage: owner, admin, manager.
 * Resilient against unapplied migration 174.
 */

import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getTranslations } from "next-intl/server";
import { OrdersClient } from "@/components/dashboard/orders/OrdersClient";
import type { DashboardOrderRow } from "@/components/dashboard/orders/OrderCard";
import { extractDeliverySettings } from "@/lib/delivery-settings";

const ALLOWED_ROLES = ["owner", "admin", "manager", "editor", "finance"] as const;
const MANAGE_ROLES: EntityRole[] = ["owner", "admin", "manager"];

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await checkTenantAccess(user.id, organizerId, [...ALLOWED_ROLES]);
  if (!access.hasAccess) {
    return notFound();
  }

  const canManage = access.role ? MANAGE_ROLES.includes(access.role) : false;

  const admin = createSupabaseAdmin();
  let orders: DashboardOrderRow[] = [];

  // 1. Fetch orders: try full migration 175 columns first
  const { data: deliveryOrders, error: deliveryError } = await admin
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_phone, customer_email, fulfilment_type, delivery_address, customer_note, currency, subtotal, delivery_fee, total_amount, status, payment_method, payment_status, payment_expires_at, scheduled_for, estimated_ready_at, status_history, cancellation_reason, items, created_at, provider, provider_reference, rider_name, rider_phone"
    )
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!deliveryError && deliveryOrders) {
    orders = deliveryOrders as unknown as DashboardOrderRow[];
  } else {
    // Fallback: try migration 174 columns
    const { data: timingOrders, error: timingError } = await admin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_phone, customer_email, fulfilment_type, delivery_address, customer_note, currency, subtotal, delivery_fee, total_amount, status, payment_method, payment_status, payment_expires_at, scheduled_for, estimated_ready_at, status_history, cancellation_reason, items, created_at, provider, provider_reference"
      )
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!timingError && timingOrders) {
      orders = ((timingOrders ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...row,
        rider_name: null,
        rider_phone: null,
      })) as unknown as DashboardOrderRow[];
    } else {
      // Resilient fallback if migration 174 is not yet applied
      const { data: baselineOrders, error: baselineError } = await admin
        .from("orders")
        .select(
          "id, order_number, customer_name, customer_phone, customer_email, fulfilment_type, delivery_address, customer_note, currency, subtotal, delivery_fee, total_amount, status, payment_method, payment_status, payment_expires_at, scheduled_for, items, created_at, provider, provider_reference"
        )
        .eq("organizer_id", organizerId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (baselineError) {
        console.error("[orders-page] baseline fetch error:", baselineError.code);
      }

      orders = ((baselineOrders ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...row,
        estimated_ready_at: null,
        status_history: [],
        cancellation_reason: null,
        rider_name: null,
        rider_phone: null,
      })) as unknown as DashboardOrderRow[];
    }
  }

  // 2. Fetch website metadata and business details for courier dispatch & settings
  const [websiteRes, businessRes] = await Promise.all([
    admin
      .from("tenant_websites")
      .select("id, slug, metadata")
      .eq("tenant_id", organizerId)
      .maybeSingle(),
    admin
      .from("businesses")
      .select("name, address, phone, offerings")
      .eq("organizer_id", organizerId)
      .maybeSingle(),
  ]);

  const websiteRow = websiteRes.data;
  const businessRow = businessRes.data;

  const websiteSlug = websiteRow?.slug ?? null;
  const websiteId = websiteRow?.id ?? null;
  const deliverySettings = extractDeliverySettings(websiteRow?.metadata);
  const offerings = Array.isArray(businessRow?.offerings) ? businessRow.offerings : [];
  const hasDeliveryOffering =
    offerings.includes("delivery") || offerings.includes("delivery_to_customer");

  const orderCurrency = orders[0]?.currency || "XOF";
  const t = await getTranslations("Orders");

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
        </div>
      </div>

      <OrdersClient
        initialOrders={orders}
        organizerId={organizerId}
        canManage={canManage}
        websiteSlug={websiteSlug}
        websiteId={websiteId}
        courierWhatsapp={deliverySettings.courier_whatsapp}
        businessName={businessRow?.name ?? null}
        businessAddress={businessRow?.address ?? null}
        businessPhone={businessRow?.phone ?? null}
        initialDeliverySettings={deliverySettings}
        hasDeliveryOffering={hasDeliveryOffering}
        currency={orderCurrency}
      />
    </div>
  );
}
