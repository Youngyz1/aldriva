/**
 * lib/dashboard/status-map.ts
 *
 * Status vocabulary and visual tone mappings for all platform domains.
 * Built strictly against live check constraints where verified, and against
 * repository DDL where unverified (see docs/design/dashboard-overview/evidence/status-vocabularies.md).
 *
 * Unknown values NEVER throw: humanised fallback label + neutral tone.
 */

import type { StatusDomain, StatusMeta, Tone } from "./types";

export interface StatusEntry {
  labelKey: string;
  tone: Tone;
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFIED LIVE STATUS GROUPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * orders.status
 * VERIFIED LIVE: pending, accepted, preparing, ready, picked_up, out_for_delivery, delivered, completed, cancelled
 */
export const VERIFIED_ORDER_STATUSES: Record<string, StatusEntry> = {
  pending: { labelKey: "Status.order.pending", tone: "warning" },
  accepted: { labelKey: "Status.order.accepted", tone: "info" },
  preparing: { labelKey: "Status.order.preparing", tone: "info" },
  ready: { labelKey: "Status.order.ready", tone: "success" },
  picked_up: { labelKey: "Status.order.picked_up", tone: "info" },
  out_for_delivery: { labelKey: "Status.order.out_for_delivery", tone: "info" },
  delivered: { labelKey: "Status.order.delivered", tone: "success" },
  completed: { labelKey: "Status.order.completed", tone: "success" },
  cancelled: { labelKey: "Status.order.cancelled", tone: "critical" },
};

/**
 * orders.payment_status
 * VERIFIED LIVE: unpaid, paid, refunded
 */
export const VERIFIED_ORDER_PAYMENT_STATUSES: Record<string, StatusEntry> = {
  unpaid: { labelKey: "Status.order_payment.unpaid", tone: "warning" },
  paid: { labelKey: "Status.order_payment.paid", tone: "success" },
  refunded: { labelKey: "Status.order_payment.refunded", tone: "neutral" },
};

/**
 * orders.fulfilment_type
 * VERIFIED LIVE: pickup, delivery, dine_in
 */
export const VERIFIED_ORDER_FULFILMENT_TYPES: Record<string, StatusEntry> = {
  pickup: { labelKey: "Status.fulfilment_type.pickup", tone: "neutral" },
  delivery: { labelKey: "Status.fulfilment_type.delivery", tone: "neutral" },
  dine_in: { labelKey: "Status.fulfilment_type.dine_in", tone: "neutral" },
};

/**
 * orders.dine_in_confirmation
 * VERIFIED LIVE: not_applicable, pending, confirmed, declined
 */
export const VERIFIED_DINE_IN_CONFIRMATIONS: Record<string, StatusEntry> = {
  not_applicable: { labelKey: "Status.dine_in_confirmation.not_applicable", tone: "neutral" },
  pending: { labelKey: "Status.dine_in_confirmation.pending", tone: "warning" },
  confirmed: { labelKey: "Status.dine_in_confirmation.confirmed", tone: "success" },
  declined: { labelKey: "Status.dine_in_confirmation.declined", tone: "critical" },
};

/**
 * reservations.status
 * VERIFIED LIVE: pending, confirmed, declined, seated, completed, no_show, cancelled
 * (Note: migration 216's pending_hold is NOT applied on staging, so excluded from verified live)
 */
export const VERIFIED_RESERVATION_STATUSES: Record<string, StatusEntry> = {
  pending: { labelKey: "Status.reservation.pending", tone: "warning" },
  confirmed: { labelKey: "Status.reservation.confirmed", tone: "success" },
  declined: { labelKey: "Status.reservation.declined", tone: "critical" },
  seated: { labelKey: "Status.reservation.seated", tone: "info" },
  completed: { labelKey: "Status.reservation.completed", tone: "success" },
  no_show: { labelKey: "Status.reservation.no_show", tone: "critical" },
  cancelled: { labelKey: "Status.reservation.cancelled", tone: "neutral" },
};

/**
 * reservations.payment_status
 * VERIFIED LIVE: unpaid, deposit_pending, deposit_paid, paid, refunded, waived
 */
export const VERIFIED_RESERVATION_PAYMENT_STATUSES: Record<string, StatusEntry> = {
  unpaid: { labelKey: "Status.reservation_payment.unpaid", tone: "warning" },
  deposit_pending: { labelKey: "Status.reservation_payment.deposit_pending", tone: "warning" },
  deposit_paid: { labelKey: "Status.reservation_payment.deposit_paid", tone: "info" },
  paid: { labelKey: "Status.reservation_payment.paid", tone: "success" },
  refunded: { labelKey: "Status.reservation_payment.refunded", tone: "neutral" },
  waived: { labelKey: "Status.reservation_payment.waived", tone: "neutral" },
};

/**
 * reservations.booking_type
 * VERIFIED LIVE: table, rental, appointment
 */
export const VERIFIED_BOOKING_TYPES: Record<string, StatusEntry> = {
  table: { labelKey: "Status.booking_type.table", tone: "neutral" },
  rental: { labelKey: "Status.booking_type.rental", tone: "neutral" },
  appointment: { labelKey: "Status.booking_type.appointment", tone: "neutral" },
};

// ─────────────────────────────────────────────────────────────────────────────
// UNVERIFIED STATUS GROUPS (from repository DDL)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * events.status
 * UNVERIFIED against live DB. Source: db/migration_155_event_kind.sql:54, prod_schema.sql:9005
 * Vocabulary: pending, approved, rejected, draft
 */
export const UNVERIFIED_EVENT_STATUSES: Record<string, StatusEntry> = {
  draft: { labelKey: "Status.event.draft", tone: "neutral" },
  pending: { labelKey: "Status.event.pending", tone: "warning" },
  approved: { labelKey: "Status.event.approved", tone: "success" },
  rejected: { labelKey: "Status.event.rejected", tone: "critical" },
};

/**
 * fundraisers.status
 * UNVERIFIED against live DB. Source: db/migration_41_fundraiser_approval.sql:42, prod_schema.sql:9100
 * Vocabulary in CHECK: pending_review, published, rejected
 * (Application code also derives active, paused, completed from status + progress)
 */
export const UNVERIFIED_FUNDRAISER_STATUSES: Record<string, StatusEntry> = {
  pending_review: { labelKey: "Status.fundraiser.pending_review", tone: "warning" },
  published: { labelKey: "Status.fundraiser.published", tone: "success" },
  rejected: { labelKey: "Status.fundraiser.rejected", tone: "critical" },
  active: { labelKey: "Status.fundraiser.active", tone: "success" },
  paused: { labelKey: "Status.fundraiser.paused", tone: "warning" },
  completed: { labelKey: "Status.fundraiser.completed", tone: "success" },
};

/**
 * donations.status
 * UNVERIFIED against live DB. Source: db/migration_14_fundraiser_fixes.sql:94, prod_schema.sql:8825
 * Vocabulary: pending, succeeded, completed, failed, refunded
 */
export const UNVERIFIED_DONATION_STATUSES: Record<string, StatusEntry> = {
  pending: { labelKey: "Status.donation.pending", tone: "warning" },
  succeeded: { labelKey: "Status.donation.succeeded", tone: "success" },
  completed: { labelKey: "Status.donation.completed", tone: "success" },
  failed: { labelKey: "Status.donation.failed", tone: "critical" },
  refunded: { labelKey: "Status.donation.refunded", tone: "neutral" },
};

/**
 * payouts.status
 * UNVERIFIED against live DB. Source: db/migration_73_payouts_and_balance_rpcs.sql:28, prod_schema.sql:9863
 * Vocabulary: requested, processing, completed, failed, cancelled
 */
export const UNVERIFIED_PAYOUT_STATUSES: Record<string, StatusEntry> = {
  requested: { labelKey: "Status.payout.requested", tone: "warning" },
  processing: { labelKey: "Status.payout.processing", tone: "info" },
  completed: { labelKey: "Status.payout.completed", tone: "success" },
  failed: { labelKey: "Status.payout.failed", tone: "critical" },
  cancelled: { labelKey: "Status.payout.cancelled", tone: "neutral" },
};

/**
 * ticket_orders.status
 * UNVERIFIED against live DB. Source: db/schema.sql:679, prod_schema.sql:10603
 * Vocabulary: pending, valid, used, cancelled, refunded
 */
export const UNVERIFIED_TICKET_ORDER_STATUSES: Record<string, StatusEntry> = {
  pending: { labelKey: "Status.ticket_order.pending", tone: "warning" },
  valid: { labelKey: "Status.ticket_order.valid", tone: "success" },
  used: { labelKey: "Status.ticket_order.used", tone: "neutral" },
  cancelled: { labelKey: "Status.ticket_order.cancelled", tone: "critical" },
  refunded: { labelKey: "Status.ticket_order.refunded", tone: "neutral" },
};

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED DOMAIN STATUS MAP
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_MAP: Record<StatusDomain, Record<string, StatusEntry>> = {
  order: VERIFIED_ORDER_STATUSES,
  order_payment: VERIFIED_ORDER_PAYMENT_STATUSES,
  reservation: VERIFIED_RESERVATION_STATUSES,
  reservation_payment: VERIFIED_RESERVATION_PAYMENT_STATUSES,
  booking: VERIFIED_RESERVATION_STATUSES, // booking is an alias of reservation
  event: UNVERIFIED_EVENT_STATUSES,
  fundraiser: UNVERIFIED_FUNDRAISER_STATUSES,
  donation: UNVERIFIED_DONATION_STATUSES,
  payout: UNVERIFIED_PAYOUT_STATUSES,
};

/**
 * Humanise any snake_case or kebab-case status string into title case.
 */
export function humanizeStatus(value: string): string {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Resolve status entry for a given domain and value.
 * Never throws: if unmapped or unknown, returns a neutral fallback.
 */
export function resolveStatus(domain: StatusDomain, value: string): StatusMeta {
  const domainMap = STATUS_MAP[domain];
  const entry = domainMap ? domainMap[value] : undefined;

  if (entry) {
    return {
      labelKey: entry.labelKey,
      label: humanizeStatus(value),
      tone: entry.tone,
    };
  }

  // Graceful fallback for unknown statuses
  return {
    labelKey: `Status.${domain}.${value}`,
    label: humanizeStatus(value),
    tone: "neutral",
  };
}
