/**
 * app/dashboard/org/[id]/overview/page.tsx
 *
 * Canonical Organizer Overview v2.
 * Category-agnostic, capability-driven dashboard driven by resolveOverviewModules.
 * Replaces hardcoded stat cards with a "what needs my attention today" operational screen.
 *
 * Gated to entity roles: owner, admin, manager, editor, finance, viewer.
 * Action links are restricted to canManage roles (owner, admin, manager).
 * Resilient against missing migration 174 columns.
 */

import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCapabilitiesForBusiness } from "@/lib/business-taxonomy";
import { resolveStorefrontFeatures, getBuiltStorefrontFeatures } from "@/lib/storefront-features";
import { getFlagshipTemplate } from "@/lib/website-template-v2";
import { getApprovalState } from "@/lib/business-approval";
import { resolveOrderSchedule, resolveTodayHours } from "@/lib/website-hours";
import { normalizeContent } from "@/lib/website-content";
import { getStartOfTodayInTimezone, isTodayInTimezone, DEFAULT_SITE_TIMEZONE } from "@/lib/date-timezone";
import { computeOrderOverdue } from "@/lib/order-overdue";
import { resolveOverviewModules } from "@/lib/overview-resolver";
import { OrgOverviewClient } from "@/components/dashboard/overview/OrgOverviewClient";
import type { OverviewCounts, RecentOrderSummary, RecentEventSummary } from "@/lib/overview-types";

const ALLOWED_ROLES: EntityRole[] = [
  "owner",
  "admin",
  "manager",
  "editor",
  "finance",
  "viewer",
];

export default async function OrgOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await checkTenantAccess(user.id, organizerId, ALLOWED_ROLES);
  if (!access.hasAccess) {
    return notFound();
  }

  const supabase = createSupabaseAdmin();

  // 1. Core Tenant & Business Info
  const [
    { data: org },
    { data: businesses },
    { data: websites },
  ] = await Promise.all([
    supabase
      .from("organizers")
      .select("id, name, slug, follower_offset, events_offset, average_rating, review_count")
      .eq("id", organizerId)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("id, name, slug, status, industry, category, business_type, offerings, logo")
      .eq("organizer_id", organizerId),
    supabase
      .from("tenant_websites")
      .select("id, slug, status, published_at, metadata, template_id")
      .eq("tenant_id", organizerId),
  ]);

  if (!org) return notFound();

  const primaryBusiness = (businesses && businesses.length > 0) ? businesses[0] : null;
  const primaryWebsite = (websites && websites.length > 0) ? websites[0] : null;

  // Fetch website content for hours (hours live in website_content.content.hours JSONB)
  let websiteHoursValue: unknown = null;
  if (primaryWebsite?.id) {
    const { data: contentRow } = await supabase
      .from("website_content")
      .select("content")
      .eq("website_id", primaryWebsite.id)
      .maybeSingle();
    if (contentRow?.content) {
      const contentDoc = normalizeContent(contentRow.content);
      websiteHoursValue = contentDoc.hours ?? null;
    }
  }

  // 2. Resolve Site Timezone & Website Metadata
  let siteTimezone = DEFAULT_SITE_TIMEZONE;
  if (primaryWebsite?.metadata && typeof primaryWebsite.metadata === "object") {
    const meta = primaryWebsite.metadata as Record<string, unknown>;
    if (typeof meta.timezone === "string" && meta.timezone.trim()) {
      siteTimezone = meta.timezone.trim();
    }
  }

  // 3. Approval State
  const approvalState = businesses && businesses.length > 0
    ? getApprovalState(businesses.map((b) => b.status as string))
    : "none";

  // 4. Check for Unpublished Draft Changes
  let hasUnpublishedChanges = false;
  if (primaryWebsite?.id) {
    const { data: draftContent } = await supabase
      .from("website_content_drafts")
      .select("version, updated_at")
      .eq("website_id", primaryWebsite.id)
      .maybeSingle();

    if (draftContent) {
      hasUnpublishedChanges = true;
    }
  }

  // 5. Calculate Today Start in Site Timezone
  const now = new Date();
  const startOfToday = getStartOfTodayInTimezone(siteTimezone, now);
  const startOfTodayIso = startOfToday.toISOString();

  // 6. Orders Queries (using migration 174 composite index: organizer_id, status, created_at DESC)
  let pendingOrdersCount = 0;
  let overdueOrdersCount = 0;
  let ordersTodayCount = 0;
  let salesTodayTotal = 0;
  let paidTodayTotal = 0;
  let toCollectTodayTotal = 0;
  let recentOrders: RecentOrderSummary[] = [];
  let orderCurrency = "USD";

  // Attempt fetch with migration 174 columns, fallback gracefully if not applied
  try {
    const [
      activeOrdersRes,
      todayOrdersRes,
      recentOrdersRes,
    ] = await Promise.all([
      // Active orders: pending, accepted, preparing
      supabase
        .from("orders")
        .select("id, status, created_at, estimated_ready_at")
        .eq("organizer_id", organizerId)
        .in("status", ["pending", "accepted", "preparing"]),

      // Orders placed today in site timezone
      supabase
        .from("orders")
        .select("id, total_amount, status, payment_status, currency, created_at")
        .eq("organizer_id", organizerId)
        .gte("created_at", startOfTodayIso)
        .neq("status", "cancelled"),

      // Recent 5 orders for list widget
      supabase
        .from("orders")
        .select("id, order_number, customer_name, total_amount, currency, status, created_at, fulfilment_type")
        .eq("organizer_id", organizerId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // If activeOrdersRes errored due to missing column (e.g. estimated_ready_at), run fallback
    if (activeOrdersRes.error) {
      const { data: fallbackActive } = await supabase
        .from("orders")
        .select("id, status, created_at")
        .eq("organizer_id", organizerId)
        .in("status", ["pending", "accepted", "preparing"]);

      const rows = fallbackActive ?? [];
      pendingOrdersCount = rows.filter((r) => r.status === "pending").length;
      overdueOrdersCount = rows.filter((r) => {
        const res = computeOrderOverdue({ status: r.status, created_at: r.created_at, estimated_ready_at: null }, now);
        return res.isOverdue;
      }).length;
    } else {
      const rows = activeOrdersRes.data ?? [];
      pendingOrdersCount = rows.filter((r) => r.status === "pending").length;
      overdueOrdersCount = rows.filter((r) => {
        const res = computeOrderOverdue({
          status: r.status,
          created_at: r.created_at,
          estimated_ready_at: r.estimated_ready_at,
        }, now);
        return res.isOverdue;
      }).length;
    }

    if (todayOrdersRes.data) {
      // Filter precisely by isTodayInTimezone to ensure exact midnight-to-midnight boundary
      const validToday = todayOrdersRes.data.filter((o) =>
        isTodayInTimezone(o.created_at, siteTimezone, now)
      );
      ordersTodayCount = validToday.length;

      for (const order of validToday) {
        orderCurrency = order.currency || orderCurrency;
        const amount = Number(order.total_amount || 0);
        salesTodayTotal += amount;
        if (order.payment_status === "paid") {
          paidTodayTotal += amount;
        } else {
          toCollectTodayTotal += amount;
        }
      }
    }

    if (recentOrdersRes.data) {
      recentOrders = recentOrdersRes.data.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        customerName: o.customer_name,
        totalAmount: Number(o.total_amount || 0),
        currency: o.currency || "USD",
        status: o.status,
        createdAt: o.created_at,
        fulfilmentType: o.fulfilment_type || "pickup",
      }));
    }
  } catch (ordersErr) {
    console.error("[OrgOverviewPage] Non-fatal orders fetch failure:", ordersErr);
  }

  // 6b. Reservation Head Counts (Phase 7). Cheap indexed reads scoped by
  // organizer_id: pending exact count + upcoming-today rows. Without
  // migration 176 every query errors and the widget is omitted (never crash).
  let pendingReservationsCount = 0;
  let reservationsTodayCount = 0;
  let hasAnyReservationRow = false;
  try {
    const [
      pendingRes,
      todayRes,
      anyRes,
    ] = await Promise.all([
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", organizerId)
        .eq("status", "pending"),
      supabase
        .from("reservations")
        .select("id, starts_at")
        .eq("organizer_id", organizerId)
        .in("status", ["pending", "confirmed"])
        .gte("starts_at", startOfTodayIso)
        .limit(200),
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", organizerId)
        .limit(1),
    ]);

    if (!pendingRes.error) {
      pendingReservationsCount = pendingRes.count ?? 0;
    }
    if (!todayRes.error && todayRes.data) {
      reservationsTodayCount = todayRes.data.filter((o) =>
        isTodayInTimezone(
          (o as { starts_at?: string }).starts_at ?? "",
          siteTimezone,
          now
        )
      ).length;
    }
    if (!anyRes.error) {
      hasAnyReservationRow = (anyRes.count ?? 0) > 0;
    }
  } catch (reservationsErr) {
    console.error("[OrgOverviewPage] Non-fatal reservations fetch failure:", reservationsErr);
  }

  // Reservations module visibility mirrors the sidebar rule: capability +
  // offering, or rows exist. Without migration 176 all counts stay zero and
  // the widget stays hidden.
  const hasReservationsCapability =
    (capabilities as readonly string[]).includes("RESERVATIONS") ||
    (capabilities as readonly string[]).includes("TABLES");
  const hasReservationsModule =
    (hasReservationsCapability && offerings.includes("table_reservations")) ||
    pendingReservationsCount > 0 ||
    reservationsTodayCount > 0 ||
    hasAnyReservationRow;

  // 7. Catalog Head Counts (menu items, services)
  const [
    { count: menuCount },
    { count: serviceCount },
  ] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", organizerId),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", organizerId),
  ]);

  const menuItemCount = menuCount ?? 0;
  const serviceCountTotal = serviceCount ?? 0;

  // 8. Event & Fundraiser Counts
  const [
    { count: eventCount },
    { count: fundraiserCount },
    { count: followerCount },
    { data: fundraisersData },
  ] = await Promise.all([
    supabase.from("events").select("*", { count: "exact", head: true }).eq("organizer_id", organizerId),
    supabase.from("fundraisers").select("*", { count: "exact", head: true }).eq("organizer_id", organizerId).is("deleted_at", null),
    supabase.from("organizer_follows").select("*", { count: "exact", head: true }).eq("organizer_id", organizerId),
    supabase.from("fundraisers").select("raised").eq("organizer_id", organizerId).is("deleted_at", null),
  ]);

  const totalEvents = (eventCount ?? 0) + (org.events_offset ?? 0);
  const totalFundraisers = fundraiserCount ?? 0;
  const totalFollowers = (followerCount ?? 0) + (org.follower_offset ?? 0);
  const totalRaised = (fundraisersData ?? []).reduce((sum, f) => sum + Number(f.raised || 0), 0);

  // Tickets count (only queried if totalEvents > 0 to avoid wasted joins)
  let ticketsSold = 0;
  let recentEventsList: RecentEventSummary[] = [];

  if (totalEvents > 0) {
    const { data: orgEvents } = await supabase
      .from("events")
      .select("id, title, slug, event_date, city")
      .eq("organizer_id", organizerId)
      .order("event_date", { ascending: false })
      .limit(5);

    if (orgEvents) {
      recentEventsList = orgEvents.map((e) => ({
        id: e.id,
        title: e.title,
        eventDate: e.event_date,
        city: e.city,
        slug: e.slug,
      }));

      const eventIds = orgEvents.map((e) => e.id);
      if (eventIds.length > 0) {
        const { data: ticketOrders } = await supabase
          .from("ticket_orders")
          .select("quantity")
          .in("event_id", eventIds)
          .in("status", ["valid", "used"]);

        ticketsSold = (ticketOrders ?? []).reduce(
          (sum, order) => sum + Number(order.quantity ?? 1),
          0
        );
      }
    }
  }

  // 9. Open/Closed Status Badge via lib/website-hours.ts
  let isOpen = true;
  let hoursBadgeText = "Hours not configured";
  const hoursValue = websiteHoursValue;

  if (hoursValue) {
    const sched = resolveOrderSchedule(hoursValue, siteTimezone, now);
    const todayH = resolveTodayHours(hoursValue, siteTimezone, now);
    isOpen = sched.isOpen;

    if (sched.isOpen) {
      if (todayH && todayH.close) {
        hoursBadgeText = `Open · Closes at ${todayH.close}`;
      } else {
        hoursBadgeText = "Open today";
      }
    } else {
      if (sched.nextOpenTime) {
        const dayLabel = sched.nextOpenDay ? ` ${sched.nextOpenDay}` : "";
        hoursBadgeText = `Closed · Opens${dayLabel} at ${sched.nextOpenTime}`;
      } else {
        hoursBadgeText = "Closed";
      }
    }
  }

  // 10. Ordering / Payments Readiness
  const capabilities = primaryBusiness
    ? getCapabilitiesForBusiness(
        primaryBusiness.industry || "",
        primaryBusiness.category || "",
        primaryBusiness.business_type || ""
      )
    : [];

  const offerings = (primaryBusiness?.offerings && Array.isArray(primaryBusiness.offerings))
    ? primaryBusiness.offerings
    : [];

  const flagship = getFlagshipTemplate("restaurant-artisan", "2.0.0");
  const built = flagship ? getBuiltStorefrontFeatures(flagship) : {
    ordering: true,
    delivery: true,
    pickup: true,
    reservations: false,
    onlinePayment: true,
  };

  const featureRes = resolveStorefrontFeatures({
    capabilities,
    offerings,
    built,
    currency: orderCurrency,
    hasActiveDish: menuItemCount > 0,
  });

  const isOrderingReady = featureRes.status.ordering.status === "live";

  // 11. Compile Counts Object
  const counts: OverviewCounts = {
    pendingOrders: pendingOrdersCount,
    overdueOrders: overdueOrdersCount,
    pendingReservations: hasReservationsModule ? pendingReservationsCount : 0,
    reservationsToday: hasReservationsModule ? reservationsTodayCount : undefined,
    hasReservationsModule,
    ordersToday: ordersTodayCount,
    salesToday: salesTodayTotal,
    paidToday: paidTodayTotal,
    toCollectToday: toCollectTodayTotal,
    currency: orderCurrency,
    siteTimezone,
    isOpen,
    hoursBadgeText,
    hasUnpublishedChanges,
    isSitePublished: Boolean(primaryWebsite?.published_at),
    websiteSlug: primaryWebsite?.slug ?? null,
    websiteId: primaryWebsite?.id ?? null,
    businessId: primaryBusiness?.id ?? null,
    menuItemCount,
    serviceCount: serviceCountTotal,
    hasLogo: Boolean(primaryBusiness?.logo),
    hasHours: Boolean(hoursValue),
    hasOfferings: offerings.length > 0,
    isOrderingReady,
    eventCount: totalEvents,
    fundraiserCount: totalFundraisers,
    followerCount: totalFollowers,
    ticketCount: ticketsSold,
    totalRaised,
    averageRating: org.average_rating ? Number(org.average_rating) : null,
    reviewCount: org.review_count ?? 0,
    recentOrders,
    recentEvents: recentEventsList,
  };

  // 12. Pure View-Model Resolution
  const widgets = resolveOverviewModules({
    context: "organizer",
    capabilities,
    offerings,
    features: {
      ordering: featureRes.ordering,
      delivery: featureRes.delivery,
      pickup: featureRes.pickup,
      reservations: featureRes.reservations,
      onlinePayment: featureRes.onlinePayment,
    },
    approvalState,
    counts,
    role: access.role,
  });

  return (
    <OrgOverviewClient
      organizerId={organizerId}
      orgName={org.name}
      widgets={widgets}
    />
  );
}
