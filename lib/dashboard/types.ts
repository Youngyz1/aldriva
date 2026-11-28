/**
 * lib/dashboard/types.ts
 *
 * Core shared types for the dashboard redesign.
 * Based on docs/design/dashboard-overview/02-module-contract.md §1, §2, §5.
 */

import type { Capability } from "../business-taxonomy";

export type DashboardSurface = "nav" | "shell" | "overview";

export type Tone = "neutral" | "info" | "success" | "warning" | "critical";

export type StatusDomain =
  | "order"
  | "order_payment"
  | "reservation"
  | "reservation_payment"
  | "booking"
  | "event"
  | "fundraiser"
  | "donation"
  | "payout";

export interface StatusMeta {
  labelKey: string;
  label: string;
  tone: Tone;
}

export type ModuleId = string;

export interface ModuleContext {
  organizerId: string;
  businessId?: string | null;
  role?: string | null;
  capabilities: Capability[];
  offerings?: readonly string[] | null;
  from?: string | null;
  to?: string | null;
  timezone?: string | null;
  locale?: string | null;
  currency?: string | null;
  surface: DashboardSurface;
}

export type ModuleResult<T = unknown> =
  | { status: "ok"; data: T }
  | { status: "empty"; reason: "no_rows" | "not_configured" }
  | { status: "unavailable"; reason: "missing_schema" | "not_approved" }
  | { status: "error"; retryable: true };

export interface Metric {
  key: string;
  value: number;
  format: "count" | "money" | "percent" | "duration";
  currency?: string;
}

export interface Delta {
  value: number;
  direction: "up" | "down" | "flat";
  periodLabel?: string;
}

export interface SeriesPoint {
  date: string;
  value: number;
  label?: string;
}
