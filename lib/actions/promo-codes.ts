"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import {
  normalizePromoCode,
  PROMO_CODE_MIN_LENGTH,
  PROMO_CODE_MAX_LENGTH,
  PROMO_PERCENT_MIN,
  PROMO_PERCENT_MAX,
  type PromoCodeRow,
} from "@/lib/promo-codes";

export const PROMO_READ_ROLES: EntityRole[] = ["owner", "admin", "manager", "editor", "finance"];
export const PROMO_MANAGE_ROLES: EntityRole[] = ["owner", "admin", "manager"];

export interface CreateStorePromoInput {
  code: string;
  discountType: "percent" | "fixed";
  percentOff?: number | null;
  fixedOffMinor?: number | null;
  fixedCurrency?: string | null;
  minSubtotalMinor?: number;
  maxUses?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
}

export interface UpdateStorePromoInput {
  discountType?: "percent" | "fixed";
  percentOff?: number | null;
  fixedOffMinor?: number | null;
  fixedCurrency?: string | null;
  minSubtotalMinor?: number;
  maxUses?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
}

export interface PromoActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function verifyPromoAccess(organizerId: string, allowedRoles: EntityRole[]): Promise<{ authorized: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { authorized: false, error: "Authentication required." };
  }

  const access = await checkTenantAccess(user.id, organizerId, allowedRoles);
  if (access.hasAccess) {
    return { authorized: true };
  }

  const isPlatformAdmin = await isAdmin();
  if (isPlatformAdmin) {
    return { authorized: true };
  }

  return { authorized: false, error: "You do not have permission to perform this action." };
}

/**
 * List all store promo codes for a tenant.
 */
export async function listStorePromoCodes(organizerId: string): Promise<PromoActionResult<PromoCodeRow[]>> {
  const auth = await verifyPromoAccess(organizerId, PROMO_READ_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("promo_codes")
    .select("*")
    .eq("tenant_id", organizerId)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: (data as PromoCodeRow[]) ?? [] };
}

/**
 * Create a new store promo code for a tenant.
 */
export async function createStorePromoCode(
  organizerId: string,
  input: CreateStorePromoInput
): Promise<PromoActionResult<PromoCodeRow>> {
  const auth = await verifyPromoAccess(organizerId, PROMO_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const code = normalizePromoCode(input.code);
  if (code.length < PROMO_CODE_MIN_LENGTH || code.length > PROMO_CODE_MAX_LENGTH) {
    return {
      success: false,
      error: `Promo code must be between ${PROMO_CODE_MIN_LENGTH} and ${PROMO_CODE_MAX_LENGTH} characters.`,
    };
  }

  if (!/^[A-Z0-9_-]+$/.test(code)) {
    return {
      success: false,
      error: "Promo code may only contain letters, numbers, hyphens, and underscores.",
    };
  }

  let percentOff: number | null = null;
  let fixedOffMinor: number | null = null;
  let fixedCurrency: string | null = null;

  if (input.discountType === "percent") {
    const val = Number(input.percentOff);
    if (!Number.isInteger(val) || val < PROMO_PERCENT_MIN || val > PROMO_PERCENT_MAX) {
      return {
        success: false,
        error: `Percentage discount must be an integer between ${PROMO_PERCENT_MIN}% and ${PROMO_PERCENT_MAX}%.`,
      };
    }
    percentOff = val;
  } else if (input.discountType === "fixed") {
    const val = Number(input.fixedOffMinor);
    if (!Number.isInteger(val) || val <= 0) {
      return {
        success: false,
        error: "Fixed discount amount must be greater than zero.",
      };
    }
    const curr = typeof input.fixedCurrency === "string" ? input.fixedCurrency.trim().toUpperCase() : "";
    if (!/^[A-Z]{3}$/.test(curr)) {
      return {
        success: false,
        error: "Fixed discount requires a valid 3-letter currency code (e.g. USD, EUR, XOF).",
      };
    }
    fixedOffMinor = val;
    fixedCurrency = curr;
  } else {
    return {
      success: false,
      error: "Invalid discount type specified.",
    };
  }

  const minSubtotal = Math.max(0, Math.floor(Number(input.minSubtotalMinor ?? 0)));
  let maxUses: number | null = null;
  if (input.maxUses !== null && input.maxUses !== undefined && input.maxUses !== 0) {
    const parsedMax = Number(input.maxUses);
    if (!Number.isInteger(parsedMax) || parsedMax <= 0) {
      return {
        success: false,
        error: "Maximum uses must be a positive number.",
      };
    }
    maxUses = parsedMax;
  }

  let startsAt: string | null = null;
  let expiresAt: string | null = null;
  if (input.startsAt) {
    const parsedStarts = Date.parse(input.startsAt);
    if (isNaN(parsedStarts)) {
      return { success: false, error: "Invalid start date format." };
    }
    startsAt = new Date(parsedStarts).toISOString();
  }
  if (input.expiresAt) {
    const parsedExpires = Date.parse(input.expiresAt);
    if (isNaN(parsedExpires)) {
      return { success: false, error: "Invalid expiration date format." };
    }
    expiresAt = new Date(parsedExpires).toISOString();
  }
  if (startsAt && expiresAt && startsAt > expiresAt) {
    return { success: false, error: "Expiration date cannot be earlier than start date." };
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("promo_codes")
    .insert({
      tenant_id: organizerId,
      code,
      percent_off: percentOff,
      fixed_off_minor: fixedOffMinor,
      fixed_currency: fixedCurrency,
      min_subtotal_minor: minSubtotal,
      max_uses: maxUses,
      starts_at: startsAt,
      expires_at: expiresAt,
      is_active: input.isActive ?? true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: "A promo code with this name already exists for your store.",
      };
    }
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${organizerId}/products`);
  return { success: true, data: data as PromoCodeRow };
}

/**
 * Update an existing promo code.
 */
export async function updateStorePromoCode(
  organizerId: string,
  promoId: string,
  input: UpdateStorePromoInput
): Promise<PromoActionResult<PromoCodeRow>> {
  const auth = await verifyPromoAccess(organizerId, PROMO_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const admin = createSupabaseAdmin();
  const { data: existing, error: fetchErr } = await admin
    .from("promo_codes")
    .select("*")
    .eq("id", promoId)
    .eq("tenant_id", organizerId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, error: "Promo code not found." };
  }

  const updatePayload: Record<string, unknown> = {};

  if (input.discountType !== undefined) {
    if (input.discountType === "percent") {
      const val = Number(input.percentOff);
      if (!Number.isInteger(val) || val < PROMO_PERCENT_MIN || val > PROMO_PERCENT_MAX) {
        return {
          success: false,
          error: `Percentage discount must be an integer between ${PROMO_PERCENT_MIN}% and ${PROMO_PERCENT_MAX}%.`,
        };
      }
      updatePayload.percent_off = val;
      updatePayload.fixed_off_minor = null;
      updatePayload.fixed_currency = null;
    } else if (input.discountType === "fixed") {
      const val = Number(input.fixedOffMinor);
      if (!Number.isInteger(val) || val <= 0) {
        return {
          success: false,
          error: "Fixed discount amount must be greater than zero.",
        };
      }
      const curr = typeof input.fixedCurrency === "string" ? input.fixedCurrency.trim().toUpperCase() : "";
      if (!/^[A-Z]{3}$/.test(curr)) {
        return {
          success: false,
          error: "Fixed discount requires a valid 3-letter currency code (e.g. USD, EUR, XOF).",
        };
      }
      updatePayload.percent_off = null;
      updatePayload.fixed_off_minor = val;
      updatePayload.fixed_currency = curr;
    }
  }

  if (input.minSubtotalMinor !== undefined) {
    updatePayload.min_subtotal_minor = Math.max(0, Math.floor(Number(input.minSubtotalMinor)));
  }

  if (input.maxUses !== undefined) {
    if (input.maxUses === null || input.maxUses === 0) {
      updatePayload.max_uses = null;
    } else {
      const parsedMax = Number(input.maxUses);
      if (!Number.isInteger(parsedMax) || parsedMax <= 0) {
        return { success: false, error: "Maximum uses must be a positive number." };
      }
      updatePayload.max_uses = parsedMax;
    }
  }

  if (input.startsAt !== undefined) {
    if (input.startsAt) {
      const parsed = Date.parse(input.startsAt);
      if (isNaN(parsed)) return { success: false, error: "Invalid start date format." };
      updatePayload.starts_at = new Date(parsed).toISOString();
    } else {
      updatePayload.starts_at = null;
    }
  }

  if (input.expiresAt !== undefined) {
    if (input.expiresAt) {
      const parsed = Date.parse(input.expiresAt);
      if (isNaN(parsed)) return { success: false, error: "Invalid expiration date format." };
      updatePayload.expires_at = new Date(parsed).toISOString();
    } else {
      updatePayload.expires_at = null;
    }
  }

  const effectiveStarts = "starts_at" in updatePayload ? (updatePayload.starts_at as string | null) : existing.starts_at;
  const effectiveExpires = "expires_at" in updatePayload ? (updatePayload.expires_at as string | null) : existing.expires_at;
  if (effectiveStarts && effectiveExpires && effectiveStarts > effectiveExpires) {
    return { success: false, error: "Expiration date cannot be earlier than start date." };
  }

  if (input.isActive !== undefined) {
    updatePayload.is_active = Boolean(input.isActive);
  }

  const { data, error } = await admin
    .from("promo_codes")
    .update(updatePayload)
    .eq("id", promoId)
    .eq("tenant_id", organizerId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${organizerId}/products`);
  return { success: true, data: data as PromoCodeRow };
}

/**
 * Toggle active state for a store promo code.
 */
export async function toggleStorePromoCodeActive(
  organizerId: string,
  promoId: string,
  isActive: boolean
): Promise<PromoActionResult<PromoCodeRow>> {
  const auth = await verifyPromoAccess(organizerId, PROMO_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("promo_codes")
    .update({ is_active: isActive })
    .eq("id", promoId)
    .eq("tenant_id", organizerId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${organizerId}/products`);
  return { success: true, data: data as PromoCodeRow };
}

/**
 * Delete a store promo code.
 */
export async function deleteStorePromoCode(
  organizerId: string,
  promoId: string
): Promise<PromoActionResult<boolean>> {
  const auth = await verifyPromoAccess(organizerId, PROMO_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("promo_codes")
    .delete()
    .eq("id", promoId)
    .eq("tenant_id", organizerId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${organizerId}/products`);
  return { success: true, data: true };
}
