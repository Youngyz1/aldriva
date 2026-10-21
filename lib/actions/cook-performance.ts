import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const PERFORMANCE_ROLES = ["owner", "admin", "manager"] as const satisfies readonly EntityRole[];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CookPerformanceRange = "today" | "7-days" | "30-days";

export interface CookPerformanceRequest {
  organizerId: string;
  businessId: string;
  range: CookPerformanceRange;
}

/** Exact public projection of get_business_cook_performance; no order/customer fields. */
export interface CookPerformanceRow {
  cook_worker_id: string;
  cook_name: string;
  cook_is_active: boolean;
  orders_handled: number;
  accepted_to_preparing_n: number;
  accepted_to_preparing_median_minutes: number | null;
  preparing_to_ready_n: number;
  preparing_to_ready_median_minutes: number | null;
}

export type CookPerformanceResult =
  | { ok: true; rows: CookPerformanceRow[] }
  | { ok: false; error: "unauthorized" | "forbidden" | "invalid_request" | "invalid_range" | "unavailable" };

export interface CookPerformanceWindow {
  rangeStart: string;
  rangeEnd: string;
}

/**
 * Build explicit UTC timestamps on the server. "today" is the UTC calendar
 * day beginning at 00:00 UTC; 7-days and 30-days are rolling UTC durations
 * ending at the current instant.
 */
export function getCookPerformanceWindow(range: unknown, now: Date = new Date()): CookPerformanceWindow | null {
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

/**
 * Project and normalize RPC output to its declared fields. A median is nulled
 * below n=3 while its sample count remains available to the UI.
 */
export function shapeCookPerformanceRows(value: unknown): CookPerformanceRow[] | null {
  if (!Array.isArray(value)) return null;

  const shaped: CookPerformanceRow[] = [];
  for (const rawRow of value) {
    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) return null;
    const row = rawRow as Record<string, unknown>;
    if (
      typeof row.cook_worker_id !== "string" || !UUID_PATTERN.test(row.cook_worker_id) ||
      typeof row.cook_name !== "string" ||
      typeof row.cook_is_active !== "boolean" ||
      !isNonNegativeInteger(row.orders_handled) ||
      !isNonNegativeInteger(row.accepted_to_preparing_n) ||
      !isMedian(row.accepted_to_preparing_median_minutes) ||
      !isNonNegativeInteger(row.preparing_to_ready_n) ||
      !isMedian(row.preparing_to_ready_median_minutes)
    ) {
      return null;
    }

    shaped.push({
      cook_worker_id: row.cook_worker_id,
      cook_name: row.cook_name,
      cook_is_active: row.cook_is_active,
      orders_handled: row.orders_handled,
      accepted_to_preparing_n: row.accepted_to_preparing_n,
      accepted_to_preparing_median_minutes: row.accepted_to_preparing_n < 3
        ? null
        : row.accepted_to_preparing_median_minutes,
      preparing_to_ready_n: row.preparing_to_ready_n,
      preparing_to_ready_median_minutes: row.preparing_to_ready_n < 3
        ? null
        : row.preparing_to_ready_median_minutes,
    });
  }

  return shaped;
}

function parseRequest(value: unknown): Omit<CookPerformanceRequest, "range"> & { range: unknown } | null {
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
export async function loadCookPerformance(input: unknown): Promise<CookPerformanceResult> {
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

    const window = getCookPerformanceWindow(request.range);
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
    const { data, error } = await admin.rpc("get_business_cook_performance", {
      p_business_id: business.id,
      p_organizer_id: verifiedOrganizerId,
      p_range_start: window.rangeStart,
      p_range_end: window.rangeEnd,
    });

    if (error) return { ok: false, error: "unavailable" };
    const rows = shapeCookPerformanceRows(data);
    if (!rows) return { ok: false, error: "unavailable" };

    return { ok: true, rows };
  } catch {
    // Keep service-role/configuration/RPC details out of the client response.
    return { ok: false, error: "unavailable" };
  }
}
