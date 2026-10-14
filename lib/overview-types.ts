/**
 * lib/overview-types.ts
 *
 * Types for the shared Overview v2 system.
 * Category-agnostic, capability-driven descriptors for dashboard overview surfaces.
 */

import type { EntityRole } from "@/lib/entity-auth";
import type { ApprovalState } from "@/lib/business-approval";

export type OverviewContext = "organizer" | "personal";

export type OverviewWidgetId =
  | "attention_strip"
  | "today_strip"
  | "setup_checklist"
  | "quick_actions"
  | "recent_orders"
  | "recent_events"
  | "events_metrics"
  | "personal_organizers"
  | "personal_tickets"
  | "personal_donations"
  | "personal_orders"
  | "empty_state";

export interface AttentionItem {
  id: string;
  kind: "pending_orders" | "overdue_orders" | "pending_reservations" | "approval_pending" | "approval_rejected" | "approval_archived" | "unpublished_changes" | "setup_incomplete";
  title: string;
  description?: string;
  count?: number;
  href?: string;
  actionLabel?: string;
  priority: "high" | "medium" | "info";
  requiresManageRole?: boolean;
}

export interface SetupChecklistItem {
  id: "logo" | "hours" | "catalog" | "offerings" | "publish" | "ordering_payments";
  label: string;
  completed: boolean;
  href: string;
}

export interface QuickActionItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  variant: "primary" | "secondary" | "outline";
  external?: boolean;
  requiresManageRole?: boolean;
}

export interface RecentOrderSummary {
  id: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  currency: string;
  status: string;
  createdAt: string;
  fulfilmentType: string;
}

export interface RecentEventSummary {
  id: string;
  title: string;
  eventDate?: string | null;
  city?: string | null;
  slug?: string | null;
}

export interface TodayMetrics {
  ordersCount: number;
  salesTotal: number;
  currency: string;
  paidTotal: number;
  toCollectTotal: number;
  /** Upcoming tables today; undefined when the reservations module is hidden. */
  reservationsToday?: number;
  isOpen: boolean;
  hoursBadgeText: string; // e.g. "Open · Closes at 22:00" or "Closed · Opens at 11:00"
  timeZone: string;
}

export interface EventMetrics {
  totalEvents: number;
  fundraisersCount: number;
  followersCount: number;
  totalRaised: number;
  ticketsSold: number;
  averageRating?: number | null;
  reviewCount?: number;
}

export interface ManagedOrganizerSummary {
  id: string;
  name: string;
  slug?: string | null;
  pendingOrdersCount?: number;
}

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  businessName: string;
  siteSlug: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  trackingToken: string;
}

export interface PersonalTicketSummary {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  createdAt: string;
  href: string;
}

export interface PersonalDonationSummary {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  createdAt: string;
  href: string;
}

export interface OverviewCounts {
  pendingOrders?: number;
  overdueOrders?: number;
  pendingReservations?: number;
  reservationsToday?: number;
  /** True when the Reservations module is visible (capability + offering, or rows exist). */
  hasReservationsModule?: boolean;
  ordersToday?: number;
  salesToday?: number;
  paidToday?: number;
  toCollectToday?: number;
  currency?: string;
  siteTimezone?: string;
  isOpen?: boolean;
  hoursBadgeText?: string;
  hasUnpublishedChanges?: boolean;
  isSitePublished?: boolean;
  websiteSlug?: string | null;
  websiteId?: string | null;
  businessId?: string | null;
  menuItemCount?: number;
  serviceCount?: number;
  hasLogo?: boolean;
  hasHours?: boolean;
  hasOfferings?: boolean;
  isOrderingReady?: boolean;
  eventCount?: number;
  fundraiserCount?: number;
  followerCount?: number;
  ticketCount?: number;
  totalRaised?: number;
  averageRating?: number | null;
  reviewCount?: number;
  recentOrders?: RecentOrderSummary[];
  recentEvents?: RecentEventSummary[];
  managedOrganizers?: ManagedOrganizerSummary[];
  personalOrders?: CustomerOrderSummary[];
  personalTickets?: PersonalTicketSummary[];
  personalDonations?: PersonalDonationSummary[];
  personalBusinessesCount?: number;
  personalEventsCount?: number;
  personalFundraisersCount?: number;
}

export interface OverviewWidgetDescriptor {
  id: OverviewWidgetId;
  built: boolean;
  title?: string;
  data: unknown;
}

export interface ResolveOverviewInput {
  context: OverviewContext;
  capabilities: readonly string[];
  offerings?: readonly string[] | null;
  features?: Record<string, boolean>;
  approvalState?: ApprovalState;
  counts: OverviewCounts;
  role?: EntityRole | null;
}
