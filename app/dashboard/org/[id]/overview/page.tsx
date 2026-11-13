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
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCapabilitiesForBusiness } from "@/lib/business-taxonomy";
import { resolveStorefrontFeatures, getBuiltStorefrontFeatures } from "@/lib/storefront-features";
import { getFlagshipTemplate } from "@/lib/website-template-v2";
import { getApprovalState } from "@/lib/business-approval";
import { resolveOrderSchedule, resolveTodayHours, hoursBadgeState } from "@/lib/website-hours";
import { normalizeContent } from "@/lib/website-content";
import { getStartOfTodayInTimezone, isTodayInTimezone, DEFAULT_SITE_TIMEZONE, resolveSiteTimezone } from "@/lib/date-timezone";
import { computeOrderOverdue } from "@/lib/order-overdue";
import { resolveOverviewModules, shouldShowInvitationAction } from "@/lib/overview-resolver";
import {
  classifyOrganizerDashboardTypes,
  isOrganizerDashboardBusiness,
} from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { CreateInvitationButton } from "@/components/events/CreateInvitationButton";
import { OverviewShell } from "@/components/dashboard/overview/OverviewShell";
import { EntityHeader } from "@/components/dashboard/overview/EntityHeader";
import { AttentionCard } from "@/components/dashboard/overview/AttentionCard";
import { SetupBanner } from "@/components/dashboard/overview/SetupBanner";
import { StatCard } from "@/components/dashboard/overview/StatCard";
import { QuickActions } from "@/components/dashboard/overview/QuickActions";
import { CapabilityOverviewSections } from "@/components/dashboard/overview/CapabilityOverviewSections";
import { parsePeriodSearchParams, resolvePeriodRange } from "@/lib/dashboard/date-range";
import type { OverviewCounts, RecentOrderSummary, RecentEventSummary, AttentionItem, QuickActionItem, SetupChecklistItem } from "@/lib/overview-types";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
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
      .select("id, name, slug, status, industry, category, business_type, offerings, logo, country, created_at")
      .eq("organizer_id", organizerId),
    supabase
      .from("tenant_websites")
      .select("id, slug, status, metadata, created_at")
      .eq("tenant_id", organizerId),
  ]);

  if (!org) return notFound();

  const eligibleBusinesses = (businesses ?? []).filter(isOrganizerDashboardBusiness);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const queryBusinessId = typeof resolvedSearchParams.business === "string" ? resolvedSearchParams.business : null;
  const cookieStore = await cookies();
  const cookieBusinessId = cookieStore.get(getActiveBusinessCookieName(organizerId))?.value ?? null;
  const primaryBusiness = resolveActiveBusiness(eligibleBusinesses, {
    searchParamBusinessId: queryBusinessId,
    cookieBusinessId,
  });
  const primaryWebsite = (websites && websites.length > 0)
    ? [...websites].sort((a, b) =>
        String((a as { created_at?: unknown }).created_at ?? "").localeCompare(
          String((b as { created_at?: unknown }).created_at ?? "")
        )
      )[0]
    : null;

  // Fetch website content for hours. Canonical source:
  // website_content.content.hours (live). The unpublished draft is read too,
  // so hours saved in Settings/the builder show an honest state before publish.
  let websiteHoursValue: unknown = null;
  let draftHoursValue: unknown = null;
  if (primaryWebsite?.id) {
    const [{ data: contentRow }, { data: draftRow }] = await Promise.all([
      supabase
        .from("website_content")
        .select("content")
        .eq("website_id", primaryWebsite.id)
        .maybeSingle(),
      supabase
        .from("website_content_drafts")
        .select("content")
        .eq("website_id", primaryWebsite.id)
        .maybeSingle(),
    ]);
    if (contentRow?.content) {
      const contentDoc = normalizeContent(contentRow.content);
      websiteHoursValue = contentDoc.hours ?? null;
    }
    if (draftRow?.content) {
      const draftDoc = normalizeContent(draftRow.content);
      draftHoursValue = draftDoc.hours ?? null;
    }
  }

  // 2. Resolve the site timezone. Country is not a reliable timezone source.
  let siteTimezone = DEFAULT_SITE_TIMEZONE;
  if (primaryWebsite?.metadata && typeof primaryWebsite.metadata === "object") {
    const meta = primaryWebsite.metadata as Record<string, unknown>;
    siteTimezone = resolveSiteTimezone(meta.timezone, DEFAULT_SITE_TIMEZONE);
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
        .eq("booking_type", "table")
        .eq("status", "pending"),
      supabase
        .from("reservations")
        .select("id, starts_at")
        .eq("organizer_id", organizerId)
        .eq("booking_type", "table")
        .in("status", ["pending", "confirmed"])
        .gte("starts_at", startOfTodayIso)
        .limit(200),
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", organizerId)
        .eq("booking_type", "table")
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
  // the widget stays hidden. Table reservations only (booking_type='table')
  // — general/appointment bookings have their own Bookings page and never
  // trigger this widget.
  const hasReservationsCapability =
    (capabilities as readonly string[]).includes("RESERVATIONS") ||
    (capabilities as readonly string[]).includes("TABLES");
  const hasReservationsModule =
    (hasReservationsCapability && offerings.includes("table_reservations")) ||
    pendingReservationsCount > 0 ||
    reservationsTodayCount > 0 ||
    hasAnyReservationRow;

  // 7. Menu & Service Counts
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

  // 7b. Rental setup-checklist signals (only queried for fleet-capable
  // orgs, mirroring the menu/service counts above being queried unconditionally
  // but used only when relevant).
  const hasFleetCapability = (capabilities as readonly string[]).some((c) =>
    ["VEHICLES", "VEHICLE_RENTAL"].includes(c)
  );
  let hasFleetVehicle = false;
  let hasVehicleCategoryRates = false;
  if (hasFleetCapability) {
    const [{ count: vehicleCount }, { count: ratedCategoryCount }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", organizerId)
        .eq("is_active", true),
      supabase
        .from("vehicle_categories")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", organizerId)
        .gt("daily_rate", 0),
    ]);
    hasFleetVehicle = (vehicleCount ?? 0) > 0;
    hasVehicleCategoryRates = (ratedCategoryCount ?? 0) > 0;
  }

  // 8. Event & Fundraiser Counts
  const [
    { count: eventCount, data: eventRows },
    { count: fundraiserCount, data: fundraiserRows },
    { count: followerCount },
    { data: fundraisersData },
  ] = await Promise.all([
    supabase.from("events").select("id, deleted_at", { count: "exact" }).eq("organizer_id", organizerId).is("deleted_at", null).limit(1),
    supabase.from("fundraisers").select("id, deleted_at", { count: "exact" }).eq("organizer_id", organizerId).is("deleted_at", null).limit(1),
    supabase.from("organizer_follows").select("*", { count: "exact", head: true }).eq("organizer_id", organizerId),
    supabase.from("fundraisers").select("raised").eq("organizer_id", organizerId).is("deleted_at", null),
  ]);

  const organizerTypes = classifyOrganizerDashboardTypes({
    events: eventRows ?? [],
    fundraisers: fundraiserRows ?? [],
    businesses: businesses ?? [],
  });

  const totalEvents = (eventCount ?? 0) + (org.events_offset ?? 0);
  const totalFundraisers = fundraiserCount ?? 0;
  const totalFollowers = (followerCount ?? 0) + (org.follower_offset ?? 0);
  const totalRaised = (fundraisersData ?? []).reduce((sum, f) => sum + Number(f.raised || 0), 0);

  // Augment capabilities from organizer type classification so pure events/
  // fundraising orgs get their overview sections even with no linked business.
  const augmentedCaps: string[] = [...(capabilities as string[])];
  if ((organizerTypes.hasEvents || totalEvents > 0) && !augmentedCaps.includes("EVENTS")) {
    augmentedCaps.push("EVENTS");
  }
  if ((organizerTypes.hasFundraisers || totalFundraisers > 0)) {
    if (!augmentedCaps.includes("FUNDRAISING")) augmentedCaps.push("FUNDRAISING");
    if (!augmentedCaps.includes("DONATIONS")) augmentedCaps.push("DONATIONS");
  }

  // Tickets count (only queried if totalEvents > 0 to avoid wasted joins)
  let ticketsSold = 0;
  let recentEventsList: RecentEventSummary[] = [];

  if (organizerTypes.hasEvents) {
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
  // Live hours drive scheduling; draft-only hours mean "saved, not published".
  let isOpen = true;
  let hoursBadgeText = "Hours not configured";
  const hoursValue = websiteHoursValue;
  const hasDraftHours = draftHoursValue != null;

  if (hoursBadgeState(websiteHoursValue, draftHoursValue) === "saved-unpublished") {
    hoursBadgeText = "Hours saved, website not published";
  } else if (hoursValue) {
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
    isSitePublished: primaryWebsite?.status === "published",
    websiteSlug: primaryWebsite?.slug ?? null,
    websiteId: primaryWebsite?.id ?? null,
    businessId: primaryBusiness?.id ?? null,
    menuItemCount,
    serviceCount: serviceCountTotal,
    hasLogo: Boolean(primaryBusiness?.logo),
    hasHours: Boolean(hoursValue) || hasDraftHours,
    hasOfferings: offerings.length > 0,
    isOrderingReady,
    hasFleetVehicle,
    hasVehicleCategoryRates,
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
    organizerTypes,
    capabilities: augmentedCaps as typeof capabilities,
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

  const canManage = ["owner", "admin", "manager", "editor"].includes(access.role || "");

  // Resolve active period filter
  const searchParamsObj = searchParams ? await searchParams : {};
  const periodValue = parsePeriodSearchParams(searchParamsObj);
  const periodRange = resolvePeriodRange(
    periodValue.kind,
    siteTimezone,
    periodValue.from,
    periodValue.to,
    now
  );

  // Widget payloads
  const attentionWidget = widgets.find((w) => w.id === "attention_strip");
  const attentionItems = (attentionWidget?.data as AttentionItem[]) || [];

  const checklistWidget = widgets.find((w) => w.id === "setup_checklist");
  const checklistData = checklistWidget?.data as { items?: SetupChecklistItem[] } | undefined;
  const checklistSteps = checklistData?.items || [];

  const actionsWidget = widgets.find((w) => w.id === "quick_actions");
  const quickActions = (actionsWidget?.data as QuickActionItem[]) || [];

  // Keep the existing invitation draft entry point alongside the role-gated
  // event creation action. View-only roles do not receive either action.
  const canCreateInvitations = shouldShowInvitationAction(widgets);

  // Hide create actions when the workspace already has content.
  const workspaceHasContent =
    (counts.eventCount ?? 0) > 0 ||
    (counts.fundraiserCount ?? 0) > 0 ||
    (counts.ordersToday ?? 0) > 0 ||
    (counts.serviceCount ?? 0) > 0 ||
    (counts.menuItemCount ?? 0) > 0;

  // Filter create actions when workspace has content.
  const visibleQuickActions = workspaceHasContent
    ? quickActions.filter((a) => !String((a as { id?: unknown }).id ?? "").startsWith("create_"))
    : quickActions;

  return (
    <OverviewShell
      workspaceName={org.name}
      header={
        <EntityHeader
          name={org.name}
          statusBadge={primaryBusiness ? hoursBadgeText : undefined}
          currentPeriod={periodRange.kind}
          timezone={siteTimezone}
          from={periodValue.from}
          to={periodValue.to}
        />
      }
    >
      {/* 1. Needs Attention */}
      {attentionItems.length > 0 && (
        <AttentionCard
          items={attentionItems}
          organizerId={organizerId}
        />
      )}

      {/* 2. Setup Checklist (Slim Banner) */}
      <SetupBanner steps={checklistSteps} organizerId={organizerId} />

{/* 3. Top Summary Row — only cards relevant to enabled capabilities */}
        {(() => {
          const hasCommerce = augmentedCaps.some((c: string) =>
            ["ORDERS", "ONLINE_ORDERING", "MENU"].includes(c)
          ) || (augmentedCaps.some((c: string) =>
            ["VEHICLES", "VEHICLE_RENTAL"].includes(c)
          ) ? organizerTypes.hasBusiness && augmentedCaps.some((c: string) =>
            ["ORDERS", "ONLINE_ORDERING", "MENU"].includes(c)
          ) : organizerTypes.hasBusiness);
          const hasBookingsCap = augmentedCaps.some((c: string) =>
            ["BOOKINGS", "APPOINTMENTS", "RESERVATIONS", "TABLES"].includes(c)
          );
          const hasFleetCap = augmentedCaps.some((c: string) =>
            ["VEHICLES", "VEHICLE_RENTAL"].includes(c)
          );
          // Fleet orgs only show Gross Sales/Orders if they have ordering capabilities
          const effectiveHasCommerce = hasFleetCap
            ? augmentedCaps.some((c: string) =>
                ["ORDERS", "ONLINE_ORDERING", "MENU"].includes(c)
              )
            : hasCommerce;
          const cards = [];
        if (effectiveHasCommerce) {
          cards.push(
            <StatCard
              key="sales"
              label="Gross Sales"
              value={counts.salesToday ?? 0}
              format="money"
              currency={counts.currency || "USD"}
              href={`/dashboard/org/${organizerId}/orders`}
            />,
            <StatCard
              key="orders"
              label="Orders"
              value={counts.ordersToday ?? 0}
              format="count"
              href={`/dashboard/org/${organizerId}/orders`}
            />
          );
        }
        if ((hasBookingsCap || hasReservationsModule) && !hasFleetCap) {
          cards.push(
            <StatCard
              key="bookings"
              label="Bookings"
              value={counts.reservationsToday ?? counts.pendingReservations ?? 0}
              format="count"
              href={`/dashboard/org/${organizerId}/reservations`}
            />
          );
        }
        if (organizerTypes.hasFundraisers) {
          cards.push(
            <StatCard
              key="raised"
              label="Total Raised"
              value={counts.totalRaised ?? 0}
              format="money"
              currency={counts.currency || "USD"}
              href={`/dashboard/org/${organizerId}/fundraisers`}
            />
          );
        }
        if (cards.length === 0) return null;
        return (
          <div className={`grid gap-3 ${cards.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
            {cards}
          </div>
        );
      })()}

      {/* 4. Primary Action Area */}
      {visibleQuickActions.length > 0 && (
        <QuickActions
          actions={visibleQuickActions}
          organizerId={organizerId}
          additionalAction={(!workspaceHasContent && canCreateInvitations) ? <CreateInvitationButton label="+ New Invitation" className="px-4 py-2.5" /> : null}
        />
      )}

      {/* 5. Capability-Composed Sections (Bookings, Services, Orders/Menu, Products, Events, Fundraising, Reviews) */}
      <CapabilityOverviewSections
        organizerId={organizerId}
        capabilities={augmentedCaps as readonly import("@/lib/business-taxonomy").Capability[]}
        fromIso={periodRange.fromIso}
        toIso={periodRange.toIso}
        timezone={siteTimezone}
        canManage={canManage}
      />
    </OverviewShell>
  );
}


