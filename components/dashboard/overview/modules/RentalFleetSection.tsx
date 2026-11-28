/**
 * components/dashboard/overview/modules/RentalFleetSection.tsx
 *
 * Rental fleet operational overview section.
 * Mounted in CapabilityOverviewSections when VEHICLES or VEHICLE_RENTAL capability present.
 * Shows KPI strip, revenue (period-aware), today's dispatch queue, and overdue alerts.
 * docs/design/rental/architecture.md Decision 10.
 */

import { vehicleLabel } from "@/lib/vehicle-label";
import React from "react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { formatMoney } from "@/lib/money";
import {
  getStartOfTodayInTimezone,
  getEndOfTodayInTimezone,
  resolveSiteTimezone,
  DEFAULT_SITE_TIMEZONE,
} from "@/lib/date-timezone";
import { resolvePeriodRange, formatPeriodRangeLabel } from "@/lib/dashboard/date-range";
import { StatCard } from "../StatCard";
import { EmptyState } from "../EmptyState";
import {
  IconCar as Car,
  IconCalendarClock as CalendarClock,
  IconAlertTriangle as AlertTriangle,
  IconArrowRight as ArrowRight,
  IconPlus as Plus,
  IconCurrencyDollar as CurrencyDollar,
} from "@tabler/icons-react";

export interface RentalFleetSectionProps {
  organizerId: string;
  businessId?: string | null;
  /** Selected overview period (resolvePeriodRange's fromIso/toIso), passed down
      from CapabilityOverviewSections so revenue follows the period picker. */
  fromIso: string;
  toIso: string;
  timezone?: string;
  canManage?: boolean;
}

interface BookingQueueRow {
  id: string;
  booking_number: string;
  customer_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  is_overdue: boolean;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_plate?: string | null;
}

interface PaymentRow {
  booking_id: string;
  amount: number | string | null;
  kind: string;
  method: string;
  direction: string;
  created_at: string;
}

/** Net revenue in rows within [from, to]: rental_charge/advance/balance credits
    minus refund debits — never security deposits (those never appear in
    rental_payments; they live only on rental_bookings.deposit_*). */
function sumRevenue(rows: PaymentRow[], from: Date, to: Date): number {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  let total = 0;
  for (const row of rows) {
    const createdMs = new Date(row.created_at).getTime();
    if (createdMs < fromMs || createdMs > toMs) continue;
    const amount = Number(row.amount) || 0;
    if (row.direction === "credit" && (row.kind === "rental_charge" || row.kind === "advance" || row.kind === "balance")) {
      total += amount;
    } else if (row.direction === "debit" && row.kind === "refund") {
      total -= amount;
    }
  }
  return total;
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card_offline: "Card terminal",
  mobile_money: "Mobile money",
  stripe: "Card online",
};

function methodLabel(method: string): string {
  return METHOD_LABEL[method] ?? "Other";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function deltaFromChange(
  current: number,
  previous: number
): { value: number; direction: "up" | "down" | "flat"; isNew: boolean } | null {
  if (previous === 0) {
    if (current === 0) return null;
    // No revenue in the previous period at all — "100% up" would be
    // technically correct but misleading; there was nothing to grow from.
    return { value: 100, direction: "up", isNew: true };
  }
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return { value: 0, direction: "flat", isNew: false };
  return { value: Math.abs(pct), direction: pct > 0 ? "up" : "down", isNew: false };
}

export async function RentalFleetSection({
  organizerId,
  businessId,
  fromIso,
  toIso,
  timezone,
  canManage = true,
}: RentalFleetSectionProps) {
  const supabase = createSupabaseAdmin();
  const tz = resolveSiteTimezone(timezone, DEFAULT_SITE_TIMEZONE);
  const now = new Date();

  // Selected period (from the picker) + its equal-length previous window,
  // for the "% change vs previous equal period" delta.
  const selectedFrom = new Date(fromIso);
  const selectedTo = new Date(toIso);
  const periodMs = Math.max(0, selectedTo.getTime() - selectedFrom.getTime());
  const prevTo = new Date(selectedFrom.getTime());
  const prevFrom = new Date(selectedFrom.getTime() - periodMs);

  // Always-visible compact strip: fixed windows, independent of the picker.
  const startOfToday = getStartOfTodayInTimezone(tz, now);
  const endOfToday = getEndOfTodayInTimezone(tz, now);
  const yesterdayAnchor = new Date(now.getTime() - 86_400_000);
  const startOfYesterday = getStartOfTodayInTimezone(tz, yesterdayAnchor);
  const endOfYesterday = getEndOfTodayInTimezone(tz, yesterdayAnchor);
  const last7d = resolvePeriodRange("7d", tz, undefined, undefined, now);
  const thisMonth = resolvePeriodRange("month", tz, undefined, undefined, now);

  const periodRangeLabel = formatPeriodRangeLabel(selectedFrom, selectedTo, tz);

  // Fleet KPIs
  let fleetSize = 0;
  let availableNow = 0;
  let outOnRental = 0;
  let maintenanceCount = 0;

  // Booking KPIs
  let pendingCount = 0;
  let pickupsTodayCount = 0;
  let returnsTodayCount = 0;
  let todayPickups: BookingQueueRow[] = [];
  let todayReturns: BookingQueueRow[] = [];
  let overdueCount = 0;

  // Revenue / financial KPIs
  let revenueThisPeriod = 0;
  let revenuePreviousPeriod = 0;
  let revenueToday = 0;
  let revenueYesterday = 0;
  let revenue7d = 0;
  let revenueThisMonth = 0;
  let methodBreakdown: Array<{ method: string; amount: number }> = [];
  let bookingsCreatedInPeriod = 0;
  let pickupsInPeriod = 0;
  let returnsInPeriod = 0;
  let outstandingBalance = 0;

  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const vehicleQuery = supabase
      .from("vehicles")
      .select("id, status")
      .eq("organizer_id", organizerId)
      .eq("is_active", true);

    if (businessId) vehicleQuery.eq("business_id", businessId);

    const bookingQuery = supabase
      .from("rental_bookings")
      .select(`
        id, booking_number, customer_name, starts_at, ends_at, status, is_overdue, rental_amount,
        vehicles ( make, model, license_plate )
      `)
      .eq("organizer_id", organizerId)
      .in("status", ["pending", "awaiting_payment", "confirmed", "active"]);

    if (businessId) bookingQuery.eq("business_id", businessId);

    // One payments fetch spans every window the section needs (selected
    // period, its previous equal period, and the always-visible today/
    // yesterday/7d/month strip) — sliced in JS below instead of five
    // separate queries.
    const revenueWindowStart = new Date(
      Math.min(prevFrom.getTime(), selectedFrom.getTime(), startOfYesterday.getTime(), last7d.from.getTime(), thisMonth.from.getTime())
    ).toISOString();
    const revenueWindowEnd = new Date(
      Math.max(selectedTo.getTime(), endOfToday.getTime())
    ).toISOString();

    const periodPaymentsQuery = supabase
      .from("rental_payments")
      .select("booking_id, amount, kind, method, direction, created_at")
      .eq("organizer_id", organizerId)
      .eq("applied", true)
      .gte("created_at", revenueWindowStart)
      .lte("created_at", revenueWindowEnd);

    const bookingsCreatedQuery = supabase
      .from("rental_bookings")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", organizerId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso);

    const pickupsInPeriodQuery = supabase
      .from("rental_bookings")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", organizerId)
      .gte("starts_at", fromIso)
      .lte("starts_at", toIso);

    const returnsInPeriodQuery = supabase
      .from("rental_bookings")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", organizerId)
      .gte("ends_at", fromIso)
      .lte("ends_at", toIso);

    const [
      vehicleRes,
      bookingRes,
      periodPaymentsRes,
      bookingsCreatedRes,
      pickupsInPeriodRes,
      returnsInPeriodRes,
    ] = await Promise.all([
      vehicleQuery,
      bookingQuery,
      periodPaymentsQuery,
      bookingsCreatedQuery,
      pickupsInPeriodQuery,
      returnsInPeriodQuery,
    ]);

    if (!vehicleRes.error && vehicleRes.data) {
      fleetSize = vehicleRes.data.length;
      availableNow = vehicleRes.data.filter((v) => v.status === "available").length;
      outOnRental = vehicleRes.data.filter((v) => v.status === "rented").length;
      maintenanceCount = vehicleRes.data.filter((v) => v.status === "maintenance").length;
    }

    let activeBookings: Array<{ id: string; rental_amount: number }> = [];
    if (!bookingRes.error && bookingRes.data) {
      const bookings = bookingRes.data;
      pendingCount = bookings.filter((b) => b.status === "pending").length;
      overdueCount = bookings.filter((b) => b.is_overdue && b.status === "active").length;
      activeBookings = bookings.map((b) => ({ id: b.id, rental_amount: Number(b.rental_amount) || 0 }));

      const mapRow = (b: typeof bookings[0]): BookingQueueRow => {
        const v = Array.isArray(b.vehicles) ? b.vehicles[0] : b.vehicles as Record<string, string> | null;
        return {
          id: b.id,
          booking_number: b.booking_number,
          customer_name: b.customer_name,
          starts_at: b.starts_at,
          ends_at: b.ends_at,
          status: b.status,
          is_overdue: b.is_overdue,
          vehicle_make: v?.make ?? null,
          vehicle_model: v?.model ?? null,
          vehicle_plate: v?.license_plate ?? null,
        };
      };

      const allPickups = bookings.filter((b) => {
        const s = new Date(b.starts_at);
        return s >= todayStart && s <= todayEnd && b.status === "confirmed";
      });
      pickupsTodayCount = allPickups.length;
      todayPickups = allPickups.map(mapRow).slice(0, 5);

      const allReturns = bookings.filter((b) => {
        const e = new Date(b.ends_at);
        return e >= todayStart && e <= todayEnd && b.status === "active";
      });
      returnsTodayCount = allReturns.length;
      todayReturns = allReturns.map(mapRow).slice(0, 5);
    }

    const periodPaymentRows = (!periodPaymentsRes.error && periodPaymentsRes.data) ? (periodPaymentsRes.data as PaymentRow[]) : [];

    revenueThisPeriod = sumRevenue(periodPaymentRows, selectedFrom, selectedTo);
    revenuePreviousPeriod = sumRevenue(periodPaymentRows, prevFrom, prevTo);
    revenueToday = sumRevenue(periodPaymentRows, startOfToday, endOfToday);
    revenueYesterday = sumRevenue(periodPaymentRows, startOfYesterday, endOfYesterday);
    revenue7d = sumRevenue(periodPaymentRows, last7d.from, last7d.to);
    revenueThisMonth = sumRevenue(periodPaymentRows, thisMonth.from, thisMonth.to);

    const methodTotals = new Map<string, number>();
    for (const row of periodPaymentRows) {
      const createdMs = new Date(row.created_at).getTime();
      if (createdMs < selectedFrom.getTime() || createdMs > selectedTo.getTime()) continue;
      const amount = Number(row.amount) || 0;
      let signed = 0;
      if (row.direction === "credit" && (row.kind === "rental_charge" || row.kind === "advance" || row.kind === "balance")) {
        signed = amount;
      } else if (row.direction === "debit" && row.kind === "refund") {
        signed = -amount;
      } else {
        continue;
      }
      methodTotals.set(row.method, (methodTotals.get(row.method) ?? 0) + signed);
    }
    methodBreakdown = Array.from(methodTotals.entries())
      .map(([method, amount]) => ({ method, amount }))
      .filter((entry) => entry.amount !== 0)
      .sort((a, b) => b.amount - a.amount);

    bookingsCreatedInPeriod = bookingsCreatedRes.count ?? 0;
    pickupsInPeriod = pickupsInPeriodRes.count ?? 0;
    returnsInPeriod = returnsInPeriodRes.count ?? 0;

    // Outstanding balance: rental_amount minus net applied payments, same
    // formula as migration_230's resolution path (record_rental_payment /
    // getRentalBookingBalance) — all-time per booking, not period-scoped,
    // summed across every currently active booking.
    if (activeBookings.length > 0) {
      const { data: allPaymentsForActive } = await supabase
        .from("rental_payments")
        .select("booking_id, amount, kind, direction, applied")
        .eq("organizer_id", organizerId)
        .eq("applied", true)
        .in("booking_id", activeBookings.map((b) => b.id));

      const netPaidByBooking = new Map<string, number>();
      for (const row of (allPaymentsForActive ?? []) as Array<{ booking_id: string; amount: number | string | null; kind: string; direction: string }>) {
        const amount = Number(row.amount) || 0;
        let signed = 0;
        if (row.direction === "credit" && (row.kind === "rental_charge" || row.kind === "advance" || row.kind === "balance")) {
          signed = amount;
        } else if (row.direction === "debit" && row.kind === "refund") {
          signed = -amount;
        } else {
          continue;
        }
        netPaidByBooking.set(row.booking_id, (netPaidByBooking.get(row.booking_id) ?? 0) + signed);
      }

      outstandingBalance = activeBookings.reduce((sum, booking) => {
        const netPaid = netPaidByBooking.get(booking.id) ?? 0;
        return sum + Math.max(0, booking.rental_amount - netPaid);
      }, 0);
    }
  } catch {
    // Migration not applied yet — show empty state gracefully
  }

  const utilization = fleetSize > 0
    ? Math.round((outOnRental / fleetSize) * 100)
    : 0;

  const revenueDelta = deltaFromChange(revenueThisPeriod, revenuePreviousPeriod);
  const currency = "USD";

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 text-brand-700" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
            Rental Fleet & Bookings
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Link
              href={`/dashboard/org/${organizerId}/rentals`}
              className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
            >
              <span>View all</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Revenue card — follows the period picker */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CurrencyDollar className="h-4 w-4 text-brand-700" />
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Revenue this period</p>
          </div>
          <span className="text-[11px] font-semibold text-zinc-400">{periodRangeLabel}</span>
        </div>

        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-extrabold tabular-nums text-zinc-950">
            {formatMoney(revenueThisPeriod, currency)}
          </span>
          {revenueDelta && (
            <span
              className={`text-sm font-semibold flex items-center gap-0.5 ${
                revenueDelta.direction === "up"
                  ? "text-emerald-700"
                  : revenueDelta.direction === "down"
                  ? "text-red-700"
                  : "text-zinc-600"
              }`}
            >
              {revenueDelta.isNew ? (
                <span>New</span>
              ) : (
                <>
                  <span>{revenueDelta.direction === "up" ? "↑" : revenueDelta.direction === "down" ? "↓" : "→"}</span>
                  <span>{revenueDelta.value}% vs previous period</span>
                </>
              )}
            </span>
          )}
        </div>

        {/* Always-visible compact strip, independent of the picker */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-zinc-100 pt-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Today</p>
            <p className="text-sm font-bold tabular-nums text-zinc-900">{formatMoney(revenueToday, currency)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Yesterday</p>
            <p className="text-sm font-bold tabular-nums text-zinc-900">{formatMoney(revenueYesterday, currency)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Last 7 days</p>
            <p className="text-sm font-bold tabular-nums text-zinc-900">{formatMoney(revenue7d, currency)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">This month</p>
            <p className="text-sm font-bold tabular-nums text-zinc-900">{formatMoney(revenueThisMonth, currency)}</p>
          </div>
        </div>

        {/* Payment method breakdown */}
        {methodBreakdown.length > 0 && (
          <div className="space-y-1.5 border-t border-zinc-100 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">By payment method</p>
            {methodBreakdown.map((entry) => {
              const widthPct = revenueThisPeriod > 0 ? Math.min(100, Math.round((Math.abs(entry.amount) / Math.max(revenueThisPeriod, 1)) * 100)) : 0;
              return (
                <div key={entry.method} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 font-semibold text-zinc-700">{methodLabel(entry.method)}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                    <div className="h-full rounded-full bg-brand-700" style={{ width: `${widthPct}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono font-semibold text-zinc-900">
                    {formatMoney(entry.amount, currency)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Fleet Size" value={fleetSize} format="count" href={`/dashboard/org/${organizerId}/fleet`} hint="Total active vehicles" />
        <StatCard label="Available" value={availableNow} format="count" hint="Ready at depot" />
        <StatCard label="Out on Rental" value={outOnRental} format="count" hint="In customer possession" />
        <StatCard label="Maintenance" value={maintenanceCount} format="count" hint="In service or blocked" />
        <StatCard
          label="Pending Approval"
          value={pendingCount}
          format="count"
          href={`/dashboard/org/${organizerId}/rentals?status=pending`}
          hint={pendingCount > 0 ? "Requires confirmation" : undefined}
        />
        <StatCard label="Pickups Today" value={pickupsTodayCount} format="count" hint="Confirmed, starting today" />
        <StatCard label="Returns Today" value={returnsTodayCount} format="count" hint="Due back today" />
      </div>

      {/* Period-scoped booking activity + outstanding balance */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Bookings Created" value={bookingsCreatedInPeriod} format="count" hint={periodRangeLabel} />
        <StatCard label="Pickups (period)" value={pickupsInPeriod} format="count" hint={periodRangeLabel} />
        <StatCard label="Returns (period)" value={returnsInPeriod} format="count" hint={periodRangeLabel} />
        <StatCard
          label="Outstanding Balance"
          value={outstandingBalance}
          format="money"
          currency={currency}
          href={`/dashboard/org/${organizerId}/rentals`}
          hint="Across active bookings"
        />
      </div>

      {/* Utilization strip */}
      {fleetSize > 0 && (
        <div className="flex items-center gap-3 text-sm text-zinc-600">
          <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-700 rounded-full transition-all"
              style={{ width: `${utilization}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-700">
            {utilization}% utilization ({outOnRental}/{fleetSize})
          </span>
        </div>
      )}

      {/* Alert row */}
      {(overdueCount > 0 || pendingCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {overdueCount > 0 && (
            <Link
              href={`/dashboard/org/${organizerId}/rentals?status=active`}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {overdueCount} overdue return{overdueCount !== 1 ? "s" : ""}
            </Link>
          )}
          {pendingCount > 0 && (
            <Link
              href={`/dashboard/org/${organizerId}/rentals?status=pending`}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {pendingCount} pending
            </Link>
          )}
        </div>
      )}

      {/* Today's Dispatch Queue or Empty State */}
      {todayPickups.length > 0 || todayReturns.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pickups */}
          {todayPickups.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Pickups Today
              </h3>
              <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
                {todayPickups.map((b) => (
                  <Link
                    key={b.id}
                    href={`/dashboard/org/${organizerId}/rentals/${b.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-zinc-50 transition group"
                  >
                    <Car className="h-4 w-4 text-zinc-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900 truncate">{b.customer_name}</p>
                      <p className="text-xs text-zinc-500">
                        {formatTime(b.starts_at)}
                        {b.vehicle_make ? ` · ${vehicleLabel(b.vehicle_make, b.vehicle_model)}` : " · Unassigned"}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Returns */}
          {todayReturns.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Returns Today
              </h3>
              <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
                {todayReturns.map((b) => (
                  <Link
                    key={b.id}
                    href={`/dashboard/org/${organizerId}/rentals/${b.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-zinc-50 transition group"
                  >
                    <div className={`h-2 w-2 rounded-full shrink-0 ${b.is_overdue ? "bg-red-500" : "bg-green-500"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900 truncate">
                        {b.customer_name}
                        {b.is_overdue && <span className="ml-1.5 text-[10px] font-bold text-red-600 uppercase">Overdue</span>}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Due {formatTime(b.ends_at)}
                        {b.vehicle_plate ? ` · ${b.vehicle_plate}` : ""}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : fleetSize > 0 ? (
        <EmptyState
          variant="inline"
          title="No pickups or returns scheduled for today."
          action={{
            label: "Open Bookings",
            href: `/dashboard/org/${organizerId}/rentals`,
          }}
          icon={CalendarClock}
        />
      ) : null}

      {/* Empty state */}
      {fleetSize === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center space-y-2">
          <Car className="mx-auto h-8 w-8 text-zinc-200" />
          <p className="text-sm font-semibold text-zinc-500">No vehicles in fleet</p>
          <p className="text-xs text-zinc-400">Add categories and vehicles to track your fleet.</p>
          {canManage && (
            <Link
              href={`/dashboard/org/${organizerId}/fleet/new`}
              className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-brand-700 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add Vehicle
            </Link>
          )}
        </div>
      )}

      {/* Quick actions footer */}
      {canManage && fleetSize > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href={`/dashboard/org/${organizerId}/rentals`}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            All Bookings
          </Link>
          <Link
            href={`/dashboard/org/${organizerId}/fleet`}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
          >
            <Car className="h-3.5 w-3.5" />
            Fleet
          </Link>
        </div>
      )}
    </div>
  );
}
