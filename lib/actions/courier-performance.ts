import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const PERFORMANCE_ROLES = ["owner", "admin", "manager"] as const satisfies readonly EntityRole[];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CourierPerformanceRange = "today" | "7-days" | "30-days";

export interface CourierPerformanceRequest {
  organizerId: string;
  businessId: string;
  range: CourierPerformanceRange;
}

/** Exact public projection of get_business_courier_performance; no customer fields. */
export interface CourierPerformanceRow {
  courier_worker_id: string;
  courier_name: string;
  courier_is_active: boolean;
  deliveries_completed: number;
  ready_to_delivered_n: number;
  ready_to_delivered_median_minutes: number | null;
  picked_up_to_delivered_n: number;
  picked_up_to_delivered_median_minutes: number | null;
  average_delivery_rating: number | null;
  rating_count: number;
}

export type CourierPerformanceResult =
  | { ok: true; rows: CourierPerformanceRow[] }
  | { ok: false; error: "unauthorized" | "forbidden" | "invalid_request" | "invalid_range" | "unavailable" };

export interface CourierPerformanceWindow {
  rangeStart: string;
  rangeEnd: string;
}

/**
 * Build explicit UTC timestamps on the server. "today" is the UTC calendar
 * day beginning at 00:00 UTC; 7-days and 30-days are rolling UTC durations
 * ending at the current instant.
 */
export function getCourierPerformanceWindow(range: unknown, now: Date = new Date()): CourierPerformanceWindow | null {
  if (range !== "today" && range !== "7-days" && range !== "30-days") return null;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;

  const end = new Date(now.getTime());
  const start = range === "today"
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    : new Date(now.getTime() - (range === "7-days" ? 7 : 30) * DAY_MS);

  return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isMedian(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRating(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5);
}

/**
 * Project and normalize RPC output to its declared fields. A median is nulled
 * below n=3 while its sample count remains available to the UI.
 */
export function shapeCourierPerformanceRows(value: unknown): CourierPerformanceRow[] | null {
  if (!Array.isArray(value)) return null;

  const shaped: CourierPerformanceRow[] = [];
  for (const rawRow of value) {
    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) return null;
    const row = rawRow as Record<string, unknown>;
    if (
      typeof row.courier_worker_id !== "string" || !UUID_PATTERN.test(row.courier_worker_id) ||
      typeof row.courier_name !== "string" ||
      typeof row.courier_is_active !== "boolean" ||
      !isNonNegativeInteger(row.deliveries_completed) ||
      !isNonNegativeInteger(row.ready_to_delivered_n) ||
      !isMedian(row.ready_to_delivered_median_minutes) ||
      !isNonNegativeInteger(row.picked_up_to_delivered_n) ||
      !isMedian(row.picked_up_to_delivered_median_minutes) ||
      !isRating(row.average_delivery_rating) ||
      !isNonNegativeInteger(row.rating_count)
    ) {
      return null;
    }

    shaped.push({
      courier_worker_id: row.courier_worker_id,
      courier_name: row.courier_name,
      courier_is_active: row.courier_is_active,
      deliveries_completed: row.deliveries_completed,
      ready_to_delivered_n: row.ready_to_delivered_n,
      ready_to_delivered_median_minutes: row.ready_to_delivered_n < 3
        ? null
        : row.ready_to_delivered_median_minutes,
      picked_up_to_delivered_n: row.picked_up_to_delivered_n,
      picked_up_to_delivered_median_minutes: row.picked_up_to_delivered_n < 3
        ? null
        : row.picked_up_to_delivered_median_minutes,
      average_delivery_rating: row.average_delivery_rating,
      rating_count: row.rating_count,
    });
  }

  return shaped;
}

function parseRequest(value: unknown): Omit<CourierPerformanceRequest, "range"> & { range: unknown } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const request = value as Record<string, unknown>;
  if (
    typeof request.organizerId !== "string" || !UUID_PATTERN.test(request.organizerId) ||
    typeof request.businessId !== "string" || !UUID_PATTERN.test(request.businessId)
  ) {
    return null;
  }
  return {
    organizerId: request.organizerId,
    businessId: request.businessId,
    range: request.range,
  };
}

/**
 * Server-only owner Kitchen data loader. Each Kitchen card passes its own
 * business ID; this loader never picks a business.
 */
export async function loadCourierPerformance(input: unknown): Promise<CourierPerformanceResult> {
  const request = parseRequest(input);
  if (!request) return { ok: false, error: "invalid_request" };

  try {
    const user = await getCurrentUser();
    if (!user?.id) return { ok: false, error: "unauthorized" };

    const access = await checkTenantAccess(user.id, request.organizerId, [...PERFORMANCE_ROLES]);
    if (
      !access.hasAccess ||
      !access.role ||
      !PERFORMANCE_ROLES.includes(access.role as (typeof PERFORMANCE_ROLES)[number])
    ) {
      return { ok: false, error: "forbidden" };
    }

    const window = getCourierPerformanceWindow(request.range);
    if (!window) return { ok: false, error: "invalid_range" };

    const admin = createSupabaseAdmin();
    const { data: business, error: businessError } = await admin
      .from("businesses")
      .select("id, organizer_id")
      .eq("id", request.businessId)
      .maybeSingle();

    if (businessError) return { ok: false, error: "unavailable" };
    if (
      !business ||
      business.id !== request.businessId ||
      business.organizer_id !== request.organizerId
    ) {
      return { ok: false, error: "forbidden" };
    }

    // Use organizer_id read from the service-role business row, after matching
    // it to the requested organizer. Never forward an unchecked browser value.
    const verifiedOrganizerId = business.organizer_id as string;
    const { data, error } = await admin.rpc("get_business_courier_performance", {
      p_business_id: business.id,
      p_organizer_id: verifiedOrganizerId,
      p_range_start: window.rangeStart,
      p_range_end: window.rangeEnd,
    });

    if (error) return { ok: false, error: "unavailable" };
    const rows = shapeCourierPerformanceRows(data);
    if (!rows) return { ok: false, error: "unavailable" };

    return { ok: true, rows };
  } catch {
    // Keep service-role/configuration/RPC details out of the client response.
    return { ok: false, error: "unavailable" };
  }
}
