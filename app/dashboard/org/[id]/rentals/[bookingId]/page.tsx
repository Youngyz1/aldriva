/**
 * app/dashboard/org/[id]/rentals/[bookingId]/page.tsx
 *
 * Rental Booking Detail page.
 * Shows full booking info, vehicle assignment, deposit, and status actions.
 * Documentation: docs/design/rental/architecture.md Decision 10 & 11.
 */

import { vehicleLabel } from "@/lib/vehicle-label";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  IconArrowLeft as ArrowLeft,
  IconCar as Car,
  IconCalendar as Calendar,
  IconUser as User,
  IconMapPin as MapPin,
  IconCurrencyDollar as CurrencyDollar,
} from "@tabler/icons-react";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { RentalBookingStatusBadge } from "@/components/dashboard/rentals/RentalBookingStatusBadge";
import type { RentalBookingStatus } from "@/components/dashboard/rentals/RentalBookingStatusBadge";
import { BookingDetailActions } from "@/components/dashboard/rentals/BookingDetailActions";
import { VehicleAssignmentPanel } from "@/components/dashboard/rentals/VehicleAssignmentPanel";
import type { AssignableVehicle } from "@/components/dashboard/rentals/VehicleAssignmentPanel";
import { DepositPanel } from "@/components/dashboard/rentals/DepositPanel";
import type { DepositStatus } from "@/components/dashboard/rentals/DepositPanel";
import { getRentalReceiptDataForStaff } from "@/lib/rental/receipt-data";
import { StaffRentalReceiptPanel } from "@/components/rental/StaffRentalReceiptPanel";
import { FinancialsCard, type FinancialsPaymentRow, type FinancialsPaymentStatus } from "@/components/dashboard/rentals/FinancialsCard";
import { CustomerCard } from "@/components/dashboard/rentals/CustomerCard";
import { HandoverPanel } from "@/components/dashboard/rentals/HandoverPanel";
import { getRentalInspections } from "@/lib/actions/rental-handover";

const ALLOWED_ROLES: EntityRole[] = [
  "owner", "admin", "manager", "editor", "finance", "viewer",
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string; bookingId: string }>;
}) {
  const { id: organizerId, bookingId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await checkTenantAccess(user.id, organizerId, ALLOWED_ROLES);
  if (!access.hasAccess) return notFound();

  const canManage = access.role
    ? ["owner", "admin", "manager", "editor"].includes(access.role)
    : false;

  const canViewDriverPII = access.role
    ? ["owner", "admin", "manager"].includes(access.role)
    : false;

  const supabase = createSupabaseAdmin();

  // Load booking with related data.
  // Sensitive driver PII (driver_license_number, driver_license_country, driver_dob)
  // is strictly restricted to owner, admin, manager — and is omitted from the SELECT
  // query entirely for other roles (editor, finance, viewer).
  let booking: Record<string, unknown> | null = null;
  let availableVehicles: AssignableVehicle[] = [];

  try {
    const bookingColumns = canViewDriverPII
      ? `*,
         vehicles ( id, make, model, license_plate, current_mileage, status, branch_id ),
         vehicle_categories ( id, name, daily_rate, weekly_rate, currency, deposit_amount ),
         pickup_branch:business_branches!pickup_branch_id ( id, label, city, address ),
         return_branch:business_branches!return_branch_id ( id, label, city, address )`
      : `id, organizer_id, business_id, category_id, vehicle_id, source, booking_number,
         starts_at, ends_at, expires_at, pickup_branch_id, return_branch_id,
         customer_name, customer_email, customer_phone, status, is_overdue,
         rental_amount, snapshot_daily_rate, snapshot_weekly_rate, snapshot_currency,
         deposit_required_amount, deposit_collected_amount, deposit_status,
         payment_status, notes, picked_up_at, returned_at, created_at, updated_at,
         vehicles ( id, make, model, license_plate, current_mileage, status, branch_id ),
         vehicle_categories ( id, name, daily_rate, weekly_rate, currency, deposit_amount ),
         pickup_branch:business_branches!pickup_branch_id ( id, label, city, address ),
         return_branch:business_branches!return_branch_id ( id, label, city, address )`;

    const { data, error } = await supabase
      .from("rental_bookings")
      .select(bookingColumns)
      .eq("id", bookingId)
      .eq("organizer_id", organizerId)
      .single();

    if (error || !data) return notFound();
    booking = (data as unknown) as Record<string, unknown>;

    // Load available vehicles in the same category for assignment panel
    const { data: vData } = await supabase
      .from("vehicles")
      .select("id, make, model, license_plate, current_mileage, status, branch_id")
      .eq("organizer_id", organizerId)
      .eq("category_id", ((data as unknown) as Record<string, unknown>).category_id as string)
      .eq("is_active", true)
      .neq("status", "out_of_service");

    if (vData) availableVehicles = vData as AssignableVehicle[];
  } catch {
    return notFound();
  }

  if (!booking) return notFound();

  // Applied payment history for the Financials card. Staff-only data,
  // scoped to this organizer and this booking — never exposed to customers.
  let financialsPayments: FinancialsPaymentRow[] = [];
  try {
    const { data: paymentRows } = await supabase
      .from("rental_payments")
      .select("id, method, kind, amount, direction, applied, created_at")
      .eq("organizer_id", organizerId)
      .eq("booking_id", bookingId)
      .eq("applied", true)
      .order("created_at", { ascending: false });

    financialsPayments = (paymentRows ?? []).map((row) => ({
      id: row.id as string,
      method: row.method as string,
      kind: row.kind as string,
      amount: Number(row.amount) || 0,
      createdAt: row.created_at as string,
    }));
  } catch {
    financialsPayments = [];
  }

  let inspections: import("@/lib/actions/rental-handover").RentalInspectionRow[] = [];
  try {
    const inspRes = await getRentalInspections(bookingId, organizerId);
    if (inspRes.success) inspections = inspRes.inspections;
  } catch {
    inspections = [];
  }

  const vehicle = Array.isArray(booking.vehicles) ? booking.vehicles[0] : booking.vehicles as Record<string, unknown> | null;
  const category = Array.isArray(booking.vehicle_categories) ? booking.vehicle_categories[0] : booking.vehicle_categories as Record<string, unknown> | null;
  const pickupBranch = Array.isArray(booking.pickup_branch) ? booking.pickup_branch[0] : booking.pickup_branch as Record<string, unknown> | null;
  const returnBranch = Array.isArray(booking.return_branch) ? booking.return_branch[0] : booking.return_branch as Record<string, unknown> | null;

  const status = booking.status as RentalBookingStatus;
  const depositStatus = booking.deposit_status as DepositStatus;
  const currency = booking.snapshot_currency as string || "USD";
  const currentVehicleLabel = vehicle
    ? `${vehicleLabel(vehicle.make, vehicle.model)} (${vehicle.license_plate})`
    : null;
  const rentalStartMs = new Date(booking.starts_at as string).getTime();
  const rentalEndMs = new Date(booking.ends_at as string).getTime();
  const totalRentalDays =
    Number.isFinite(rentalStartMs) && Number.isFinite(rentalEndMs) && rentalEndMs > rentalStartMs
      ? Math.max(1, Math.ceil((rentalEndMs - rentalStartMs) / 86_400_000))
      : null;
  const rentalAmountNum = Number(booking.rental_amount) || 0;
  const netPaid = financialsPayments.reduce((total, row) => {
    const sign = row.kind === "refund" ? -1 : 1;
    return total + sign * row.amount;
  }, 0);
  const balanceDue = Math.max(0, rentalAmountNum - Math.max(0, netPaid));

  let staffReceiptData = null;
  if (canManage) {
    try {
      staffReceiptData = await getRentalReceiptDataForStaff(bookingId, organizerId);
    } catch {
      staffReceiptData = null;
    }
  }

  return (
    <div className="pb-24 lg:grid lg:grid-cols-[1fr_312px] lg:items-start lg:gap-6">
      <div className="space-y-6 lg:min-w-0">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/org/${organizerId}/rentals`}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 transition"
          aria-label="Back to rentals"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 font-mono">
              {booking.booking_number as string}
            </h1>
            <RentalBookingStatusBadge
              status={status}
              isOverdue={booking.is_overdue as boolean}
              size="md"
            />
            {booking.source === "online" && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                Online booking
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status actions — one aligned toolbar: status actions on the left
          (Cancel visually separated inside BookingDetailActions itself),
          Print receipt at the far right via justify-between. Pickup/return
          handovers are handled below in HandoverPanel (inspection + atomic status). */}
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3">
          <BookingDetailActions
            bookingId={bookingId}
            organizerId={organizerId}
            status={status}
          />
          <div className="flex items-center gap-2">
            <Link
              href={`/api/rentals/agreement/${bookingId}?organizerId=${organizerId}`}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Agreement PDF
            </Link>
            {staffReceiptData ? <StaffRentalReceiptPanel data={staffReceiptData} /> : null}
          </div>
        </div>
      )}

      {canManage && (
        <HandoverPanel
          bookingId={bookingId}
          organizerId={organizerId}
          status={status}
          currency={currency}
          startsAt={String(booking.starts_at)}
          endsAt={String(booking.ends_at)}
          paymentStatus={String(booking.payment_status || "unpaid")}
          rentalAmount={rentalAmountNum}
          balanceDue={balanceDue}
          depositRequired={Number(booking.deposit_required_amount) || 0}
          depositCollected={Number(booking.deposit_collected_amount) || 0}
          depositStatus={depositStatus}
          existingLateFeeAmount={Number(booking.late_fee_amount) || 0}
          existingLateFeeStatus={String(booking.late_fee_status || "none")}
          inspections={inspections}
          canManage={canManage}
        />
      )}

      {/* Receipt panel, mobile/tablet: inline under the action row, full
          width capped at 340px, centred. Hidden at lg+, where the sticky
          right rail below is used instead — StaffRentalReceiptPanel
          portals into whichever of the two is visible. */}
      <div id="rental-receipt-rail-mobile" className="mx-auto w-full max-w-[340px] lg:hidden" />

      {/* Detail sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Customer */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Customer
          </h2>
          <CustomerCard
            customerName={booking.customer_name as string}
            customerEmail={(booking.customer_email as string) ?? null}
            customerPhone={(booking.customer_phone as string | null) ?? null}
            source={(booking.source as string | null) ?? null}
            canViewDriverPII={canViewDriverPII}
            driverLicenseNumber={(booking.driver_license_number as string | null) ?? null}
            driverLicenseCountry={(booking.driver_license_country as string | null) ?? null}
            driverDob={(booking.driver_dob as string | null) ?? null}
          />
        </section>

        {/* Dates */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Rental Period
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 w-16 shrink-0">Pickup:</span>
              <span className="font-medium text-zinc-900">{formatDateTime(booking.starts_at as string)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 w-16 shrink-0">Return:</span>
              <span className="font-medium text-zinc-900">{formatDateTime(booking.ends_at as string)}</span>
            </div>
            {totalRentalDays !== null && (
              <div className="flex items-center gap-2 border-t border-zinc-100 pt-2">
                <span className="text-zinc-500 w-16 shrink-0">Total:</span>
                <span className="font-semibold text-zinc-900">{totalRentalDays} day{totalRentalDays !== 1 ? "s" : ""}</span>
              </div>
            )}
            {Boolean(booking.picked_up_at) && (
              <div className="flex items-center gap-2 text-green-700">
                <span className="w-16 shrink-0 text-xs font-semibold">Picked up:</span>
                <span className="text-sm">{formatDateTime(booking.picked_up_at as string)}</span>
              </div>
            )}
            {Boolean(booking.returned_at) && (
              <div className="flex items-center gap-2 text-blue-700">
                <span className="w-16 shrink-0 text-xs font-semibold">Returned:</span>
                <span className="text-sm">{formatDateTime(booking.returned_at as string)}</span>
              </div>
            )}
          </div>
        </section>

        {/* Vehicle */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <Car className="h-3.5 w-3.5" /> Vehicle
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
            {category && (
              <p className="text-xs text-zinc-500">Category: <strong className="text-zinc-700">{category.name as string}</strong></p>
            )}
            <VehicleAssignmentPanel
              bookingId={bookingId}
              organizerId={organizerId}
              currentVehicleId={booking.vehicle_id as string | null}
              currentVehicleLabel={currentVehicleLabel}
              availableVehicles={availableVehicles}
              categoryId={booking.category_id as string}
              canManage={canManage}
            />
          </div>
        </section>

        {/* Locations */}
        {(pickupBranch || returnBranch) && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Locations
            </h2>
            <div className="text-sm space-y-2">
              {pickupBranch && (
                <div>
                  <span className="text-xs font-semibold text-zinc-500 uppercase">Pickup: </span>
                  <span className="text-zinc-900">{pickupBranch.label as string}{pickupBranch.city ? `, ${pickupBranch.city}` : ""}</span>
                  {Boolean(pickupBranch.address) && (
                    <p className="text-xs text-zinc-400 mt-0.5">{pickupBranch.address as string}</p>
                  )}
                </div>
              )}
              {returnBranch && (
                <div>
                  <span className="text-xs font-semibold text-zinc-500 uppercase">Return: </span>
                  <span className="text-zinc-900">{returnBranch.label as string}{returnBranch.city ? `, ${returnBranch.city}` : ""}</span>
                  {Boolean(returnBranch.address) && (
                    <p className="text-xs text-zinc-400 mt-0.5">{returnBranch.address as string}</p>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Financials */}
        <section className="space-y-3 md:col-span-2 xl:col-span-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <CurrencyDollar className="h-3.5 w-3.5" /> Financials
          </h2>
          <FinancialsCard
            currency={currency}
            rentalAmount={Number(booking.rental_amount) || 0}
            paymentStatus={
              (["paid", "partially_paid", "unpaid", "refunded"] as const).includes(
                booking.payment_status as FinancialsPaymentStatus
              )
                ? (booking.payment_status as FinancialsPaymentStatus)
                : "unpaid"
            }
            payments={financialsPayments}
            lateFeeAmount={Number(booking.late_fee_amount) || 0}
            lateFeeStatus={String(booking.late_fee_status || "none")}
          />

          {/* Deposit panel */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Security Deposit</p>
            <DepositPanel
              bookingId={bookingId}
              organizerId={organizerId}
              currency={currency}
              depositRequired={Number(booking.deposit_required_amount)}
              depositCollected={Number(booking.deposit_collected_amount)}
              depositRetained={Number(booking.deposit_retained_amount) || 0}
              depositStatus={depositStatus}
              retentionReason={(booking.deposit_retention_reason as string | null) ?? null}
              canManage={canManage}
            />
          </div>
        </section>

        {/* Notes */}
        {Boolean(booking.notes) && (
          <section className="space-y-2 md:col-span-2 xl:col-span-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Notes</h2>
            <p className="text-sm text-zinc-700 whitespace-pre-line">{booking.notes as string}</p>
          </section>
        )}
      </div>
    </div>

      {/* Receipt panel, desktop: sticky right rail below the header,
          never covering or shifting the left column. Hidden below lg,
          where the inline mobile rail above is used instead. */}
      <aside className="hidden lg:sticky lg:top-16 lg:block lg:self-start">
        <div id="rental-receipt-rail-desktop" />
      </aside>
    </div>
  );
}
