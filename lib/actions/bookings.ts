"use server";

/**
 * lib/actions/bookings.ts
 *
 * Owner actions for general (service-business) bookings: the
 * booking_type='appointment' rows in public.reservations. Table reservations
 * (booking_type='table') are a separate feature and are never touched here —
 * see lib/actions/reservations.ts, which this file does not import or edit.
 *
 * Every query and update is double-scoped: organizer_id (tenant isolation)
 * AND booking_type='appointment' (feature isolation), so an action here can
 * never read or mutate a restaurant's table reservation row.
 */

import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import {
  extractReservationSettings,
  validateReservationSettings,
} from "@/lib/reservation-settings";
import { saveReservationSettingsWithClient, type SaveReservationSettingsResult } from "@/lib/actions/reservations";

const MANAGE_ROLES: EntityRole[] = ["owner", "admin", "manager"];
const BOOKING_TYPE = "appointment" as const;

const BOOKING_TRANSITION_GRAPH: Record<string, string[]> = {
  pending: ["confirmed", "declined", "cancelled"],
  confirmed: ["completed", "cancelled", "no_show"],
  declined: [],
  completed: [],
  no_show: [],
  cancelled: [],
};

type BookingsAdminClient = ReturnType<typeof createSupabaseAdmin>;

async function requireManageAccess(
  organizerId: string
): Promise<{ ok: true; userId: string } | { ok: false; result: BookingActionResult }> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, result: { success: false, error: "unauthorized", message: "You must be signed in." } };
  }
  const access = await checkTenantAccess(user.id, organizerId, MANAGE_ROLES);
  if (!access.hasAccess) {
    return {
      ok: false,
      result: { success: false, error: "forbidden", message: "Only owners, admins, and managers can manage bookings." },
    };
  }
  return { ok: true, userId: user.id };
}

// ── Accept online bookings switch ───────────────────────────────────────────
// Reuses the exact same storage and write path as table reservations
// (tenant_websites.metadata.storefront.reservations.enabled, written via
// lib/actions/reservations.ts's saveReservationSettingsWithClient) — the two
// features intentionally share one settings object. Only the `enabled` flag
// changes; every other field is carried through unchanged.

export async function setBookingsEnabled(
  organizerId: string,
  websiteId: string,
  enabled: boolean
): Promise<SaveReservationSettingsResult> {
  const access = await requireManageAccess(organizerId);
  if (!access.ok) return access.result as SaveReservationSettingsResult;
  const admin = createSupabaseAdmin();
  return setBookingsEnabledWithClient(organizerId, websiteId, enabled, admin);
}

export async function setBookingsEnabledWithClient(
  organizerId: string,
  websiteId: string,
  enabled: boolean,
  admin: BookingsAdminClient
): Promise<SaveReservationSettingsResult> {
  const { data: website, error } = await admin
    .from("tenant_websites")
    .select("id, metadata")
    .eq("id", websiteId)
    .eq("tenant_id", organizerId)
    .maybeSingle();

  if (error) {
    return { success: false, error: "db_error", message: "Failed to load website. Please try again." };
  }
  if (!website) {
    return { success: false, error: "no_website", message: "Create your website first to configure bookings." };
  }

  const current = extractReservationSettings((website as { metadata?: unknown }).metadata);
  const valResult = validateReservationSettings({ ...current, enabled });
  if (!valResult.valid) {
    return { success: false, error: "validation_error", message: valResult.error };
  }

  return saveReservationSettingsWithClient(
    {
      organizerId,
      websiteId,
      enabled: valResult.settings.enabled,
      max_party_size: valResult.settings.max_party_size,
      min_lead_minutes: valResult.settings.min_lead_minutes,
      max_days_ahead: valResult.settings.max_days_ahead,
      slot_minutes: valResult.settings.slot_minutes,
      note: valResult.settings.note,
      seat_capacity: valResult.settings.seat_capacity,
      default_stay_minutes: valResult.settings.default_stay_minutes,
      max_stay_minutes: valResult.settings.max_stay_minutes,
      allowed_stay_minutes: valResult.settings.allowed_stay_minutes,
      cancellation_cutoff_minutes: valResult.settings.cancellation_cutoff_minutes,
    },
    admin
  );
}

// ── Confirm / decline / cancel ──────────────────────────────────────────────

export interface UpdateBookingStatusInput {
  bookingId: string;
  organizerId: string;
  expectedCurrentStatus: string;
  nextStatus: "confirmed" | "declined" | "cancelled" | "completed" | "no_show";
  reason?: string | null;
}

export type BookingActionResult =
  | { success: true }
  | {
      success: false;
      error: "unauthorized" | "forbidden" | "not_found" | "already_updated" | "invalid_transition" | "db_error";
      message?: string;
    };

async function updateBookingStatus(input: UpdateBookingStatusInput): Promise<BookingActionResult> {
  const access = await requireManageAccess(input.organizerId);
  if (!access.ok) return access.result;
  const admin = createSupabaseAdmin();
  return updateBookingStatusWithClient(input, admin);
}

export async function updateBookingStatusWithClient(
  input: UpdateBookingStatusInput,
  admin: BookingsAdminClient
): Promise<BookingActionResult> {
  const allowed = BOOKING_TRANSITION_GRAPH[input.expectedCurrentStatus] || [];
  if (!allowed.includes(input.nextStatus)) {
    return {
      success: false,
      error: "invalid_transition",
      message: `Cannot move a booking from "${input.expectedCurrentStatus}" to "${input.nextStatus}".`,
    };
  }

  const nowIso = new Date().toISOString();
  const reason = (input.reason || "").trim().slice(0, 300) || null;

  const { data: updated, error } = await admin
    .from("reservations")
    .update({
      status: input.nextStatus,
      decline_reason: input.nextStatus === "declined" || input.nextStatus === "cancelled" ? reason : null,
      updated_at: nowIso,
    })
    .eq("id", input.bookingId)
    .eq("organizer_id", input.organizerId)
    .eq("booking_type", BOOKING_TYPE)
    .eq("status", input.expectedCurrentStatus)
    .select("id")
    .maybeSingle();

  if (error) {
    return { success: false, error: "db_error", message: "Failed to update the booking." };
  }
  if (!updated) {
    return { success: false, error: "already_updated", message: "This booking was already updated by another team member." };
  }

  try {
    revalidatePath(`/dashboard/org/${input.organizerId}/bookings`);
  } catch {
    // Non-fatal outside request context.
  }

  return { success: true };
}

export async function confirmBooking(bookingId: string, organizerId: string): Promise<BookingActionResult> {
  return updateBookingStatus({ bookingId, organizerId, expectedCurrentStatus: "pending", nextStatus: "confirmed" });
}

export async function declineBooking(
  bookingId: string,
  organizerId: string,
  reason?: string | null
): Promise<BookingActionResult> {
  return updateBookingStatus({ bookingId, organizerId, expectedCurrentStatus: "pending", nextStatus: "declined", reason });
}

export async function cancelBooking(
  bookingId: string,
  organizerId: string,
  expectedCurrentStatus: string,
  reason?: string | null
): Promise<BookingActionResult> {
  return updateBookingStatus({ bookingId, organizerId, expectedCurrentStatus, nextStatus: "cancelled", reason });
}
