"use server";

/**
 * lib/actions/rental-bookings.ts
 *
 * Server actions for the Vehicle Rental Booking system (Slice 2).
 * Documentation: docs/design/rental/architecture.md §5 (Slice 2)
 *
 * Key invariants:
 *  - deposit_* fields are NEVER added to rental_amount (deposit is not revenue)
 *  - Exclusion constraint (23P01) is the true concurrency guard for vehicle assignment
 *  - Use createSupabaseServer() for auth checks, createSupabaseAdmin() for DB writes
 */

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { calculateRentalAmount } from "@/lib/rental/pricing";
import { validateRentalDatesAndDriver } from "@/lib/rental/validation";
import { WRITE_ROLES, VIEW_ROLES, verifyAuth } from "@/lib/rental/auth";

// ---------------------------------------------------------------------------
// Helpers (identical to pattern in rental-categories.ts)
// ---------------------------------------------------------------------------

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "42P01" || code === "42703") return true;
  const message = (err as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    (message.includes("does not exist") || message.includes("schema cache"))
  );
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface RentalBookingRow {
  id: string;
  lookup_token: string;
  booking_number: string;
  organizer_id: string;
  business_id: string;
  category_id: string;
  vehicle_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  source: "online" | "office";
  starts_at: string;
  ends_at: string;
  expires_at: string | null;
  booking_period: string | null;
  pickup_branch_id: string | null;
  return_branch_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  driver_license_number: string | null;
  driver_license_country: string | null;
  driver_dob: string | null;
  status:
    | "pending"
    | "awaiting_payment"
    | "confirmed"
    | "active"
    | "completed"
    | "cancelled"
    | "expired"
    | "no_show";
  rental_amount: number;
  snapshot_daily_rate: number;
  snapshot_weekly_rate: number | null;
  snapshot_currency: string;
  payment_status: "unpaid" | "partially_paid" | "paid" | "refunded";
  deposit_required_amount: number;
  deposit_collected_amount: number;
  deposit_retained_amount: number;
  deposit_status:
    | "none"
    | "pending_collection"
    | "collected_offline"
    | "returned_full"
    | "partially_retained"
    | "retained_full";
  deposit_retention_reason: string | null;
  deposit_retention_authorized_by: string | null;
  deposit_notes: string | null;
  late_fee_amount: number;
  late_fee_status: "none" | "pending" | "collected" | "waived";
  late_fee_notes: string | null;
  picked_up_at: string | null;
  returned_at: string | null;
  start_mileage: number | null;
  end_mileage: number | null;
  is_overdue: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRentalBookingInput {
  organizerId: string;
  businessId: string;
  categoryId: string;
  vehicleId?: string | null;
  source?: "online" | "office";
  startsAt: string; // ISO string
  endsAt: string; // ISO string
  expiresAt?: string | null;
  pickupBranchId?: string | null;
  returnBranchId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  driverLicenseNumber?: string | null;
  driverLicenseCountry?: string | null;
  driverDob?: string | null;
  snapshotDailyRate?: number;
  snapshotWeeklyRate?: number | null;
  snapshotCurrency?: string;
  depositRequiredAmount?: number;
  billingBoundary?: "rolling_24h" | "calendar_day";
  notes?: string | null;
  collectPaymentNow?: boolean;
  paymentMethod?: "cash" | "card_offline" | "mobile_money" | "card_terminal";
  amountReceived?: number;
  collectDepositNow?: boolean;
}

export interface RecordDepositInput {
  collectedAmount?: number;
  amount?: number;
  paid?: boolean;
  depositStatus?:
    | "pending_collection"
    | "collected_offline"
    | "returned_full"
    | "partially_retained"
    | "retained_full";
  retainedAmount?: number;
  retentionReason?: string | null;
  retentionAuthorizedBy?: string | null;
  notes?: string | null;
}

export interface ListRentalBookingsOptions {
  businessId?: string;
  status?: RentalBookingRow["status"] | RentalBookingRow["status"][];
  vehicleId?: string;
  categoryId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface CreateMaintenanceBlockInput {
  organizerId: string;
  businessId: string;
  vehicleId: string;
  startsAt: string;
  endsAt: string;
  reason?: "maintenance" | "inspection" | "repair" | "owner_use";
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// createRentalBooking (Staff only — always verifies authentication)
// ---------------------------------------------------------------------------

export async function createRentalBooking(input: CreateRentalBookingInput): Promise<
  | { booking: RentalBookingRow }
  | {
      error:
        | "UNAUTHORIZED"
        | "FORBIDDEN"
        | "VALIDATION_ERROR"
        | "VEHICLE_CONFLICT"
        | "CATEGORY_CAPACITY_EXCEEDED"
        | "TABLE_NOT_FOUND"
        | "DB_ERROR"
        | "TENANT_MISMATCH"
        | "CATEGORY_MISMATCH"
        | "VEHICLE_INVALID";
      field?: string;
      message?: string;
    }
> {
  // Staff writes ALWAYS require authentication & role checks.
  // Passing source 'online' to this exported action does NOT skip the check.
  try {
    await verifyAuth(input.organizerId, WRITE_ROLES);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return {
      error: msg === "Forbidden" ? "FORBIDDEN" : "UNAUTHORIZED",
      message: msg,
    };
  }

  return createRentalBookingInternal(input);
}

// ---------------------------------------------------------------------------
// createRentalBookingInternal (Shared engine for staff & public storefront)
// ---------------------------------------------------------------------------

export async function createRentalBookingInternal(input: CreateRentalBookingInput): Promise<
  | { booking: RentalBookingRow }
  | {
      error:
        | "UNAUTHORIZED"
        | "FORBIDDEN"
        | "VALIDATION_ERROR"
        | "VEHICLE_CONFLICT"
        | "CATEGORY_CAPACITY_EXCEEDED"
        | "TABLE_NOT_FOUND"
        | "DB_ERROR"
        | "TENANT_MISMATCH"
        | "CATEGORY_MISMATCH"
        | "VEHICLE_INVALID";
      field?: string;
      message?: string;
    }
> {
  const adminSupabase = createSupabaseAdmin();

  // Load business storefront rules (min notice hours, min driver age)
  let minNoticeHours = 2;
  let minDriverAge = 21;
  let requireLicenseDob = false;
  try {
    const { data: biz } = await adminSupabase
      .from("businesses")
      .select("rental_min_notice_hours, rental_min_driver_age, rental_require_license_dob")
      .eq("id", input.businessId)
      .maybeSingle();
    if (biz) {
      if (biz.rental_min_notice_hours != null) minNoticeHours = Number(biz.rental_min_notice_hours);
      if (biz.rental_min_driver_age != null) minDriverAge = Number(biz.rental_min_driver_age);
      if (biz.rental_require_license_dob != null) requireLicenseDob = Boolean(biz.rental_require_license_dob);
    }
  } catch {
    // defaults
  }

  // Office bookings may start now: bypass minimum notice for staff
  if (input.source === "office") {
    minNoticeHours = 0;
  }

  // Validate dates, notice, driver age, and DOB
  const validation = validateRentalDatesAndDriver({
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    driverDob: input.driverDob,
    driverLicenseNumber: input.driverLicenseNumber,
    requireLicenseDob,
    minDriverAge,
    minNoticeHours,
  });

  if (!validation.valid) {
    return {
      error: "VALIDATION_ERROR",
      field: validation.field,
      message: validation.message,
    };
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);

  // Resolve rates and currency from category if not provided
  let dailyRate = input.snapshotDailyRate;
  let weeklyRate = input.snapshotWeeklyRate;
  let currency = input.snapshotCurrency;
  let depositAmount = input.depositRequiredAmount;

  if (dailyRate === undefined) {
    try {
      const { data: cat } = await adminSupabase
        .from("vehicle_categories")
        .select("daily_rate, weekly_rate, currency, deposit_amount")
        .eq("id", input.categoryId)
        .single();
      if (cat) {
        dailyRate = Number(cat.daily_rate);
        weeklyRate = cat.weekly_rate ? Number(cat.weekly_rate) : null;
        currency = currency ?? cat.currency;
        depositAmount = depositAmount ?? Number(cat.deposit_amount);
      } else {
        dailyRate = 0;
      }
    } catch {
      dailyRate = 0;
    }
  }

  // Calculate rental_amount
  const rentalAmount = calculateRentalAmount({
    dailyRate: dailyRate ?? 0,
    weeklyRate,
    startsAt,
    endsAt,
    billingBoundary: input.billingBoundary ?? "rolling_24h",
  });

  // Call the atomic SECURITY DEFINER function with advisory lock (Decision 1 & 5)
  // Inside Postgres, this acquires pg_advisory_xact_lock(hashtext('rental_category_' || category_id))
  let rawBooking: unknown = null;
  const { data: rpcBooking, error: rpcError } = await adminSupabase.rpc(
    "create_rental_booking",
    {
      p_organizer_id: input.organizerId,
      p_business_id: input.businessId,
      p_category_id: input.categoryId,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
      p_customer_name: input.customerName.trim(),
      p_customer_email: (input.customerEmail || "").trim().toLowerCase(),
      p_snapshot_daily_rate: dailyRate ?? 0,
      p_rental_amount: rentalAmount,
      p_vehicle_id: input.vehicleId ?? null,
      p_source: input.source ?? "office",
      p_pickup_branch_id: input.pickupBranchId ?? null,
      p_return_branch_id: input.returnBranchId ?? null,
      p_customer_phone: input.customerPhone ?? null,
      p_driver_license_number: input.driverLicenseNumber ?? null,
      p_driver_license_country: input.driverLicenseCountry ?? null,
      p_driver_dob: input.driverDob ?? null,
      p_snapshot_weekly_rate: weeklyRate ?? null,
      p_snapshot_currency: (currency ?? "USD").toUpperCase().slice(0, 3),
      p_deposit_required_amount: depositAmount ?? 0,
      p_notes: input.notes ?? null,
      p_expires_at: input.expiresAt ?? null,
    }
  );

  if (!rpcError && rpcBooking) {
    rawBooking = rpcBooking;
  } else if (rpcError) {
    const code = (rpcError as { code?: string }).code;
    const msg = rpcError.message || "";
    if (code === "RB001" || code === "P0001" || msg.includes("CATEGORY_CAPACITY_EXCEEDED")) {
      return { error: "CATEGORY_CAPACITY_EXCEEDED" };
    }
    if (
      code === "RB002" ||
      code === "P0002" ||
      msg.includes("VEHICLE_MAINTENANCE_BLOCKED") ||
      code === "RB003" ||
      code === "P0003" ||
      msg.includes("VEHICLE_BOOKING_EXISTS") ||
      code === "23P01" ||
      msg.includes("exclusion_violation")
    ) {
      return { error: "VEHICLE_CONFLICT" };
    }
    if (code === "RB004" || msg.includes("TENANT_MISMATCH")) {
      return { error: "TENANT_MISMATCH", message: msg };
    }
    if (code === "RB005" || msg.includes("CATEGORY_MISMATCH")) {
      return { error: "CATEGORY_MISMATCH", message: msg };
    }
    if (code === "RB006" || msg.includes("VEHICLE_INVALID")) {
      return { error: "VEHICLE_INVALID", message: msg };
    }
    if (isMissingTableError(rpcError)) {
      return { error: "TABLE_NOT_FOUND", message: "Migration 225 required." };
    }

    // No fallback insert: create_rental_booking is required (the old fallback had no abuse cap).
    return { error: "DB_ERROR", message: msg };
  }

  const booking = normalizeBookingRow(rawBooking as Record<string, unknown>);

  // Check allocation mode — trigger auto-allocation if configured
  try {
    const { data: bizData } = await adminSupabase
      .from("businesses")
      .select("rental_allocation_mode")
      .eq("id", input.businessId)
      .single();

    if (bizData?.rental_allocation_mode === "auto_on_booking" && !booking.vehicle_id) {
      const { autoAllocateVehicle } = await import("@/lib/rental/allocation");
      await autoAllocateVehicle(booking.id, input.organizerId, {
        categoryId: input.categoryId,
        businessId: input.businessId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        pickupBranchId: input.pickupBranchId ?? null,
      });
    }
  } catch {
    // Auto-allocation failure does NOT block booking creation
  }

  revalidatePath(`/dashboard/org/${input.organizerId}/rentals`);

  // If office booking and payment collected now, confirm and record payment if possible
  if (input.source === "office" && input.collectPaymentNow) {
    try {
      const adminSupabase2 = createSupabaseAdmin();
      // Try to confirm
      try {
        await adminSupabase2.rpc("confirm_rental_booking", {
          p_booking_id: booking.id,
          p_organizer_id: input.organizerId,
          p_actor_id: null,
        });
      } catch {}
      // Try to record payment / pickup
      const amt = Number(input.amountReceived) || 0;
      try {
        await adminSupabase2.rpc("record_rental_balance_and_pickup", {
          p_booking_id: booking.id,
          p_organizer_id: input.organizerId,
          p_actor_id: null,
          p_method: input.paymentMethod ?? "cash",
          p_amount: amt,
          p_currency: booking.snapshot_currency ?? "USD",
          p_override_reason: null,
          p_notes: null,
        });
      } catch {}
    } catch {
      // Best effort
    }
    // Refresh booking
    try {
      const { data: fresh } = await adminSupabase
        .from("rental_bookings")
        .select("*")
        .eq("id", booking.id)
        .eq("organizer_id", input.organizerId)
        .single();
      if (fresh) {
        revalidatePath(`/dashboard/org/${input.organizerId}/rentals`);
        return { booking: normalizeBookingRow(fresh) };
      }
    } catch {}
  }

  return { booking };
}

// ---------------------------------------------------------------------------
// updateBookingStatus
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  awaiting_payment: ["cancelled"],
  confirmed: ["active", "cancelled", "no_show"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  expired: [],
  no_show: [],
};

export async function updateBookingStatus(
  bookingId: string,
  organizerId: string,
  newStatus: RentalBookingRow["status"],
  overrideReason?: string,
  payment?: { method: string; amount: number; currency: string },
  reason?: string
): Promise<{ success: boolean; booking?: RentalBookingRow; error?: string; code?: string; netPaid?: number; closedSessionIds?: string[] }> {
  let user: { id: string } | null = null;
  try {
    user = await verifyAuth(organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const admin = createSupabaseAdmin();

  // Fetch current booking (needs vehicle_id + starts_at for pickup guard)
  const { data: existing, error: fetchErr } = await admin
    .from("rental_bookings")
    .select("status, vehicle_id, starts_at, notes")
    .eq("id", bookingId)
    .eq("organizer_id", organizerId)
    .single();

  if (fetchErr) {
    if (isMissingTableError(fetchErr)) return { success: false, error: "Migration 225 required." };
    return { success: false, error: fetchErr.message };
  }
  if (!existing) return { success: false, error: "Booking not found." };

  const currentStatus = (existing as { status: string; vehicle_id: string | null; starts_at: string; notes: string | null }).status;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Transition from '${currentStatus}' to '${newStatus}' is not allowed.`,
    };
  }

  if (currentStatus === "pending" && newStatus === "confirmed") {
    const { error: rpcErr } = await admin.rpc("confirm_rental_booking", {
      p_booking_id: bookingId,
      p_organizer_id: organizerId,
      p_actor_id: user.id,
    });
    if (rpcErr) {
      return { success: false, code: rpcErr.code, error: rpcErr.message.replace(/^[A-Z_]+:\s*/, "") };
    }
    {
      const { sendRentalEmail } = await import("@/lib/rental/emails");
      await sendRentalEmail("confirmed", bookingId);
    }
    const { data: fresh } = await admin.from("rental_bookings").select("*")
      .eq("id", bookingId).eq("organizer_id", organizerId).single();
    revalidatePath(`/dashboard/org/${organizerId}/rentals`);
    return { success: true, booking: normalizeBookingRow(fresh) };
  }

  // ---------------------------------------------------------------------------
  // Pickup with payment: payment, vehicle, 4h rule and event log are enforced in the DB (migration 229)
  if (currentStatus === "confirmed" && newStatus === "active") {
    const { error: rpcErr } = await admin.rpc("record_rental_balance_and_pickup", {
      p_booking_id: bookingId,
      p_organizer_id: organizerId,
      p_actor_id: user.id,
      p_method: payment?.method ?? null,
      p_amount: payment?.amount ?? 0,
      p_currency: payment?.currency ?? null,
      p_override_reason: overrideReason ?? null,
      p_notes: null,
    });
    if (rpcErr) {
      const prefix = rpcErr.message.match(/^([A-Z_]+):/)?.[1];
      return { success: false, code: prefix ?? rpcErr.code, error: rpcErr.message.replace(/^[A-Z_]+:\s*/, "") };
    }
    const { data: fresh } = await admin.from("rental_bookings").select("*")
      .eq("id", bookingId).eq("organizer_id", organizerId).single();
    revalidatePath(`/dashboard/org/${organizerId}/rentals`);
    return { success: true, booking: normalizeBookingRow(fresh) };
  }

  // ---------------------------------------------------------------------------
  // Cancel, decline, no-show, return: rules, events and checkout cleanup run in the DB (migration 230)
  // ---------------------------------------------------------------------------
  const cause =
    newStatus === "completed" ? "return"
    : newStatus === "no_show" ? "no_show"
    : newStatus === "cancelled" ? (currentStatus === "pending" ? "decline" : "cancel")
    : null;
  if (!cause) {
    return { success: false, error: `Transition from '${currentStatus}' to '${newStatus}' is not supported.` };
  }

  const { data: trData, error: trErr } = await admin.rpc("transition_rental_booking", {
    p_booking_id: bookingId,
    p_organizer_id: organizerId,
    p_actor_id: user.id,
    p_cause: cause,
    p_reason: reason ?? null,
  });
  if (trErr) {
    const prefix = trErr.message.match(/^([A-Z_]+):/)?.[1];
    return { success: false, code: prefix ?? trErr.code, error: trErr.message.replace(/^[A-Z_]+:\s*/, "") };
  }
  const trRow = (Array.isArray(trData) ? trData[0] : trData) as { out_net_paid?: number | string; out_open_session_ids?: string[] } | null;
  if (cause === "decline" || cause === "cancel") {
    const { sendRentalEmail } = await import("@/lib/rental/emails");
    await sendRentalEmail(cause === "decline" ? "declined" : "cancelled", bookingId);
  }
  // Close the matching Stripe Checkout sessions so a cancelled booking can no longer be paid
  if (trRow?.out_open_session_ids?.length) {
    const { expireStripeSessions } = await import("@/lib/rental/checkout");
    await expireStripeSessions(trRow.out_open_session_ids);
  }

  const { data: fresh } = await admin.from("rental_bookings").select("*")
    .eq("id", bookingId).eq("organizer_id", organizerId).single();
  revalidatePath(`/dashboard/org/${organizerId}/rentals`);
  return {
    success: true,
    booking: normalizeBookingRow(fresh),
    netPaid: Number(trRow?.out_net_paid ?? 0),
    closedSessionIds: trRow?.out_open_session_ids ?? [],
  };
}

// ---------------------------------------------------------------------------
// assignVehicleToBooking
// ---------------------------------------------------------------------------

export async function assignVehicleToBooking(
  bookingId: string,
  organizerId: string,
  vehicleId: string
): Promise<
  | { success: true; booking: RentalBookingRow }
  | { success: false; error: string | "VEHICLE_CONFLICT" }
> {
  try {
    await verifyAuth(organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const admin = createSupabaseAdmin();

  // Clear expired holds first so they do not block this vehicle (migration 229)
  const { data: catRow } = await admin
    .from("rental_bookings")
    .select("category_id")
    .eq("id", bookingId)
    .eq("organizer_id", organizerId)
    .single();
  if (catRow?.category_id) {
    const { error: expErr } = await admin.rpc("expire_rental_bookings", {
      p_category_id: catRow.category_id,
    });
    if (expErr) console.error("expire_rental_bookings failed:", expErr.message);
  }

  const { data, error } = await admin
    .from("rental_bookings")
    .update({
      vehicle_id: vehicleId,
      assigned_by: "manual",
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("organizer_id", organizerId)
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return { success: false, error: "Migration 225 required." };
    }
    const errCode = (error as { code?: string }).code;
    const errMsg = error.message || "";
    if (
      errCode === "23P01" ||
      errCode === "RB002" ||
      errMsg.includes("VEHICLE_MAINTENANCE_BLOCKED") ||
      errMsg.includes("exclusion_violation")
    ) {
      return { success: false, error: "VEHICLE_CONFLICT" };
    }
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${organizerId}/rentals`);
  return { success: true, booking: normalizeBookingRow(data) };
}

// ---------------------------------------------------------------------------
// cancelRentalBooking
// ---------------------------------------------------------------------------

export async function cancelRentalBooking(
  bookingId: string,
  organizerId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const result = await updateBookingStatus(bookingId, organizerId, "cancelled", undefined, undefined, reason);
  return { success: result.success, error: result.error };
}

// ---------------------------------------------------------------------------
// recordDeposit
// ---------------------------------------------------------------------------

export async function recordCounterPayment(
  bookingId: string,
  organizerId: string,
  input: { method: "cash" | "card_terminal" | "mobile_money"; amount: number }
): Promise<
  | { success: true; paymentStatus: string | null; bookingStatus: string | null }
  | { success: false; error: string }
> {
  try {
    await verifyAuth(organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Enter an amount greater than zero." };
  }
  const dbMethod = input.method === "card_terminal" ? "card_offline" : input.method;
  const admin = createSupabaseAdmin();
  const { data: booking, error: bookingErr } = await admin
    .from("rental_bookings")
    .select("id, status, rental_amount, snapshot_currency")
    .eq("id", bookingId)
    .eq("organizer_id", organizerId)
    .single();
  if (bookingErr || !booking) return { success: false, error: "Booking not found." };
  if (booking.status === "pending") {
    const { error: confirmErr } = await admin.rpc("confirm_rental_booking", {
      p_booking_id: bookingId,
      p_organizer_id: organizerId,
      p_actor_id: null,
    });
    if (confirmErr) return { success: false, error: "Could not confirm the booking: " + confirmErr.message };
  }
  const rentalAmount = Number(booking.rental_amount) || 0;
  const kind = amount >= rentalAmount ? "rental_charge" : "advance";
  const { data, error } = await admin.rpc("record_rental_payment", {
    p_booking_id: bookingId,
    p_organizer_id: organizerId,
    p_kind: kind,
    p_method: dbMethod,
    p_amount: amount,
    p_currency: String(booking.snapshot_currency || "USD"),
    p_direction: "credit",
    p_recorded_by: null,
    p_notes: "Counter payment (office booking)",
  });
  if (error) {
    const raw = String(error.message || "Payment failed");
    const i = raw.indexOf(": ");
    return { success: false, error: i > 0 && i < 40 ? raw.slice(i + 2) : raw };
  }
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/dashboard/org/" + organizerId + "/rentals");
  return {
    success: true,
    paymentStatus: row?.out_payment_status ?? null,
    bookingStatus: row?.out_booking_status ?? null,
  };
}

export async function recordDeposit(
  bookingId: string,
  organizerId: string,
  input: RecordDepositInput
): Promise<{ success: boolean; booking?: RentalBookingRow; error?: string }> {
  try {
    await verifyAuth(organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const admin = createSupabaseAdmin();

  const collectedAmount = input.collectedAmount ?? input.amount ?? 0;
  const depositStatus =
    input.depositStatus ??
    (input.paid ? "collected_offline" : "pending_collection");

  // Deposit is NEVER revenue: only deposit_* fields are updated
  const { data, error } = await admin
    .from("rental_bookings")
    .update({
      deposit_collected_amount: collectedAmount,
      deposit_retained_amount: input.retainedAmount ?? 0,
      deposit_status: depositStatus,
      deposit_retention_reason: input.retentionReason ?? null,
      deposit_retention_authorized_by: input.retentionAuthorizedBy ?? null,
      deposit_notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("organizer_id", organizerId)
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error)) return { success: false, error: "Migration 225 required." };
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${organizerId}/rentals`);
  return { success: true, booking: normalizeBookingRow(data) };
}

// ---------------------------------------------------------------------------
// createMaintenanceBlock
// ---------------------------------------------------------------------------

export async function createMaintenanceBlock(
  input: CreateMaintenanceBlockInput
): Promise<
  | { success: true; block: { id: string; vehicle_id: string; starts_at: string; ends_at: string; reason: string; notes: string | null } }
  | { success: false; error: string }
> {
  try {
    await verifyAuth(input.organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return { success: false, error: "Invalid block dates." };
  }

  const admin = createSupabaseAdmin();

  const { data, error } = await admin
    .from("rental_blocks")
    .insert({
      organizer_id: input.organizerId,
      business_id: input.businessId,
      vehicle_id: input.vehicleId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      reason: input.reason ?? "maintenance",
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("id, vehicle_id, starts_at, ends_at, reason, notes")
    .single();

  if (error) {
    if (isMissingTableError(error)) return { success: false, error: "Migration 225 required." };
    const blkCode = (error as { code?: string }).code;
    const blkMsg = error.message || "";
    if (blkCode === "23P01") {
      return { success: false, error: "Vehicle already has an overlapping block." };
    }
    if (blkCode === "RB003" || blkMsg.includes("VEHICLE_BOOKING_EXISTS")) {
      return { success: false, error: "Vehicle already has an active booking during the requested block period." };
    }
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${input.organizerId}/rentals`);
  return { success: true, block: data as { id: string; vehicle_id: string; starts_at: string; ends_at: string; reason: string; notes: string | null } };
}

// ---------------------------------------------------------------------------
// deleteMaintenanceBlock
// ---------------------------------------------------------------------------

export async function deleteMaintenanceBlock(
  blockId: string,
  organizerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await verifyAuth(organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("rental_blocks")
    .delete()
    .eq("id", blockId)
    .eq("organizer_id", organizerId);

  if (error) {
    if (isMissingTableError(error)) return { success: false, error: "Migration 225 required." };
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${organizerId}/rentals`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// listRentalBookings
// ---------------------------------------------------------------------------

export async function listRentalBookings(
  organizerId: string,
  options?: ListRentalBookingsOptions
): Promise<{
  success: boolean;
  data: RentalBookingRow[];
  total: number;
  migrated: boolean;
  error?: string;
}> {
  try {
    await verifyAuth(organizerId, VIEW_ROLES);
  } catch (err) {
    return {
      success: false,
      data: [],
      total: 0,
      migrated: true,
      error: err instanceof Error ? err.message : "Unauthorized",
    };
  }

  const admin = createSupabaseAdmin();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = admin
    .from("rental_bookings")
    .select("*", { count: "exact" })
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.businessId) query = query.eq("business_id", options.businessId);
  if (options?.vehicleId) query = query.eq("vehicle_id", options.vehicleId);
  if (options?.categoryId) query = query.eq("category_id", options.categoryId);
  if (options?.fromDate) query = query.gte("starts_at", options.fromDate);
  if (options?.toDate) query = query.lte("ends_at", options.toDate);
  if (options?.status) {
    if (Array.isArray(options.status)) {
      query = query.in("status", options.status);
    } else {
      query = query.eq("status", options.status);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return { success: true, data: [], total: 0, migrated: false };
    }
    return { success: false, data: [], total: 0, migrated: true, error: error.message };
  }

  return {
    success: true,
    data: (data || []).map(normalizeBookingRow),
    total: count ?? 0,
    migrated: true,
  };
}

// ---------------------------------------------------------------------------
// getRentalBooking
// ---------------------------------------------------------------------------

// Unpaid balance = rental_amount minus net applied payments (same formula as migration 230)
export async function getRentalBookingBalance(
  bookingId: string,
  organizerId: string
): Promise<{ success: boolean; netPaid?: number; unpaid?: number; currency?: string; error?: string }> {
  try {
    await verifyAuth(organizerId, VIEW_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }
  const admin = createSupabaseAdmin();
  const { data: b, error: bErr } = await admin
    .from("rental_bookings")
    .select("rental_amount, snapshot_currency")
    .eq("id", bookingId)
    .eq("organizer_id", organizerId)
    .single();
  if (bErr || !b) return { success: false, error: bErr?.message ?? "Booking not found." };
  const { data: pays, error: pErr } = await admin
    .from("rental_payments")
    .select("amount, direction, applied, kind")
    .eq("booking_id", bookingId);
  if (pErr) return { success: false, error: pErr.message };
  let netPaid = 0;
  for (const r of pays ?? []) {
    if (!r.applied) continue;
    const amt = Number(r.amount) || 0;
    if (r.direction === "credit" && ["rental_charge", "advance", "balance"].includes(r.kind)) netPaid += amt;
    if (r.direction === "debit" && r.kind === "refund") netPaid -= amt;
  }
  const rentalAmount = Number((b as { rental_amount: number }).rental_amount) || 0;
  return {
    success: true,
    netPaid,
    unpaid: Math.max(0, Math.round((rentalAmount - netPaid) * 100) / 100),
    currency: (b as { snapshot_currency: string }).snapshot_currency,
  };
}

export async function getRentalBooking(
  bookingId: string,
  organizerId: string
): Promise<{ success: boolean; data?: RentalBookingRow; migrated?: boolean; error?: string }> {
  try {
    await verifyAuth(organizerId, VIEW_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("rental_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("organizer_id", organizerId)
    .single();

  if (error) {
    if (isMissingTableError(error)) return { success: true, migrated: false };
    return { success: false, error: error.message };
  }

  return { success: true, data: normalizeBookingRow(data), migrated: true };
}

// ---------------------------------------------------------------------------
// getRentalBookingByToken (public — no auth required, uses SECURITY DEFINER fn)
// ---------------------------------------------------------------------------

export async function getRentalBookingByToken(lookupToken: string): Promise<{
  success: boolean;
  data?: {
    booking_number: string;
    status: string;
    starts_at: string;
    ends_at: string;
    rental_amount: number;
    snapshot_currency: string;
    payment_status: string;
    deposit_required_amount: number;
    deposit_status: string;
    customer_name: string;
    pickup_branch_id: string | null;
    return_branch_id: string | null;
    // Business & branch context (Task 5)
    business_name: string | null;
    business_slug: string | null;
    pickup_branch_label: string | null;
    pickup_branch_address: string | null;
    pickup_branch_phone: string | null;
    return_branch_label: string | null;
    return_branch_address: string | null;
  };
  migrated?: boolean;
  error?: string;
}> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("get_public_rental_booking", {
    p_token: lookupToken,
  });

  if (error) {
    if (isMissingTableError(error)) return { success: true, migrated: false };
    return { success: false, error: error.message };
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return { success: false, error: "Booking not found." };
  }

  const row = Array.isArray(data) ? data[0] : data;

  // Enrich with business name and branch details (phone, address) via secondary queries.
  // These are non-critical — failures are silently swallowed.
  let businessName: string | null = null;
  let businessSlug: string | null = null;
  let pickupBranchLabel: string | null = null;
  let pickupBranchAddress: string | null = null;
  let pickupBranchPhone: string | null = null;
  let returnBranchLabel: string | null = null;
  let returnBranchAddress: string | null = null;

  try {
    // Load the full booking row to get business_id + organizer_id
    const { data: bookingRow } = await admin
      .from("rental_bookings")
      .select("business_id, organizer_id, pickup_branch_id, return_branch_id")
      .eq("lookup_token", lookupToken)
      .single();

    if (bookingRow) {
      if (bookingRow.business_id) {
        const { data: b } = await admin
          .from("businesses")
          .select("name, organizer_id")
          .eq("id", bookingRow.business_id)
          .single();
        if (b) {
          businessName = (b as { name: string }).name;
          const bizOrganizerId = (b as { organizer_id?: string | null }).organizer_id;
          if (bizOrganizerId) {
            const { data: site } = await admin
              .from("tenant_websites")
              .select("slug")
              .eq("tenant_id", bizOrganizerId)
              .maybeSingle();
            if (site && (site as { slug?: string | null }).slug) {
              businessSlug = (site as { slug: string }).slug;
            }
          } else if (bookingRow.organizer_id) {
            const { data: site } = await admin
              .from("tenant_websites")
              .select("slug")
              .eq("tenant_id", bookingRow.organizer_id)
              .maybeSingle();
            if (site && (site as { slug?: string | null }).slug) {
              businessSlug = (site as { slug: string }).slug;
            }
          }
        } else if (bookingRow.organizer_id) {
          const { data: site } = await admin
            .from("tenant_websites")
            .select("slug")
            .eq("tenant_id", bookingRow.organizer_id)
            .maybeSingle();
          if (site && (site as { slug?: string | null }).slug) {
            businessSlug = (site as { slug: string }).slug;
          }
        }
      } else if (bookingRow.organizer_id) {
        const { data: site } = await admin
          .from("tenant_websites")
          .select("slug")
          .eq("tenant_id", bookingRow.organizer_id)
          .maybeSingle();
        if (site && (site as { slug?: string | null }).slug) {
          businessSlug = (site as { slug: string }).slug;
        }
      }

      const branchIds = [bookingRow.pickup_branch_id, bookingRow.return_branch_id].filter(Boolean) as string[];
      if (branchIds.length > 0) {
        const { data: branches } = await admin
          .from("business_branches")
          .select("id, label, address, phone")
          .in("id", branchIds);
        if (branches) {
          for (const br of branches as { id: string; label: string; address: string | null; phone: string | null }[]) {
            if (br.id === bookingRow.pickup_branch_id) {
              pickupBranchLabel = br.label;
              pickupBranchAddress = br.address;
              pickupBranchPhone = br.phone;
            }
            if (br.id === bookingRow.return_branch_id) {
              returnBranchLabel = br.label;
              returnBranchAddress = br.address;
            }
          }
        }
      }
    }
  } catch {
    // Enrichment failure does not block the main response
  }

  return {
    success: true,
    migrated: true,
    data: {
      booking_number: row.booking_number,
      status: row.status,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      rental_amount: Number(row.rental_amount),
      snapshot_currency: row.snapshot_currency,
      payment_status: row.payment_status,
      deposit_required_amount: Number(row.deposit_required_amount),
      deposit_status: row.deposit_status,
      customer_name: row.customer_name,
      pickup_branch_id: row.pickup_branch_id ?? null,
      return_branch_id: row.return_branch_id ?? null,
      business_name: businessName,
      business_slug: businessSlug,
      pickup_branch_label: pickupBranchLabel,
      pickup_branch_address: pickupBranchAddress,
      pickup_branch_phone: pickupBranchPhone,
      return_branch_label: returnBranchLabel,
      return_branch_address: returnBranchAddress,
    },
  };
}

// ---------------------------------------------------------------------------
// reconcileExpiredBookings
// ---------------------------------------------------------------------------

export async function reconcileExpiredBookings(
  organizerId: string
): Promise<{ success: boolean; expiredCount: number; error?: string }> {
  try {
    await verifyAuth(organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, expiredCount: 0, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const admin = createSupabaseAdmin();
  // Categories of this organizer that still have an open hold; expire each via the DB function
  const { data: openRows, error } = await admin
    .from("rental_bookings")
    .select("category_id")
    .eq("organizer_id", organizerId)
    .in("status", ["pending", "awaiting_payment"]);

  if (error) {
    if (isMissingTableError(error)) return { success: true, expiredCount: 0 };
    return { success: false, expiredCount: 0, error: error.message };
  }

  const categoryIds = Array.from(
    new Set((openRows || []).map((r: { category_id: string }) => r.category_id).filter(Boolean))
  );
  let expiredCount = 0;
  for (const categoryId of categoryIds) {
    const { data: expired, error: expErr } = await admin.rpc("expire_rental_bookings", {
      p_category_id: categoryId,
    });
    if (expErr) return { success: false, expiredCount, error: expErr.message };
    expiredCount += typeof expired === "number" ? expired : Array.isArray(expired) ? expired.length : 0;
  }
  if (expiredCount > 0) {
    revalidatePath(`/dashboard/org/${organizerId}/rentals`);
  }

  return { success: true, expiredCount };
}

// ---------------------------------------------------------------------------
// listMaintenanceBlocks
// ---------------------------------------------------------------------------

export async function listMaintenanceBlocks(
  vehicleId: string,
  organizerId: string
): Promise<{
  success: boolean;
  data: Array<{
    id: string;
    vehicle_id: string;
    starts_at: string;
    ends_at: string;
    reason: string;
    notes: string | null;
    created_at: string;
  }>;
  migrated: boolean;
  error?: string;
}> {
  try {
    await verifyAuth(organizerId, VIEW_ROLES);
  } catch (err) {
    return {
      success: false,
      data: [],
      migrated: true,
      error: err instanceof Error ? err.message : "Unauthorized",
    };
  }

  const admin = createSupabaseAdmin();

  const { data, error } = await admin
    .from("rental_blocks")
    .select("id, vehicle_id, starts_at, ends_at, reason, notes, created_at")
    .eq("vehicle_id", vehicleId)
    .eq("organizer_id", organizerId)
    .order("starts_at", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) return { success: true, data: [], migrated: false };
    return { success: false, data: [], migrated: true, error: error.message };
  }

  return { success: true, data: data || [], migrated: true };
}

// ---------------------------------------------------------------------------
// Private: row normalizer
// ---------------------------------------------------------------------------

function normalizeBookingRow(row: Record<string, unknown>): RentalBookingRow {
  return {
    id: String(row.id),
    lookup_token: String(row.lookup_token),
    booking_number: String(row.booking_number),
    organizer_id: String(row.organizer_id),
    business_id: String(row.business_id),
    category_id: String(row.category_id),
    vehicle_id: row.vehicle_id != null ? String(row.vehicle_id) : null,
    assigned_by: row.assigned_by != null ? String(row.assigned_by) : null,
    assigned_at: row.assigned_at != null ? String(row.assigned_at) : null,
    source: (row.source as "online" | "office") ?? "office",
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
    expires_at: row.expires_at != null ? String(row.expires_at) : null,
    booking_period: row.booking_period != null ? String(row.booking_period) : null,
    pickup_branch_id: row.pickup_branch_id != null ? String(row.pickup_branch_id) : null,
    return_branch_id: row.return_branch_id != null ? String(row.return_branch_id) : null,
    customer_name: String(row.customer_name),
    customer_email: String(row.customer_email),
    customer_phone: row.customer_phone != null ? String(row.customer_phone) : null,
    driver_license_number: row.driver_license_number != null ? String(row.driver_license_number) : null,
    driver_license_country: row.driver_license_country != null ? String(row.driver_license_country) : null,
    driver_dob: row.driver_dob != null ? String(row.driver_dob) : null,
    status: row.status as RentalBookingRow["status"],
    rental_amount: Number(row.rental_amount) || 0,
    snapshot_daily_rate: Number(row.snapshot_daily_rate) || 0,
    snapshot_weekly_rate: row.snapshot_weekly_rate != null ? Number(row.snapshot_weekly_rate) : null,
    snapshot_currency: String(row.snapshot_currency ?? "USD"),
    payment_status: row.payment_status as RentalBookingRow["payment_status"],
    deposit_required_amount: Number(row.deposit_required_amount) || 0,
    deposit_collected_amount: Number(row.deposit_collected_amount) || 0,
    deposit_retained_amount: Number(row.deposit_retained_amount) || 0,
    deposit_status: row.deposit_status as RentalBookingRow["deposit_status"],
    deposit_retention_reason: row.deposit_retention_reason != null ? String(row.deposit_retention_reason) : null,
    deposit_retention_authorized_by: row.deposit_retention_authorized_by != null ? String(row.deposit_retention_authorized_by) : null,
    deposit_notes: row.deposit_notes != null ? String(row.deposit_notes) : null,
    late_fee_amount: Number(row.late_fee_amount) || 0,
    late_fee_status: row.late_fee_status as RentalBookingRow["late_fee_status"],
    late_fee_notes: row.late_fee_notes != null ? String(row.late_fee_notes) : null,
    picked_up_at: row.picked_up_at != null ? String(row.picked_up_at) : null,
    returned_at: row.returned_at != null ? String(row.returned_at) : null,
    start_mileage: row.start_mileage != null ? Number(row.start_mileage) : null,
    end_mileage: row.end_mileage != null ? Number(row.end_mileage) : null,
    is_overdue: Boolean(row.is_overdue),
    notes: row.notes != null ? String(row.notes) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
