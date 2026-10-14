/**
 * lib/overview-resolver.ts
 *
 * Pure view-model resolver for the shared Overview v2 system.
 * Zero I/O, deterministic, 100% testable in isolation.
 *
 * Drives what widgets appear on every Overview surface across the platform:
 * - Restaurant, rental, salon/service, boutique, events-only, hybrid, and personal.
 * - Suppresses empty or irrelevant widgets (no zeroed stat cards on brand-new businesses).
 * - Enforces role-based action gating (no links landing on Forbidden for viewers/editors).
 */

import type {
  AttentionItem,
  EventMetrics,
  OverviewWidgetDescriptor,
  QuickActionItem,
  ResolveOverviewInput,
  SetupChecklistItem,
  TodayMetrics,
} from "./overview-types";

const MANAGE_ROLES = ["owner", "admin", "manager"];

export function canUserManage(role?: string | null): boolean {
  return role ? MANAGE_ROLES.includes(role) : false;
}

export function resolveOverviewModules(
  input: ResolveOverviewInput
): OverviewWidgetDescriptor[] {
  const { context, capabilities, features, approvalState, counts, role } = input;
  const canManage = canUserManage(role);
  const capSet = new Set(capabilities);
  const widgets: OverviewWidgetDescriptor[] = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // PERSONAL CONTEXT
  // ─────────────────────────────────────────────────────────────────────────────
  if (context === "personal") {
    // 1. Managed Organizers
    if (counts.managedOrganizers && counts.managedOrganizers.length > 0) {
      widgets.push({
        id: "personal_organizers",
        built: true,
        title: "Managed Organizations",
        data: counts.managedOrganizers,
      });
    }

    // 2. Personal Tickets (events user attended / bought tickets for)
    if (counts.personalTickets && counts.personalTickets.length > 0) {
      widgets.push({
        id: "personal_tickets",
        built: true,
        title: "My Tickets",
        data: counts.personalTickets,
      });
    }

    // 3. Personal Orders (storefront guest orders matching user email)
    if (counts.personalOrders && counts.personalOrders.length > 0) {
      widgets.push({
        id: "personal_orders",
        built: true,
        title: "My Orders",
        data: counts.personalOrders,
      });
    }

    // 4. Personal Donations
    if (counts.personalDonations && counts.personalDonations.length > 0) {
      widgets.push({
        id: "personal_donations",
        built: true,
        title: "My Donations",
        data: counts.personalDonations,
      });
    }

    // 5. Personal Empty / New User State (when user has zero items)
    const hasAnyPersonalThings =
      (counts.managedOrganizers?.length ?? 0) > 0 ||
      (counts.personalTickets?.length ?? 0) > 0 ||
      (counts.personalOrders?.length ?? 0) > 0 ||
      (counts.personalDonations?.length ?? 0) > 0 ||
      (counts.personalBusinessesCount ?? 0) > 0 ||
      (counts.personalEventsCount ?? 0) > 0 ||
      (counts.personalFundraisersCount ?? 0) > 0;

    if (!hasAnyPersonalThings) {
      widgets.push({
        id: "empty_state",
        built: true,
        title: "Welcome to Aldriva",
        data: {
          prompt: "Create your first Business, Event, Fundraiser, or Organization to get started.",
          createLinks: [
            { label: "Create Business", href: "/create-business" },
            { label: "Create Organization", href: "/create-organizer" },
            { label: "Create Event", href: "/dashboard/events/new" },
            { label: "Create Fundraiser", href: "/create-fundraiser" },
          ],
        },
      });
    }

    return widgets;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ORGANIZER CONTEXT
  // ─────────────────────────────────────────────────────────────────────────────

  const isCommerceOrg =
    capSet.has("can_have_menu") ||
    capSet.has("can_have_products") ||
    capSet.has("can_have_services") ||
    capSet.has("can_have_vehicles") ||
    Boolean(features?.ordering) ||
    (counts.pendingOrders ?? 0) > 0 ||
    (counts.ordersToday ?? 0) > 0 ||
    (counts.pendingReservations ?? 0) > 0 ||
    (counts.reservationsToday ?? 0) > 0 ||
    (counts.recentOrders && counts.recentOrders.length > 0);

  const hasEventsOrFundraisers =
    (counts.eventCount ?? 0) > 0 ||
    (counts.fundraiserCount ?? 0) > 0 ||
    (counts.ticketCount ?? 0) > 0 ||
    (counts.totalRaised ?? 0) > 0;

  // ── 1. ATTENTION STRIP ───────────────────────────────────────────────────────
  const attentionItems: AttentionItem[] = [];

  // 1a. Pending orders
  if ((counts.pendingOrders ?? 0) > 0) {
    attentionItems.push({
      id: "pending_orders",
      kind: "pending_orders",
      title: `${counts.pendingOrders} pending order${(counts.pendingOrders ?? 0) > 1 ? "s" : ""} awaiting acceptance`,
      count: counts.pendingOrders,
      href: "/dashboard/org/ORDERS_PATH?tab=needs_attention",
      actionLabel: canManage ? "Review orders" : "View orders",
      priority: "high",
      requiresManageRole: false,
    });
  }

  // 1b. Overdue orders
  if ((counts.overdueOrders ?? 0) > 0) {
    attentionItems.push({
      id: "overdue_orders",
      kind: "overdue_orders",
      title: `${counts.overdueOrders} order${(counts.overdueOrders ?? 0) > 1 ? "s" : ""} overdue`,
      count: counts.overdueOrders,
      href: "/dashboard/org/ORDERS_PATH?tab=needs_attention",
      actionLabel: "View overdue",
      priority: "high",
      requiresManageRole: false,
    });
  }

  // 1b2. Pending table requests (only when the Reservations module is visible)
  if ((counts.pendingReservations ?? 0) > 0 && counts.hasReservationsModule) {
    const n = counts.pendingReservations ?? 0;
    attentionItems.push({
      id: "pending_reservations",
      kind: "pending_reservations",
      title: `${n} table request${n > 1 ? "s" : ""} awaiting response`,
      count: n,
      href: "/dashboard/org/RESERVATIONS_PATH?tab=needs_action",
      actionLabel: "Review requests",
      priority: "high",
      requiresManageRole: false,
    });
  }

  // 1c. Approval state
  if (approvalState === "pending") {
    attentionItems.push({
      id: "approval_pending",
      kind: "approval_pending",
      title: "Business approval in review",
      description: "Awaiting approval, you can build now; publishing and orders unlock after approval.",
      priority: "info",
    });
  } else if (approvalState === "rejected") {
    attentionItems.push({
      id: "approval_rejected",
      kind: "approval_rejected",
      title: "Business application rejected",
      description: "Your business listing was not approved. Public orders and publishing remain disabled.",
      priority: "high",
    });
  } else if (approvalState === "archived") {
    attentionItems.push({
      id: "approval_archived",
      kind: "approval_archived",
      title: "Business is archived",
      description: "This business is archived and no longer accepting orders.",
      priority: "medium",
    });
  }

  // 1d. Unpublished draft changes
  if (counts.hasUnpublishedChanges && counts.isSitePublished) {
    attentionItems.push({
      id: "unpublished_changes",
      kind: "unpublished_changes",
      title: "Unpublished website changes",
      description: "You have draft changes that have not yet been published to the live site.",
      href: "/dashboard/org/BUILDER_PATH",
      actionLabel: canManage ? "Publish changes" : "View editor",
      priority: "medium",
      requiresManageRole: false,
    });
  }

  // 1e. Pending reservations ship above (Phase 7); the strip renders only
  // when counts.hasReservationsModule confirms module visibility.

  if (attentionItems.length > 0) {
    widgets.push({
      id: "attention_strip",
      built: true,
      title: "Needs Attention",
      data: attentionItems,
    });
  }

  // ── 2. SETUP CHECKLIST ──────────────────────────────────────────────────────
  // Appears for businesses where setup is not yet complete.
  const totalCatalogItems = (counts.menuItemCount ?? 0) + (counts.serviceCount ?? 0);
  const checklistItems: SetupChecklistItem[] = [
    {
      id: "logo",
      label: "Upload business logo",
      completed: Boolean(counts.hasLogo),
      href: "/dashboard/org/SETTINGS_PATH",
    },
    {
      id: "hours",
      label: "Set opening hours",
      completed: Boolean(counts.hasHours),
      href: "/dashboard/org/SETTINGS_PATH",
    },
    {
      id: "catalog",
      label: "Add at least 3 items to catalog",
      completed: totalCatalogItems >= 3,
      href: capSet.has("can_have_menu") ? "/dashboard/org/MENU_PATH" : "/dashboard/org/SERVICES_PATH",
    },
    {
      id: "offerings",
      label: "Choose business offerings",
      completed: Boolean(counts.hasOfferings),
      href: "/dashboard/org/SETTINGS_PATH",
    },
    {
      id: "publish",
      label: "Publish website",
      completed: Boolean(counts.isSitePublished),
      href: "/dashboard/org/BUILDER_PATH",
    },
    {
      id: "ordering_payments",
      label: "Configure ordering & payments",
      completed: Boolean(counts.isOrderingReady),
      href: "/dashboard/org/BUILDER_PATH",
    },
  ];

  const isSetupComplete = checklistItems.every((item) => item.completed);
  widgets.push({
    id: "setup_checklist",
    built: true,
    title: "Setup Checklist",
    data: {
      isComplete: isSetupComplete,
      items: checklistItems,
      completedCount: checklistItems.filter((i) => i.completed).length,
      totalCount: checklistItems.length,
    },
  });

  // ── 3. TODAY STRIP (Commerce / Storefront) ──────────────────────────────────
  // Displayed if the business has commerce capabilities or active orders today.
  if (isCommerceOrg) {
    const todayMetrics: TodayMetrics = {
      ordersCount: counts.ordersToday ?? 0,
      salesTotal: counts.salesToday ?? 0,
      currency: counts.currency || "USD",
      paidTotal: counts.paidToday ?? 0,
      toCollectTotal: counts.toCollectToday ?? 0,
      ...(counts.reservationsToday !== undefined ? { reservationsToday: counts.reservationsToday } : {}),
      isOpen: counts.isOpen ?? true,
      hoursBadgeText: counts.hoursBadgeText || "Hours TBA",
      timeZone: counts.siteTimezone || "Africa/Abidjan",
    };

    widgets.push({
      id: "today_strip",
      built: true,
      title: "Today",
      data: todayMetrics,
    });
  }

  // ── 4. QUICK ACTIONS ────────────────────────────────────────────────────────
  const quickActions: QuickActionItem[] = [];

  if (capSet.has("can_have_menu")) {
    if (canManage) {
      quickActions.push({
        id: "add_dish",
        label: "Add dish",
        href: "/dashboard/org/MENU_PATH",
        icon: "Utensils",
        variant: "primary",
        requiresManageRole: true,
      });
    }
    quickActions.push({
      id: "edit_website",
      label: "Edit website",
      href: "/dashboard/org/BUILDER_PATH",
      icon: "Globe",
      variant: "secondary",
    });
  } else if (capSet.has("can_have_services")) {
    if (canManage) {
      quickActions.push({
        id: "add_service",
        label: "Add service",
        href: "/dashboard/org/SERVICES_PATH",
        icon: "Briefcase",
        variant: "primary",
        requiresManageRole: true,
      });
    }
    quickActions.push({
      id: "edit_website",
      label: "Edit website",
      href: "/dashboard/org/BUILDER_PATH",
      icon: "Globe",
      variant: "secondary",
    });
  } else if (capSet.has("can_have_vehicles")) {
    // Rental: no Add Vehicle until fleet exists; Edit website & View live site only
    quickActions.push({
      id: "edit_website",
      label: "Edit website",
      href: "/dashboard/org/BUILDER_PATH",
      icon: "Globe",
      variant: "primary",
    });
  } else {
    // Default website builder action for other business types
    quickActions.push({
      id: "edit_website",
      label: "Edit website",
      href: "/dashboard/org/BUILDER_PATH",
      icon: "Globe",
      variant: "secondary",
    });
  }

  // "View live site" only when a published site exists
  if (counts.isSitePublished && counts.websiteSlug) {
    quickActions.push({
      id: "view_site",
      label: "View live site",
      href: `/site/${counts.websiteSlug}`,
      icon: "ExternalLink",
      variant: "outline",
      external: true,
    });
    quickActions.push({
      id: "copy_link",
      label: "Copy site link",
      href: `/site/${counts.websiteSlug}`,
      icon: "Copy",
      variant: "outline",
    });
  }

  // Events / Fundraisers quick actions (only if org can create them or already has them)
  if (capSet.has("can_have_events") || hasEventsOrFundraisers) {
    if (canManage) {
      quickActions.push({
        id: "new_event",
        label: "+ New Event",
        href: "/dashboard/events/new",
        icon: "Calendar",
        variant: "secondary",
        requiresManageRole: true,
      });
    }
  }

  if (capSet.has("can_have_fundraisers") || hasEventsOrFundraisers) {
    if (canManage) {
      quickActions.push({
        id: "new_fundraiser",
        label: "+ New Fundraiser",
        href: "/create-fundraiser",
        icon: "Heart",
        variant: "secondary",
        requiresManageRole: true,
      });
    }
  }

  if (quickActions.length > 0) {
    widgets.push({
      id: "quick_actions",
      built: true,
      title: "Quick Actions",
      data: quickActions,
    });
  }

  // ── 5. RECENT ORDERS (Latest 5) ─────────────────────────────────────────────
  if (isCommerceOrg && counts.recentOrders && counts.recentOrders.length > 0) {
    widgets.push({
      id: "recent_orders",
      built: true,
      title: "Recent Orders",
      data: counts.recentOrders.slice(0, 5),
    });
  }

  // ── 6. EVENTS & FUNDRAISERS METRICS ─────────────────────────────────────────
  // Shown ONLY if the org has any events or fundraisers. Suppressed for pure restaurants/shops with 0 events.
  if (hasEventsOrFundraisers) {
    const eventMetrics: EventMetrics = {
      totalEvents: counts.eventCount ?? 0,
      fundraisersCount: counts.fundraiserCount ?? 0,
      followersCount: counts.followerCount ?? 0,
      totalRaised: counts.totalRaised ?? 0,
      ticketsSold: counts.ticketCount ?? 0,
      averageRating: counts.averageRating,
      reviewCount: counts.reviewCount,
    };

    widgets.push({
      id: "events_metrics",
      built: true,
      title: "Events & Community",
      data: eventMetrics,
    });

    if (counts.recentEvents && counts.recentEvents.length > 0) {
      widgets.push({
        id: "recent_events",
        built: true,
        title: "Recent Events",
        data: counts.recentEvents.slice(0, 5),
      });
    }
  }

  // ── 7. EMPTY / BRAND-NEW BUSINESS STATE ──────────────────────────────────────
  // If the organization has 0 orders, 0 events, 0 fundraisers, and no published site,
  // we ensure the user sees the setup checklist and quick actions rather than zero stat cards.
  const isBrandNewBusiness =
    !hasEventsOrFundraisers &&
    (counts.ordersToday ?? 0) === 0 &&
    (counts.pendingReservations ?? 0) === 0 &&
    (!counts.recentOrders || counts.recentOrders.length === 0);

  if (isBrandNewBusiness && !widgets.some((w) => w.id === "today_strip")) {
    widgets.push({
      id: "empty_state",
      built: true,
      title: "Get Ready to Take Orders",
      data: {
        headline: "Your business workspace is ready",
        description: "Complete your setup checklist above and publish your website to start receiving orders and bookings.",
      },
    });
  }

  return widgets;
}
