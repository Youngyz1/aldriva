"use server";

/**
 * lib/actions/rental-categories.ts
 *
 * Server actions for vehicle categories management.
 * Documentation: docs/design/rental/architecture.md §4 (Slice 1)
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { safeImageSrc } from "@/lib/image-url";
import {
  normalizeSlugCandidate,
  slugCandidateForAttempt,
  CATEGORY_SLUG_MAX,
} from "@/lib/validation/service-catalog";

export interface VehicleCategorySpecs {
  seats?: number;
  transmission?: "automatic" | "manual";
  doors?: number;
  luggage?: number;
  ac?: boolean;
  [key: string]: unknown;
}

export interface VehicleCategoryRow {
  id: string;
  organizer_id: string;
  business_id: string;
  name: string;
  slug: string;
  description: string | null;
  daily_rate: number;
  weekly_rate: number | null;
  deposit_amount: number;
  currency: string;
  specs: VehicleCategorySpecs;
  photo_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  vehicle_count?: number;
}

export interface CreateVehicleCategoryInput {
  organizerId: string;
  businessId: string;
  name: string;
  slug?: string;
  description?: string | null;
  dailyRate: number;
  weeklyRate?: number | null;
  depositAmount?: number;
  currency?: string;
  specs?: VehicleCategorySpecs;
  photoUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateVehicleCategoryInput {
  categoryId: string;
  organizerId: string;
  name?: string;
  slug?: string;
  description?: string | null;
  dailyRate?: number;
  weeklyRate?: number | null;
  depositAmount?: number;
  currency?: string;
  specs?: VehicleCategorySpecs;
  photoUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

const WRITE_ROLES: EntityRole[] = ["owner", "admin", "manager", "editor"];
const MANAGE_ROLES: EntityRole[] = ["owner", "admin", "manager"];
const VIEW_ROLES: EntityRole[] = ["owner", "admin", "manager", "editor", "finance", "viewer"];

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "42P01" || code === "42703") return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && (message.includes("does not exist") || message.includes("schema cache"));
}

async function verifyAuth(organizerId: string, allowedRoles: EntityRole[]) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const access = await checkTenantAccess(user.id, organizerId, allowedRoles);
  if (!access.hasAccess) throw new Error("Forbidden");
  return user;
}

export async function listVehicleCategories(
  organizerId: string,
  businessId?: string
): Promise<{ success: boolean; data: VehicleCategoryRow[]; migrated: boolean; error?: string }> {
  try {
    await verifyAuth(organizerId, VIEW_ROLES);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return { success: false, data: [], migrated: true, error: msg };
  }

  const admin = createSupabaseAdmin();
  let query = admin
    .from("vehicle_categories")
    .select("*, vehicles:vehicles(count)")
    .eq("organizer_id", organizerId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (businessId) {
    query = query.eq("business_id", businessId);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return { success: true, data: [], migrated: false };
    }
    return { success: false, data: [], migrated: true, error: error.message };
  }

  const rows: VehicleCategoryRow[] = (data || []).map((row: any) => ({
    id: row.id,
    organizer_id: row.organizer_id,
    business_id: row.business_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    daily_rate: Number(row.daily_rate) || 0,
    weekly_rate: row.weekly_rate !== null ? Number(row.weekly_rate) : null,
    deposit_amount: Number(row.deposit_amount) || 0,
    currency: row.currency || "USD",
    specs: row.specs || {},
    photo_url: row.photo_url,
    sort_order: row.sort_order || 0,
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    vehicle_count: Array.isArray(row.vehicles) && row.vehicles[0]?.count != null
      ? Number(row.vehicles[0].count)
      : 0,
  }));

  return { success: true, data: rows, migrated: true };
}

export async function getVehicleCategory(
  categoryId: string,
  organizerId: string
): Promise<{ success: boolean; data?: VehicleCategoryRow; error?: string }> {
  try {
    await verifyAuth(organizerId, VIEW_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("vehicle_categories")
    .select("*")
    .eq("id", categoryId)
    .eq("organizer_id", organizerId)
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }
  if (!data) {
    return { success: false, error: "Category not found" };
  }

  return {
    success: true,
    data: {
      ...data,
      daily_rate: Number(data.daily_rate) || 0,
      weekly_rate: data.weekly_rate !== null ? Number(data.weekly_rate) : null,
      deposit_amount: Number(data.deposit_amount) || 0,
    },
  };
}

export async function createVehicleCategory(
  input: CreateVehicleCategoryInput
): Promise<{ success: boolean; data?: VehicleCategoryRow; error?: string }> {
  try {
    await verifyAuth(input.organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  // 1. Validate inputs
  const trimmedName = (input.name || "").trim();
  if (trimmedName.length < 1 || trimmedName.length > 100) {
    return { success: false, error: "Category name must be between 1 and 100 characters" };
  }

  if (input.dailyRate === undefined || input.dailyRate === null || Number(input.dailyRate) < 0) {
    return { success: false, error: "Daily rate must be a non-negative number" };
  }

  if (input.weeklyRate !== undefined && input.weeklyRate !== null && Number(input.weeklyRate) < 0) {
    return { success: false, error: "Weekly rate cannot be negative" };
  }

  if (input.depositAmount !== undefined && Number(input.depositAmount) < 0) {
    return { success: false, error: "Deposit amount cannot be negative" };
  }

  if (input.photoUrl && !safeImageSrc(input.photoUrl)) {
    return { success: false, error: "Invalid photo URL" };
  }

  const admin = createSupabaseAdmin();

  // 2. Verify business belongs to organizer
  const { data: business, error: bizErr } = await admin
    .from("businesses")
    .select("id")
    .eq("id", input.businessId)
    .eq("organizer_id", input.organizerId)
    .maybeSingle();

  if (bizErr || !business) {
    return { success: false, error: "Invalid business for this organizer" };
  }

  // 3. Generate unique slug per business
  const baseSlug = normalizeSlugCandidate(input.slug || trimmedName, "category", CATEGORY_SLUG_MAX);
  let resolvedSlug = baseSlug;

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = slugCandidateForAttempt(baseSlug, attempt, CATEGORY_SLUG_MAX);
    const { data: existing } = await admin
      .from("vehicle_categories")
      .select("id")
      .eq("business_id", input.businessId)
      .eq("slug", candidate)
      .maybeSingle();

    if (!existing) {
      resolvedSlug = candidate;
      break;
    }
    if (attempt === 9) {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      resolvedSlug = `${baseSlug.slice(0, CATEGORY_SLUG_MAX - 5)}-${randomSuffix}`;
    }
  }

  const insertPayload = {
    organizer_id: input.organizerId,
    business_id: input.businessId,
    name: trimmedName,
    slug: resolvedSlug,
    description: input.description ? input.description.slice(0, 2000) : null,
    daily_rate: Number(input.dailyRate),
    weekly_rate: input.weeklyRate !== undefined && input.weeklyRate !== null ? Number(input.weeklyRate) : null,
    deposit_amount: Number(input.depositAmount ?? 0),
    currency: (input.currency || "USD").toUpperCase().slice(0, 3),
    specs: input.specs || {},
    photo_url: input.photoUrl || null,
    sort_order: Number(input.sortOrder ?? 0),
    is_active: input.isActive ?? true,
  };

  const { data, error } = await admin
    .from("vehicle_categories")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return { success: false, error: "Rental engine schema is not applied yet (Migration 224 required)" };
    }
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${input.organizerId}/fleet`);
  revalidatePath(`/dashboard/org/${input.organizerId}/fleet/categories`);

  return {
    success: true,
    data: {
      ...data,
      daily_rate: Number(data.daily_rate),
      weekly_rate: data.weekly_rate !== null ? Number(data.weekly_rate) : null,
      deposit_amount: Number(data.deposit_amount),
    },
  };
}

export async function updateVehicleCategory(
  input: UpdateVehicleCategoryInput
): Promise<{ success: boolean; data?: VehicleCategoryRow; error?: string }> {
  try {
    await verifyAuth(input.organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const updateFields: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (trimmed.length < 1 || trimmed.length > 100) {
      return { success: false, error: "Category name must be between 1 and 100 characters" };
    }
    updateFields.name = trimmed;
  }

  if (input.dailyRate !== undefined) {
    if (Number(input.dailyRate) < 0) return { success: false, error: "Daily rate cannot be negative" };
    updateFields.daily_rate = Number(input.dailyRate);
  }

  if (input.weeklyRate !== undefined) {
    if (input.weeklyRate !== null && Number(input.weeklyRate) < 0) {
      return { success: false, error: "Weekly rate cannot be negative" };
    }
    updateFields.weekly_rate = input.weeklyRate !== null ? Number(input.weeklyRate) : null;
  }

  if (input.depositAmount !== undefined) {
    if (Number(input.depositAmount) < 0) return { success: false, error: "Deposit amount cannot be negative" };
    updateFields.deposit_amount = Number(input.depositAmount);
  }

  if (input.currency !== undefined) {
    updateFields.currency = input.currency.toUpperCase().slice(0, 3);
  }

  if (input.description !== undefined) {
    updateFields.description = input.description ? input.description.slice(0, 2000) : null;
  }

  if (input.photoUrl !== undefined) {
    if (input.photoUrl && !safeImageSrc(input.photoUrl)) {
      return { success: false, error: "Invalid photo URL" };
    }
    updateFields.photo_url = input.photoUrl;
  }

  if (input.specs !== undefined) {
    updateFields.specs = input.specs;
  }

  if (input.sortOrder !== undefined) {
    updateFields.sort_order = Number(input.sortOrder);
  }

  if (input.isActive !== undefined) {
    updateFields.is_active = Boolean(input.isActive);
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("vehicle_categories")
    .update(updateFields)
    .eq("id", input.categoryId)
    .eq("organizer_id", input.organizerId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${input.organizerId}/fleet`);
  revalidatePath(`/dashboard/org/${input.organizerId}/fleet/categories`);

  return {
    success: true,
    data: {
      ...data,
      daily_rate: Number(data.daily_rate),
      weekly_rate: data.weekly_rate !== null ? Number(data.weekly_rate) : null,
      deposit_amount: Number(data.deposit_amount),
    },
  };
}

export async function deleteVehicleCategory(
  categoryId: string,
  organizerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await verifyAuth(organizerId, MANAGE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const admin = createSupabaseAdmin();

  // Check if any vehicles currently reference this category
  const { count, error: countErr } = await admin
    .from("vehicles")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);

  if (countErr && !isMissingTableError(countErr)) {
    return { success: false, error: countErr.message };
  }

  if ((count ?? 0) > 0) {
    return {
      success: false,
      error: `Cannot delete category while ${count} vehicle(s) belong to it. Reassign or delete those vehicles first.`,
    };
  }

  // Check if any bookings reference this category
  try {
    const { data: bookingExists } = await admin
      .from("rental_bookings")
      .select("id")
      .eq("category_id", categoryId)
      .in("status", ["pending", "awaiting_payment", "confirmed", "active", "completed"])
      .limit(1);

    if (bookingExists && bookingExists.length > 0) {
      return {
        success: false,
        error: "Cannot delete category with existing rental bookings. Deactivate it instead.",
      };
    }
  } catch {
    // If table doesn't exist yet, proceed
  }

  const { error } = await admin
    .from("vehicle_categories")
    .delete()
    .eq("id", categoryId)
    .eq("organizer_id", organizerId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${organizerId}/fleet`);
  revalidatePath(`/dashboard/org/${organizerId}/fleet/categories`);

  return { success: true };
}
