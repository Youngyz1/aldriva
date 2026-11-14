"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { WRITE_ROLES, VIEW_ROLES, verifyAuth } from "@/lib/rental/auth";

export type HandoverPhoto = { key: string; file_name?: string; content_type?: string };

export type RentalInspectionRow = {
  id: string;
  booking_id: string;
  kind: "pickup" | "return";
  odometer: number | null;
  fuel_level: string | null;
  photos: HandoverPhoto[];
  damage_notes: string | null;
  customer_confirmed_name: string;
  customer_confirmed_at: string;
  created_by: string | null;
  created_at: string;
};

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "42P01" || code === "42703" || code === "42883") return true;
  const message = (err as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    (message.includes("does not exist") || message.includes("schema cache") || message.includes("Could not find the function"))
  );
}

function cleanDbMessage(msg: string): string {
  const i = msg.indexOf(": ");
  return i > 0 && i < 40 ? msg.slice(i + 2) : msg;
}

export async function getRentalInspections(
  bookingId: string,
  organizerId: string
): Promise<{ success: boolean; inspections: RentalInspectionRow[]; migrated: boolean; error?: string }> {
  try {
    await verifyAuth(organizerId, VIEW_ROLES);
  } catch (err) {
    return { success: false, inspections: [], migrated: true, error: err instanceof Error ? err.message : "Unauthorized" };
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("rental_inspections")
    .select("id, booking_id, kind, odometer, fuel_level, photos, damage_notes, customer_confirmed_name, customer_confirmed_at, created_by, created_at")
    .eq("booking_id", bookingId)
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) return { success: true, inspections: [], migrated: false };
    return { success: false, inspections: [], migrated: true, error: error.message };
  }
  const inspections = (data || []).map((r) => ({
    id: String(r.id),
    booking_id: String(r.booking_id),
    kind: r.kind as "pickup" | "return",
    odometer: r.odometer == null ? null : Number(r.odometer),
    fuel_level: r.fuel_level == null ? null : String(r.fuel_level),
    photos: Array.isArray(r.photos) ? (r.photos as HandoverPhoto[]) : [],
    damage_notes: r.damage_notes == null ? null : String(r.damage_notes),
    customer_confirmed_name: String(r.customer_confirmed_name),
    customer_confirmed_at: String(r.customer_confirmed_at),
    created_by: r.created_by == null ? null : String(r.created_by),
    created_at: String(r.created_at),
  }));
  return { success: true, inspections, migrated: true };
}

export interface PickupHandoverInput {
  odometer?: number | null;
  fuelLevel?: string | null;
  photos?: HandoverPhoto[];
  damageNotes?: string | null;
  customerConfirmedName: string;
  customerConfirmedAt: string; // ISO
  // optional balance-at-pickup payment (same as existing flow)
  payment?: { method: string; amount: number; currency: string } | null;
  overrideReason?: string | null;
  notes?: string | null;
}

export async function recordPickupHandover(
  bookingId: string,
  organizerId: string,
  input: PickupHandoverInput
): Promise<{ success: boolean; error?: string; code?: string }> {
  let user: { id: string } | null = null;
  try {
    user = await verifyAuth(organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin.rpc("record_rental_pickup_handover", {
    p_booking_id: bookingId,
    p_organizer_id: organizerId,
    p_actor_id: user.id,
    p_odometer: input.odometer ?? null,
    p_fuel_level: input.fuelLevel ?? null,
    p_photos: input.photos ?? [],
    p_damage_notes: input.damageNotes ?? null,
    p_customer_confirmed_name: input.customerConfirmedName,
    p_customer_confirmed_at: input.customerConfirmedAt,
    p_method: input.payment?.method ?? null,
    p_amount: input.payment?.amount ?? 0,
    p_currency: input.payment?.currency ?? null,
    p_override_reason: input.overrideReason ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) {
    if (isMissingTableError(error)) return { success: false, error: "Migration 233 required.", code: "MIGRATION_REQUIRED" };
    const prefix = error.message.match(/^([A-Z_]+):/)?.[1];
    const code = prefix ?? error.code;
    const friendly: Record<string, string> = {
      LATE_FEE_DECISION_REQUIRED: "A late fee is due. Choose to apply or waive it before completing return.",
      DEPOSIT_NOT_COLLECTED: "No deposit was recorded as collected, so it cannot be settled. Record the deposit in the Deposit panel first, or complete the return without settling.",
      DEPOSIT_ALREADY_SETTLED: "The deposit has already been settled for this booking.",
      DEPOSIT_REASON_REQUIRED: "A reason is required to retain part or all of the deposit.",
      INVALID_DEPOSIT_AMOUNT: "The retained deposit amount must be greater than 0 and not more than the collected amount.",
      INVALID_ODOMETER: "The return odometer reading is invalid. It must be non-negative and not less than the starting mileage.",
      INVALID_RETURN_TIME: "The actual return time is invalid. It cannot be in the future, before pickup, or more than 24 hours before now.",
    };
    const message = (code && friendly[code]) || cleanDbMessage(error.message);
    return { success: false, code, error: message };
  }
  revalidatePath(`/dashboard/org/${organizerId}/rentals`);
  revalidatePath(`/dashboard/org/${organizerId}/rentals/${bookingId}`);
  return { success: true };
}

export type DepositSettlementAction = "none" | "return_full" | "retain_partial" | "retain_full";
export type LateFeeAction = "none" | "apply" | "waive";

export interface ReturnHandoverInput {
  odometer?: number | null;
  fuelLevel?: string | null;
  photos?: HandoverPhoto[];
  damageNotes?: string | null;
  customerConfirmedName: string;
  customerConfirmedAt: string;
  depositAction: DepositSettlementAction;
  depositRetainedAmount?: number;
  depositReason?: string | null;
  lateFeeAction: LateFeeAction;
  lateFeeAmount?: number | null;
  lateFeeReason?: string | null;
  actualReturnAt?: string | null;
}

export async function recordReturnHandover(
  bookingId: string,
  organizerId: string,
  input: ReturnHandoverInput
): Promise<{ success: boolean; error?: string; code?: string }> {
  let user: { id: string } | null = null;
  try {
    user = await verifyAuth(organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin.rpc("record_rental_return_handover", {
    p_booking_id: bookingId,
    p_organizer_id: organizerId,
    p_actor_id: user.id,
    p_odometer: input.odometer ?? null,
    p_fuel_level: input.fuelLevel ?? null,
    p_photos: input.photos ?? [],
    p_damage_notes: input.damageNotes ?? null,
    p_customer_confirmed_name: input.customerConfirmedName,
    p_customer_confirmed_at: input.customerConfirmedAt,
    p_deposit_action: input.depositAction,
    p_deposit_retained_amount: input.depositRetainedAmount ?? 0,
    p_deposit_reason: input.depositReason ?? null,
    p_late_fee_action: input.lateFeeAction,
    p_late_fee_amount: input.lateFeeAmount ?? null,
    p_late_fee_reason: input.lateFeeReason ?? null,
    p_actual_return_at: input.actualReturnAt ?? null,
  });
  if (error) {
    if (isMissingTableError(error)) return { success: false, error: "Migration 233 required.", code: "MIGRATION_REQUIRED" };
    const prefix = error.message.match(/^([A-Z_]+):/)?.[1];
    const code = prefix ?? error.code;
    const friendly: Record<string, string> = {
      LATE_FEE_DECISION_REQUIRED: "A late fee is due. Choose to apply or waive it before completing return.",
      DEPOSIT_NOT_COLLECTED: "No deposit was recorded as collected, so it cannot be settled. Record the deposit in the Deposit panel first, or complete the return without settling.",
      DEPOSIT_ALREADY_SETTLED: "The deposit has already been settled for this booking.",
      DEPOSIT_REASON_REQUIRED: "A reason is required to retain part or all of the deposit.",
      INVALID_DEPOSIT_AMOUNT: "The retained deposit amount must be greater than 0 and not more than the collected amount.",
      INVALID_ODOMETER: "The return odometer reading is invalid. It must be non-negative and not less than the starting mileage.",
      INVALID_RETURN_TIME: "The actual return time is invalid. It cannot be in the future, before pickup, or more than 24 hours before now.",
    };
    const message = (code && friendly[code]) || cleanDbMessage(error.message);
    return { success: false, code, error: message };
  }
  revalidatePath(`/dashboard/org/${organizerId}/rentals`);
  revalidatePath(`/dashboard/org/${organizerId}/rentals/${bookingId}`);
  return { success: true };
}

export async function calculateLateFeeQuote(
  bookingId: string,
  organizerId: string,
  actualReturnAt: string
): Promise<{
  success: boolean;
  calculatedFee?: number;
  overdueMinutes?: number;
  overdueDays?: number;
  graceMinutes?: number;
  feePerDay?: number;
  currency?: string;
  migrated?: boolean;
  error?: string;
}> {
  try {
    await verifyAuth(organizerId, VIEW_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }
  const admin = createSupabaseAdmin();
  const { data: booking, error: bErr } = await admin
    .from("rental_bookings")
    .select("ends_at, business_id, snapshot_currency")
    .eq("id", bookingId)
    .eq("organizer_id", organizerId)
    .single();
  if (bErr || !booking) return { success: false, error: bErr?.message ?? "Booking not found." };
  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("rental_late_fee_grace_minutes, rental_late_fee_per_day")
    .eq("id", (booking as { business_id: string }).business_id)
    .single();
  if (bizErr) {
    if (isMissingTableError(bizErr)) return { success: true, migrated: false, calculatedFee: 0, overdueMinutes: 0, overdueDays: 0, graceMinutes: 60, feePerDay: 0, currency: String((booking as { snapshot_currency?: string }).snapshot_currency ?? "USD") };
    return { success: false, error: bizErr.message };
  }
  const grace = Number((biz as { rental_late_fee_grace_minutes?: number }).rental_late_fee_grace_minutes ?? 60);
  const feePerDay = Number((biz as { rental_late_fee_per_day?: number }).rental_late_fee_per_day ?? 0);
  const { data: calc, error: cErr } = await admin.rpc("calculate_rental_late_fee", {
    p_scheduled_end: (booking as { ends_at: string }).ends_at,
    p_actual_return: actualReturnAt,
    p_grace_minutes: grace,
    p_fee_per_day: feePerDay,
  });
  if (cErr) {
    if (isMissingTableError(cErr)) return { success: true, migrated: false, calculatedFee: 0, overdueMinutes: 0, overdueDays: 0, graceMinutes: grace, feePerDay, currency: String((booking as { snapshot_currency?: string }).snapshot_currency ?? "USD") };
    return { success: false, error: cErr.message };
  }
  const row = Array.isArray(calc) ? calc[0] : calc;
  return {
    success: true,
    migrated: true,
    calculatedFee: Number(row?.out_fee_amount ?? 0),
    overdueMinutes: Number(row?.out_overdue_minutes ?? 0),
    overdueDays: Number(row?.out_overdue_days ?? 0),
    graceMinutes: grace,
    feePerDay,
    currency: String((booking as { snapshot_currency?: string }).snapshot_currency ?? "USD"),
  };
}

/** Public (token-gated) inspection read for customer lookup page - no auth, uses service role carefully. */
export async function getPublicRentalInspectionsByToken(lookupToken: string): Promise<{
  pickup: RentalInspectionRow | null;
  returned: RentalInspectionRow | null;
}> {
  const admin = createSupabaseAdmin();
  const { data: booking } = await admin
    .from("rental_bookings")
    .select("id, organizer_id")
    .eq("lookup_token", lookupToken)
    .maybeSingle();
  if (!booking) return { pickup: null, returned: null };
  const { data } = await admin
    .from("rental_inspections")
    .select("id, booking_id, kind, odometer, fuel_level, photos, damage_notes, customer_confirmed_name, customer_confirmed_at, created_by, created_at")
    .eq("booking_id", (booking as { id: string }).id)
    .eq("organizer_id", (booking as { organizer_id: string }).organizer_id);
  const rows = (data || []).map((r) => ({
    id: String(r.id),
    booking_id: String(r.booking_id),
    kind: r.kind as "pickup" | "return",
    odometer: r.odometer == null ? null : Number(r.odometer),
    fuel_level: r.fuel_level == null ? null : String(r.fuel_level),
    photos: Array.isArray(r.photos) ? (r.photos as HandoverPhoto[]) : [],
    damage_notes: r.damage_notes == null ? null : String(r.damage_notes),
    customer_confirmed_name: String(r.customer_confirmed_name),
    customer_confirmed_at: String(r.customer_confirmed_at),
    created_by: r.created_by == null ? null : String(r.created_by),
    created_at: String(r.created_at),
  }));
  return {
    pickup: rows.find((r) => r.kind === "pickup") ?? null,
    returned: rows.find((r) => r.kind === "return") ?? null,
  };
}