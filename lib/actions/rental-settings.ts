"use server";

/**
 * lib/actions/rental-settings.ts
 *
 * Server actions for Vehicle Rental storefront & operational settings.
 * Documentation: docs/design/rental/architecture.md §4 (Slice 3)
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";

export interface RentalSettings {
  confirmationMode: "approval" | "instant";
  allocationMode: "manual" | "auto_on_confirm" | "auto_on_booking";
  minNoticeHours: number;
  billingBoundary: "rolling_24h" | "calendar_day";
  requireLicenseDob: boolean;
  minDriverAge: number;
  depositPolicy: string | null;
  cancellationPolicy: string | null;
  rentalTerms: string | null;
  paymentPolicy: "offline" | "full_online" | "advance_online";
  advancePct: number | null;
  paymentLinkHours: number;
  lateFeeGraceMinutes: number;
  lateFeePerDay: number;
}

const WRITE_ROLES: EntityRole[] = ["owner", "admin", "manager"];
const VIEW_ROLES: EntityRole[] = ["owner", "admin", "manager", "editor", "finance", "viewer"];

const DEFAULT_SETTINGS: RentalSettings = {
  confirmationMode: "approval",
  allocationMode: "manual",
  minNoticeHours: 2,
  billingBoundary: "rolling_24h",
  requireLicenseDob: true,
  minDriverAge: 21,
  depositPolicy: null,
  cancellationPolicy: null,
  rentalTerms: null,
  paymentPolicy: "offline",
  advancePct: null,
  paymentLinkHours: 48,
  lateFeeGraceMinutes: 60,
  lateFeePerDay: 0,
};

async function verifyAuth(organizerId: string, allowedRoles: EntityRole[]) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const access = await checkTenantAccess(user.id, organizerId, allowedRoles);
  if (!access.hasAccess) throw new Error("Forbidden");
  return user;
}

export async function getRentalSettings(
  organizerId: string,
  businessId: string
): Promise<{ settings: RentalSettings; error?: string }> {
  try {
    await verifyAuth(organizerId, VIEW_ROLES);
    const admin = createSupabaseAdmin();

    const { data, error } = await admin
      .from("businesses")
      .select(
        "rental_allocation_mode, rental_confirmation_mode, rental_min_notice_hours, rental_billing_boundary, rental_require_license_dob, rental_min_driver_age, rental_deposit_policy, rental_cancellation_policy, rental_terms, rental_payment_policy, rental_advance_pct, rental_payment_link_hours, rental_late_fee_grace_minutes, rental_late_fee_per_day"
      )
      .eq("id", businessId)
      .eq("organizer_id", organizerId)
      .maybeSingle();

    if (error) {
      return { settings: DEFAULT_SETTINGS, error: error.message };
    }

    if (!data) {
      return { settings: DEFAULT_SETTINGS };
    }

    const settings: RentalSettings = {
      confirmationMode: (data.rental_confirmation_mode as "approval" | "instant") ?? DEFAULT_SETTINGS.confirmationMode,
      allocationMode: (data.rental_allocation_mode as "manual" | "auto_on_confirm" | "auto_on_booking") ?? DEFAULT_SETTINGS.allocationMode,
      minNoticeHours: Number.isFinite(data.rental_min_notice_hours) ? data.rental_min_notice_hours : DEFAULT_SETTINGS.minNoticeHours,
      billingBoundary: (data.rental_billing_boundary as "rolling_24h" | "calendar_day") ?? DEFAULT_SETTINGS.billingBoundary,
      requireLicenseDob: data.rental_require_license_dob ?? DEFAULT_SETTINGS.requireLicenseDob,
      minDriverAge: Number.isFinite(data.rental_min_driver_age) ? data.rental_min_driver_age : DEFAULT_SETTINGS.minDriverAge,
      depositPolicy: data.rental_deposit_policy ?? null,
      cancellationPolicy: data.rental_cancellation_policy ?? null,
      rentalTerms: data.rental_terms ?? null,
      paymentPolicy: (data.rental_payment_policy as "offline" | "full_online" | "advance_online") ?? DEFAULT_SETTINGS.paymentPolicy,
      advancePct: data.rental_advance_pct ?? null,
      paymentLinkHours: data.rental_payment_link_hours ?? DEFAULT_SETTINGS.paymentLinkHours,
      lateFeeGraceMinutes: Number.isFinite((data as any).rental_late_fee_grace_minutes) ? Number((data as any).rental_late_fee_grace_minutes) : DEFAULT_SETTINGS.lateFeeGraceMinutes,
      lateFeePerDay: Number.isFinite(Number((data as any).rental_late_fee_per_day)) ? Number((data as any).rental_late_fee_per_day) : DEFAULT_SETTINGS.lateFeePerDay,
    };

    return { settings };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load settings";
    return { settings: DEFAULT_SETTINGS, error: message };
  }
}

export async function updateRentalSettings(
  organizerId: string,
  businessId: string,
  input: Partial<RentalSettings>
): Promise<{ success: boolean; settings?: RentalSettings; error?: string }> {
  try {
    await verifyAuth(organizerId, WRITE_ROLES);
    const admin = createSupabaseAdmin();

    const updatePayload: Record<string, unknown> = {};

    if (input.confirmationMode !== undefined) {
      if (!["approval", "instant"].includes(input.confirmationMode)) {
        return { success: false, error: "Invalid confirmation mode" };
      }
      updatePayload.rental_confirmation_mode = input.confirmationMode;
    }

    if (input.allocationMode !== undefined) {
      if (!["manual", "auto_on_confirm", "auto_on_booking"].includes(input.allocationMode)) {
        return { success: false, error: "Invalid allocation mode" };
      }
      updatePayload.rental_allocation_mode = input.allocationMode;
    }

    if (input.minNoticeHours !== undefined) {
      const notice = Number(input.minNoticeHours);
      if (isNaN(notice) || notice < 0 || notice > 168) {
        return { success: false, error: "Minimum notice must be between 0 and 168 hours (7 days)" };
      }
      updatePayload.rental_min_notice_hours = notice;
    }

    if (input.billingBoundary !== undefined) {
      if (!["rolling_24h", "calendar_day"].includes(input.billingBoundary)) {
        return { success: false, error: "Invalid billing boundary" };
      }
      updatePayload.rental_billing_boundary = input.billingBoundary;
    }

    if (input.requireLicenseDob !== undefined) {
      updatePayload.rental_require_license_dob = Boolean(input.requireLicenseDob);
    }

    if (input.minDriverAge !== undefined) {
      const age = Number(input.minDriverAge);
      if (isNaN(age) || age < 16 || age > 100) {
        return { success: false, error: "Minimum driver age must be between 16 and 100" };
      }
      updatePayload.rental_min_driver_age = age;
    }

    if (input.paymentPolicy !== undefined) {
      if (!["offline", "full_online", "advance_online"].includes(input.paymentPolicy)) {
        return { success: false, error: "Invalid payment policy" };
      }
      updatePayload.rental_payment_policy = input.paymentPolicy;
      if (input.paymentPolicy === "advance_online") {
        const pct = Number(input.advancePct);
        if (!Number.isInteger(pct) || pct < 10 || pct > 90) {
          return { success: false, error: "Advance percentage must be a whole number between 10 and 90" };
        }
        updatePayload.rental_advance_pct = pct;
      } else {
        updatePayload.rental_advance_pct = null;
      }
    }

    if (input.paymentLinkHours !== undefined) {
      const hrs = Number(input.paymentLinkHours);
      if (!Number.isInteger(hrs) || hrs < 1 || hrs > 168) {
        return { success: false, error: "Payment link validity must be a whole number between 1 and 168 hours" };
      }
      updatePayload.rental_payment_link_hours = hrs;
    }

    if (input.depositPolicy !== undefined) {
      updatePayload.rental_deposit_policy = input.depositPolicy?.trim() || null;
    }

    if (input.cancellationPolicy !== undefined) {
      updatePayload.rental_cancellation_policy = input.cancellationPolicy?.trim() || null;
    }

    if (input.rentalTerms !== undefined) {
      updatePayload.rental_terms = input.rentalTerms?.trim() || null;
    }

    if (input.lateFeeGraceMinutes !== undefined) {
      const mins = Number(input.lateFeeGraceMinutes);
      if (!Number.isInteger(mins) || mins < 0 || mins > 1440) {
        return { success: false, error: "Late fee grace period must be a whole number between 0 and 1440 minutes" };
      }
      updatePayload.rental_late_fee_grace_minutes = mins;
    }

    if (input.lateFeePerDay !== undefined) {
      const amt = Number(input.lateFeePerDay);
      if (!Number.isFinite(amt) || amt < 0) {
        return { success: false, error: "Late fee per day must be zero or greater" };
      }
      updatePayload.rental_late_fee_per_day = Math.round(amt * 100) / 100;
    }

    const { data, error } = await admin
      .from("businesses")
      .update(updatePayload)
      .eq("id", businessId)
      .eq("organizer_id", organizerId)
      .select(
        "rental_allocation_mode, rental_confirmation_mode, rental_min_notice_hours, rental_billing_boundary, rental_require_license_dob, rental_min_driver_age, rental_deposit_policy, rental_cancellation_policy, rental_terms, rental_payment_policy, rental_advance_pct, rental_payment_link_hours, rental_late_fee_grace_minutes, rental_late_fee_per_day"
      )
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/dashboard/org/${organizerId}/rentals`);

    const updatedSettings: RentalSettings = {
      confirmationMode: (data.rental_confirmation_mode as "approval" | "instant") ?? DEFAULT_SETTINGS.confirmationMode,
      allocationMode: (data.rental_allocation_mode as "manual" | "auto_on_confirm" | "auto_on_booking") ?? DEFAULT_SETTINGS.allocationMode,
      minNoticeHours: data.rental_min_notice_hours ?? DEFAULT_SETTINGS.minNoticeHours,
      billingBoundary: (data.rental_billing_boundary as "rolling_24h" | "calendar_day") ?? DEFAULT_SETTINGS.billingBoundary,
      requireLicenseDob: data.rental_require_license_dob ?? DEFAULT_SETTINGS.requireLicenseDob,
      minDriverAge: data.rental_min_driver_age ?? DEFAULT_SETTINGS.minDriverAge,
      depositPolicy: data.rental_deposit_policy ?? null,
      cancellationPolicy: data.rental_cancellation_policy ?? null,
      rentalTerms: data.rental_terms ?? null,
      paymentPolicy: (data.rental_payment_policy as "offline" | "full_online" | "advance_online") ?? DEFAULT_SETTINGS.paymentPolicy,
      advancePct: data.rental_advance_pct ?? null,
      paymentLinkHours: data.rental_payment_link_hours ?? DEFAULT_SETTINGS.paymentLinkHours,
      lateFeeGraceMinutes: Number.isFinite((data as any).rental_late_fee_grace_minutes) ? Number((data as any).rental_late_fee_grace_minutes) : DEFAULT_SETTINGS.lateFeeGraceMinutes,
      lateFeePerDay: Number.isFinite(Number((data as any).rental_late_fee_per_day)) ? Number((data as any).rental_late_fee_per_day) : DEFAULT_SETTINGS.lateFeePerDay,
    };

    return { success: true, settings: updatedSettings };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update settings";
    return { success: false, error: message };
  }
}
