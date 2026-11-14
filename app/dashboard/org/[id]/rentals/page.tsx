/**
 * app/dashboard/org/[id]/rentals/page.tsx
 *
 * Rental Bookings Management Directory.
 * Displays KPI strip, tabbed booking list, and new booking action.
 * Documentation: docs/design/rental/architecture.md Decision 10.
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  IconCalendarClock as CalendarClock,
  IconCar as Car,
  IconAlertTriangle as AlertTriangle,
  IconSettings as Settings,
} from "@tabler/icons-react";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { StatCard } from "@/components/dashboard/overview/StatCard";
import { RentalsPageClient } from "@/components/dashboard/rentals/RentalsPageClient";
import type { BookingListRow } from "@/components/dashboard/rentals/BookingListClient";
import type { VehicleCategoryOption, BranchOption, VehicleOption } from "@/components/dashboard/rentals/NewBookingDialog";
import type { TodayBoardItem, TodayBoardPaymentStatus } from "@/components/dashboard/rentals/TodayBoard";
import type { CalendarVehicle, CalendarBooking, CalendarBlock } from "@/components/dashboard/rentals/RentalCalendar";
import { listVehicles } from "@/lib/actions/vehicles";

const ALLOWED_ROLES: EntityRole[] = [
  "owner", "admin", "manager", "editor", "finance", "viewer",
];

export default async function RentalsPage({
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
  if (!access.hasAccess) return notFound();

  const canManage = access.role
    ? ["owner", "admin", "manager", "editor"].includes(access.role)
    : false;

  const supabase = createSupabaseAdmin();

  // 1. Resolve active business
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, slug, status, industry, category, business_type, offerings, logo, country, created_at")
    .eq("organizer_id", organizerId);

  const eligibleBusinesses = (businesses ?? []).filter(isOrganizerDashboardBusiness);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const queryBusinessId =
    typeof resolvedSearchParams.business === "string"
      ? resolvedSearchParams.business
      : null;
  const queryStatus =
    typeof resolvedSearchParams.status === "string"
      ? resolvedSearchParams.status
      : null;
  const initialTab =
    queryStatus === "pending"
      ? "pending"
      : queryStatus === "active"
      ? "active"
      : queryStatus === "completed"
      ? "completed"
      : queryStatus === "cancelled"
      ? "cancelled"
      : "all";
  const cookieStore = await cookies();
  const cookieBusinessId =
    cookieStore.get(getActiveBusinessCookieName(organizerId))?.value ?? null;
  const activeBusiness = resolveActiveBusiness(eligibleBusinesses, {
    searchParamBusinessId: queryBusinessId,
    cookieBusinessId,
  });

  if (!activeBusiness) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">Rentals</h1>
        <p className="text-sm text-zinc-500">No business configured. <Link href={`/dashboard/org/${organizerId}/settings`} className="text-brand-700 underline">Set up a business</Link> first.</p>
      </div>
    );
  }

  // 2. Load bookings, categories, vehicles, branches (graceful if migration not applied)
  let bookings: BookingListRow[] = [];
  let pendingCount = 0;
  let activeCount = 0;
  let overdueCount = 0;
  let todayPickupsCount = 0;
  let todayReturnsCount = 0;

  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const { data: rawBookings, error } = await supabase
      .from("rental_bookings")
      .select(`
        id, booking_number, customer_name, customer_email,
        starts_at, ends_at, status, is_overdue, source,
        rental_amount, snapshot_currency, vehicle_id,
        vehicles ( make, model, license_plate )
      `)
      .eq("organizer_id", organizerId)
      .eq("business_id", activeBusiness.id)
      .order("starts_at", { ascending: false })
      .limit(200);

    if (!error && rawBookings) {
      bookings = rawBookings.map((b) => {
        const v = Array.isArray(b.vehicles) ? b.vehicles[0] : b.vehicles;
        return {
          id: b.id,
          booking_number: b.booking_number,
          customer_name: b.customer_name,
          customer_email: b.customer_email,
          starts_at: b.starts_at,
          ends_at: b.ends_at,
          status: b.status,
          is_overdue: b.is_overdue,
          source: b.source,
          rental_amount: Number(b.rental_amount),
          snapshot_currency: b.snapshot_currency,
          vehicle_id: b.vehicle_id,
          vehicle_make: v?.make ?? null,
          vehicle_model: v?.model ?? null,
          vehicle_plate: v?.license_plate ?? null,
        } as BookingListRow;
      });

      pendingCount = bookings.filter((b) => b.status === "pending" || b.status === "awaiting_payment" || b.status === "confirmed").length;
      activeCount = bookings.filter((b) => b.status === "active").length;
      overdueCount = bookings.filter((b) => b.is_overdue && b.status === "active").length;
      todayPickupsCount = bookings.filter((b) => {
        const s = new Date(b.starts_at);
        return s >= todayStart && s <= todayEnd && b.status === "confirmed";
      }).length;
      todayReturnsCount = bookings.filter((b) => {
        const e = new Date(b.ends_at);
        return e >= todayStart && e <= todayEnd && b.status === "active";
      }).length;
    }
  } catch {
    // Migration not applied yet — show empty state
  }

  // 3. Load categories and vehicles for the new booking dialog
  let categories: VehicleCategoryOption[] = [];
  let branches: BranchOption[] = [];
  let vehicles: VehicleOption[] = [];

  try {
    const [catRes, branchRes, vehicleRes] = await Promise.all([
      supabase
        .from("vehicle_categories")
        .select("id, name, daily_rate, weekly_rate, deposit_amount, currency")
        .eq("organizer_id", organizerId)
        .eq("business_id", activeBusiness.id)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("business_branches")
        .select("id, label, city")
        .eq("business_id", activeBusiness.id)
        .eq("status", "active"),
      supabase
        .from("vehicles")
        .select("id, make, model, license_plate, category_id, status")
        .eq("organizer_id", organizerId)
        .eq("business_id", activeBusiness.id)
        .eq("is_active", true),
    ]);

    if (!catRes.error && catRes.data) categories = catRes.data as VehicleCategoryOption[];
    if (!branchRes.error && branchRes.data) branches = branchRes.data as BranchOption[];
    if (!vehicleRes.error && vehicleRes.data) vehicles = vehicleRes.data as VehicleOption[];
  } catch {
    // Non-fatal
  }

  // 4. Calendar data: vehicles (with photo + category, via the same
  // organizer-scoped action the Fleet page uses), bookings and
  // maintenance blocks within a wide window around today (-30/+180 days)
  // so prev/next/30-day navigation works client-side without a server
  // round trip per click. Today Board: pickups/drop-offs/late returns for
  // today specifically, plus their payment balance.
  let calendarVehicles: CalendarVehicle[] = [];
  let calendarBookings: CalendarBooking[] = [];
  let calendarBlocks: CalendarBlock[] = [];
  let todayPickups: TodayBoardItem[] = [];
  let todayDropoffs: TodayBoardItem[] = [];
  let lateReturns: TodayBoardItem[] = [];

  try {
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const calWindowStart = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const calWindowEnd = new Date(now.getTime() + 180 * 86_400_000).toISOString();

    const calVehiclesRes = await listVehicles(organizerId, { businessId: activeBusiness.id });
    calendarVehicles = calVehiclesRes.data.map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      licensePlate: v.license_plate,
      categoryId: v.category_id,
      categoryName: v.category?.name ?? "Uncategorized",
      photoUrl: v.photo_url ?? v.category?.photo_url ?? null,
    }));
    const calendarVehicleIds = calendarVehicles.map((v) => v.id);

    const [calBookingsRes, calBlocksRes, pickupsRes, dropoffsRes, lateRes] = await Promise.all([
      supabase
        .from("rental_bookings")
        .select("id, booking_number, customer_name, starts_at, ends_at, status, vehicle_id")
        .eq("organizer_id", organizerId)
        .eq("business_id", activeBusiness.id)
        .in("status", ["pending", "awaiting_payment", "confirmed", "active"])
        .lte("starts_at", calWindowEnd)
        .gte("ends_at", calWindowStart)
        .limit(1000),
      calendarVehicleIds.length > 0
        ? supabase
            .from("rental_blocks")
            .select("id, vehicle_id, starts_at, ends_at, reason")
            .eq("organizer_id", organizerId)
            .in("vehicle_id", calendarVehicleIds)
            .lte("starts_at", calWindowEnd)
            .gte("ends_at", calWindowStart)
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("rental_bookings")
        .select("id, booking_number, customer_name, starts_at, ends_at, payment_status, rental_amount, snapshot_currency, vehicle_id, vehicles ( make, model, license_plate )")
        .eq("organizer_id", organizerId)
        .eq("business_id", activeBusiness.id)
        .eq("status", "confirmed")
        .gte("starts_at", todayStart.toISOString())
        .lte("starts_at", todayEnd.toISOString()),
      supabase
        .from("rental_bookings")
        .select("id, booking_number, customer_name, starts_at, ends_at, payment_status, rental_amount, snapshot_currency, vehicle_id, vehicles ( make, model, license_plate )")
        .eq("organizer_id", organizerId)
        .eq("business_id", activeBusiness.id)
        .eq("status", "active")
        .gte("ends_at", todayStart.toISOString())
        .lte("ends_at", todayEnd.toISOString()),
      supabase
        .from("rental_bookings")
        .select("id, booking_number, customer_name, starts_at, ends_at, payment_status, rental_amount, snapshot_currency, vehicle_id, vehicles ( make, model, license_plate )")
        .eq("organizer_id", organizerId)
        .eq("business_id", activeBusiness.id)
        .eq("status", "active")
        .eq("is_overdue", true),
    ]);

    if (!calBookingsRes.error && calBookingsRes.data) {
      calendarBookings = calBookingsRes.data.map((b) => ({
        id: b.id,
        bookingNumber: b.booking_number,
        customerName: b.customer_name,
        startsAt: b.starts_at,
        endsAt: b.ends_at,
        status: b.status as CalendarBooking["status"],
        vehicleId: b.vehicle_id,
      }));
    }
    if (!calBlocksRes.error && calBlocksRes.data) {
      calendarBlocks = (calBlocksRes.data as Array<{ id: string; vehicle_id: string; starts_at: string; ends_at: string; reason: string }>).map((blk) => ({
        id: blk.id,
        vehicleId: blk.vehicle_id,
        startsAt: blk.starts_at,
        endsAt: blk.ends_at,
        reason: blk.reason,
      }));
    }

    // Net-paid balance due for every Today Board item, same formula as
    // migration 230 / FinancialsCard: credits of rental_charge/advance/
    // balance minus debit refunds, applied rows only.
    type RawTodayRow = {
      id: string;
      booking_number: string;
      customer_name: string;
      starts_at: string;
      ends_at: string;
      payment_status: TodayBoardPaymentStatus;
      rental_amount: number;
      snapshot_currency: string;
      vehicle_id: string | null;
      vehicles: { make: string; model: string; license_plate: string } | { make: string; model: string; license_plate: string }[] | null;
    };
    const rawPickups = (pickupsRes.data ?? []) as RawTodayRow[];
    const rawDropoffs = (dropoffsRes.data ?? []) as RawTodayRow[];
    const rawLate = (lateRes.data ?? []) as RawTodayRow[];
    const allTodayIds = [...rawPickups, ...rawDropoffs, ...rawLate].map((r) => r.id);

    const netPaidByBooking = new Map<string, number>();
    if (allTodayIds.length > 0) {
      const { data: paymentRows } = await supabase
        .from("rental_payments")
        .select("booking_id, amount, kind, direction, applied")
        .eq("organizer_id", organizerId)
        .in("booking_id", allTodayIds)
        .eq("applied", true);
      for (const row of (paymentRows ?? []) as Array<{ booking_id: string; amount: number | string | null; kind: string; direction: string }>) {
        const amount = Number(row.amount) || 0;
        let signed = 0;
        if (row.direction === "credit" && ["rental_charge", "advance", "balance"].includes(row.kind)) signed = amount;
        else if (row.direction === "debit" && row.kind === "refund") signed = -amount;
        else continue;
        netPaidByBooking.set(row.booking_id, (netPaidByBooking.get(row.booking_id) ?? 0) + signed);
      }
    }

    function toBoardItem(row: RawTodayRow, timeField: "starts_at" | "ends_at"): TodayBoardItem {
      const v = Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles;
      const netPaid = netPaidByBooking.get(row.id) ?? 0;
      const rentalAmount = Number(row.rental_amount) || 0;
      return {
        id: row.id,
        bookingNumber: row.booking_number,
        customerName: row.customer_name,
        vehicleLabel: v ? `${v.make} ${v.model} (${v.license_plate})` : null,
        time: row[timeField],
        paymentStatus: row.payment_status,
        balanceDue: Math.max(0, Math.round((rentalAmount - netPaid) * 100) / 100),
        currency: row.snapshot_currency,
      };
    }

    todayPickups = rawPickups.map((r) => toBoardItem(r, "starts_at"));
    todayDropoffs = rawDropoffs.map((r) => toBoardItem(r, "ends_at"));
    lateReturns = rawLate.map((r) => toBoardItem(r, "ends_at"));
  } catch {
    // Non-fatal — calendar/today-board sections just render empty.
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
            Rentals
          </h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
            Manage bookings, track vehicles, and handle customer handovers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/org/${organizerId}/rentals/settings`}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition"
          >
            <Settings className="h-4 w-4 text-zinc-400" />
            Settings
          </Link>
          <Link
            href={`/dashboard/org/${organizerId}/fleet`}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition"
          >
            <Car className="h-4 w-4 text-zinc-400" />
            Fleet
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Pending" value={pendingCount} format="count" hint="Pending + Confirmed" />
        <StatCard label="Active" value={activeCount} format="count" hint="Currently out on rental" />
        <StatCard label="Pickups Today" value={todayPickupsCount} format="count" hint="Confirmed, starting today" />
        <StatCard label="Returns Today" value={todayReturnsCount} format="count" hint="Active, ending today" />
        <div className="col-span-2 sm:col-span-1">
          <StatCard
            label="Overdue"
            value={overdueCount}
            format="count"
            hint="Active rentals past return time"
          />
        </div>
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{overdueCount}</strong> overdue rental{overdueCount !== 1 ? "s" : ""} — vehicles past return time.
          </span>
        </div>
      )}

      {/* Booking list */}
      {bookings.length === 0 && categories.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center space-y-3">
          <CalendarClock className="mx-auto h-10 w-10 text-zinc-200" />
          <p className="text-sm font-semibold text-zinc-500">No bookings yet</p>
          <p className="text-xs text-zinc-400">
            Add vehicles and categories in{" "}
            <Link href={`/dashboard/org/${organizerId}/fleet`} className="text-brand-700 underline">Fleet</Link>{" "}
            first, then create your first booking.
          </p>
        </div>
      ) : (
        <RentalsPageClient
          bookings={bookings}
          organizerId={organizerId}
          businessId={activeBusiness.id}
          canManage={canManage}
          categories={categories}
          branches={branches}
          vehicles={vehicles}
          initialTab={initialTab}
          todayPickups={todayPickups}
          todayDropoffs={todayDropoffs}
          lateReturns={lateReturns}
          calendarVehicles={calendarVehicles}
          calendarBookings={calendarBookings}
          calendarBlocks={calendarBlocks}
        />
      )}
    </div>
  );
}
