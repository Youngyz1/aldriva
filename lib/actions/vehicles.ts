"use server";

/**
 * lib/actions/vehicles.ts
 *
 * Server actions for physical fleet inventory management.
 * Documentation: docs/design/rental/architecture.md §4 (Slice 1)
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";

export type VehicleFuelType = "gasoline" | "diesel" | "electric" | "hybrid";
export type VehicleStatus = "available" | "rented" | "maintenance" | "out_of_service";

export interface VehicleRow {
  id: string;
  organizer_id: string;
  business_id: string;
  category_id: string;
  branch_id: string | null;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  vin: string | null;
  color: string | null;
  photo_url: string | null;
  current_mileage: number;
  fuel_type: VehicleFuelType;
  status: VehicleStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: {
    id: string;
    name: string;
    daily_rate: number;
    deposit_amount: number;
    currency: string;
    photo_url: string | null;
  } | null;
  branch?: {
    id: string;
    label: string;
  } | null;
}

export interface CreateVehicleInput {
  organizerId: string;
  businessId: string;
  categoryId: string;
  branchId?: string | null;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  vin?: string | null;
  color?: string | null;
  photoUrl?: string | null;
  currentMileage?: number;
  fuelType?: VehicleFuelType;
  status?: VehicleStatus;
  isActive?: boolean;
}

export interface UpdateVehicleInput {
  vehicleId: string;
  organizerId: string;
  categoryId?: string;
  branchId?: string | null;
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  vin?: string | null;
  color?: string | null;
  photoUrl?: string | null;
  currentMileage?: number;
  fuelType?: VehicleFuelType;
  status?: VehicleStatus;
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

export async function listVehicles(
  organizerId: string,
  options?: {
    businessId?: string;
    categoryId?: string;
    status?: VehicleStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ success: boolean; data: VehicleRow[]; totalCount: number; migrated: boolean; error?: string }> {
  try {
    await verifyAuth(organizerId, VIEW_ROLES);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return { success: false, data: [], totalCount: 0, migrated: true, error: msg };
  }

  const admin = createSupabaseAdmin();
  let query = admin
    .from("vehicles")
    .select(`
      *,
      category:vehicle_categories(id, name, daily_rate, deposit_amount, currency, photo_url),
      branch:business_branches(id, label)
    `, { count: "exact" })
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: false });

  if (options?.businessId) {
    query = query.eq("business_id", options.businessId);
  }
  if (options?.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }
  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.search) {
    const s = options.search.trim();
    if (s) {
      query = query.or(`license_plate.ilike.%${s}%,make.ilike.%${s}%,model.ilike.%${s}%`);
    }
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, count, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return { success: true, data: [], totalCount: 0, migrated: false };
    }
    return { success: false, data: [], totalCount: 0, migrated: true, error: error.message };
  }

  const rows: VehicleRow[] = (data || []).map((row: any) => ({
    id: row.id,
    organizer_id: row.organizer_id,
    business_id: row.business_id,
    category_id: row.category_id,
    branch_id: row.branch_id,
    make: row.make,
    model: row.model,
    year: row.year,
    license_plate: row.license_plate,
    vin: row.vin,
    color: row.color,
    photo_url: row.photo_url ?? null,
    current_mileage: row.current_mileage || 0,
    fuel_type: row.fuel_type || "gasoline",
    status: row.status || "available",
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    category: row.category ? {
      id: row.category.id,
      name: row.category.name,
      daily_rate: Number(row.category.daily_rate) || 0,
      deposit_amount: Number(row.category.deposit_amount) || 0,
      currency: row.category.currency || "USD",
      photo_url: row.category.photo_url ?? null,
    } : null,
    branch: row.branch ? {
      id: row.branch.id,
      label: row.branch.label,
    } : null,
  }));

  return { success: true, data: rows, totalCount: count || rows.length, migrated: true };
}

export async function getVehicle(
  vehicleId: string,
  organizerId: string
): Promise<{ success: boolean; data?: VehicleRow; error?: string }> {
  try {
    await verifyAuth(organizerId, VIEW_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("vehicles")
    .select(`
      *,
      category:vehicle_categories(id, name, daily_rate, deposit_amount, currency, photo_url),
      branch:business_branches(id, label)
    `)
    .eq("id", vehicleId)
    .eq("organizer_id", organizerId)
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }
  if (!data) {
    return { success: false, error: "Vehicle not found" };
  }

  return {
    success: true,
    data: {
      ...data,
      category: data.category ? {
        id: data.category.id,
        name: data.category.name,
        daily_rate: Number(data.category.daily_rate) || 0,
        deposit_amount: Number(data.category.deposit_amount) || 0,
        currency: data.category.currency || "USD",
        photo_url: data.category.photo_url ?? null,
      } : null,
      branch: data.branch ? {
        id: data.branch.id,
        label: data.branch.label,
      } : null,
    },
  };
}

export async function createVehicle(
  input: CreateVehicleInput
): Promise<{ success: boolean; data?: VehicleRow; error?: string }> {
  try {
    await verifyAuth(input.organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  // 1. Validation
  const make = (input.make || "").trim();
  const model = (input.model || "").trim();
  const licensePlate = (input.licensePlate || "").trim().toUpperCase();

  if (make.length < 1 || make.length > 60) {
    return { success: false, error: "Make must be between 1 and 60 characters" };
  }
  if (model.length < 1 || model.length > 60) {
    return { success: false, error: "Model must be between 1 and 60 characters" };
  }
  if (licensePlate.length < 1 || licensePlate.length > 20) {
    return { success: false, error: "License plate must be between 1 and 20 characters" };
  }

  const currentYear = new Date().getFullYear();
  if (!input.year || input.year < 1900 || input.year > currentYear + 2) {
    return { success: false, error: `Year must be between 1900 and ${currentYear + 2}` };
  }

  if (input.currentMileage !== undefined && (input.currentMileage < 0 || !Number.isInteger(input.currentMileage))) {
    return { success: false, error: "Current mileage must be a non-negative integer" };
  }

  const allowedFuelTypes: VehicleFuelType[] = ["gasoline", "diesel", "electric", "hybrid"];
  const fuelType: VehicleFuelType = input.fuelType && allowedFuelTypes.includes(input.fuelType)
    ? input.fuelType
    : "gasoline";

  const allowedStatuses: VehicleStatus[] = ["available", "rented", "maintenance", "out_of_service"];
  const status: VehicleStatus = input.status && allowedStatuses.includes(input.status)
    ? input.status
    : "available";

  const admin = createSupabaseAdmin();

  // 2. Validate tenant & business relationship
  const { data: business, error: bizErr } = await admin
    .from("businesses")
    .select("id")
    .eq("id", input.businessId)
    .eq("organizer_id", input.organizerId)
    .maybeSingle();

  if (bizErr || !business) {
    return { success: false, error: "Invalid business for this organizer" };
  }

  // 3. Validate category belongs to this business/organizer
  const { data: category, error: catErr } = await admin
    .from("vehicle_categories")
    .select("id")
    .eq("id", input.categoryId)
    .eq("organizer_id", input.organizerId)
    .maybeSingle();

  if (catErr || !category) {
    return { success: false, error: "Invalid vehicle category" };
  }

  // 4. Validate branch if provided
  if (input.branchId) {
    const { data: branch, error: branchErr } = await admin
      .from("business_branches")
      .select("id")
      .eq("id", input.branchId)
      .eq("business_id", input.businessId)
      .maybeSingle();

    if (branchErr || !branch) {
      return { success: false, error: "Invalid branch location" };
    }
  }

  // 5. Unique license plate per business check
  const { data: existingPlate } = await admin
    .from("vehicles")
    .select("id")
    .eq("business_id", input.businessId)
    .eq("license_plate", licensePlate)
    .maybeSingle();

  if (existingPlate) {
    return { success: false, error: `License plate "${licensePlate}" is already registered for this business` };
  }

  const insertPayload = {
    organizer_id: input.organizerId,
    business_id: input.businessId,
    category_id: input.categoryId,
    branch_id: input.branchId || null,
    make,
    model,
    year: input.year,
    license_plate: licensePlate,
    vin: input.vin ? input.vin.trim().toUpperCase().slice(0, 25) : null,
    color: input.color ? input.color.trim().slice(0, 40) : null,
    photo_url: input.photoUrl && input.photoUrl.trim() ? input.photoUrl.trim() : null,
    current_mileage: input.currentMileage ? Math.floor(input.currentMileage) : 0,
    fuel_type: fuelType,
    status,
    is_active: input.isActive ?? true,
  };

  const { data, error } = await admin
    .from("vehicles")
    .insert(insertPayload)
    .select(`
      *,
      category:vehicle_categories(id, name, daily_rate, deposit_amount, currency, photo_url),
      branch:business_branches(id, label)
    `)
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: `License plate "${licensePlate}" already exists` };
    }
    if (isMissingTableError(error)) {
      return { success: false, error: "Rental engine schema is not applied yet (Migration 224 required)" };
    }
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${input.organizerId}/fleet`);

  return { success: true, data };
}

export async function updateVehicle(
  input: UpdateVehicleInput
): Promise<{ success: boolean; data?: VehicleRow; error?: string }> {
  try {
    await verifyAuth(input.organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const admin = createSupabaseAdmin();

  // 1. Fetch current vehicle
  const { data: existing, error: fetchErr } = await admin
    .from("vehicles")
    .select("id, business_id, license_plate")
    .eq("id", input.vehicleId)
    .eq("organizer_id", input.organizerId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, error: "Vehicle not found" };
  }

  const updateFields: Record<string, unknown> = {};

  if (input.make !== undefined) {
    const make = input.make.trim();
    if (make.length < 1 || make.length > 60) return { success: false, error: "Make must be 1-60 characters" };
    updateFields.make = make;
  }

  if (input.model !== undefined) {
    const model = input.model.trim();
    if (model.length < 1 || model.length > 60) return { success: false, error: "Model must be 1-60 characters" };
    updateFields.model = model;
  }

  if (input.year !== undefined) {
    const currentYear = new Date().getFullYear();
    if (input.year < 1900 || input.year > currentYear + 2) return { success: false, error: "Invalid year" };
    updateFields.year = input.year;
  }

  if (input.licensePlate !== undefined) {
    const plate = input.licensePlate.trim().toUpperCase();
    if (plate.length < 1 || plate.length > 20) return { success: false, error: "License plate must be 1-20 characters" };
    if (plate !== existing.license_plate) {
      // Check unique for business
      const { data: conflict } = await admin
        .from("vehicles")
        .select("id")
        .eq("business_id", existing.business_id)
        .eq("license_plate", plate)
        .neq("id", input.vehicleId)
        .maybeSingle();

      if (conflict) {
        return { success: false, error: `License plate "${plate}" is already in use by another vehicle` };
      }
      updateFields.license_plate = plate;
    }
  }

  if (input.categoryId !== undefined) {
    const { data: cat } = await admin
      .from("vehicle_categories")
      .select("id")
      .eq("id", input.categoryId)
      .eq("organizer_id", input.organizerId)
      .maybeSingle();

    if (!cat) return { success: false, error: "Invalid vehicle category" };
    updateFields.category_id = input.categoryId;
  }

  if (input.branchId !== undefined) {
    if (input.branchId) {
      const { data: branch } = await admin
        .from("business_branches")
        .select("id")
        .eq("id", input.branchId)
        .eq("business_id", existing.business_id)
        .maybeSingle();

      if (!branch) return { success: false, error: "Invalid branch location" };
      updateFields.branch_id = input.branchId;
    } else {
      updateFields.branch_id = null;
    }
  }

  if (input.vin !== undefined) {
    updateFields.vin = input.vin ? input.vin.trim().toUpperCase().slice(0, 25) : null;
  }

  if (input.color !== undefined) {
    updateFields.color = input.color ? input.color.trim().slice(0, 40) : null;
  }

  // Omitted (key not sent) leaves the stored photo untouched — only an
  // explicit null/"" clears it. Callers that don't manage photos (e.g.
  // updateVehicleStatus-style flows) never need to send this field.
  if (input.photoUrl !== undefined) {
    updateFields.photo_url = input.photoUrl && input.photoUrl.trim() ? input.photoUrl.trim() : null;
  }

  if (input.currentMileage !== undefined) {
    if (input.currentMileage < 0 || !Number.isInteger(input.currentMileage)) {
      return { success: false, error: "Current mileage must be a non-negative integer" };
    }
    updateFields.current_mileage = Math.floor(input.currentMileage);
  }

  if (input.fuelType !== undefined) {
    const allowedFuel: VehicleFuelType[] = ["gasoline", "diesel", "electric", "hybrid"];
    if (!allowedFuel.includes(input.fuelType)) return { success: false, error: "Invalid fuel type" };
    updateFields.fuel_type = input.fuelType;
  }

  if (input.status !== undefined) {
    const allowedStatuses: VehicleStatus[] = ["available", "rented", "maintenance", "out_of_service"];
    if (!allowedStatuses.includes(input.status)) return { success: false, error: "Invalid status" };
    updateFields.status = input.status;
  }

  if (input.isActive !== undefined) {
    updateFields.is_active = Boolean(input.isActive);
  }

  const { data, error } = await admin
    .from("vehicles")
    .update(updateFields)
    .eq("id", input.vehicleId)
    .eq("organizer_id", input.organizerId)
    .select(`
      *,
      category:vehicle_categories(id, name, daily_rate, deposit_amount, currency, photo_url),
      branch:business_branches(id, label)
    `)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${input.organizerId}/fleet`);

  return { success: true, data };
}

export async function updateVehicleStatus(
  vehicleId: string,
  organizerId: string,
  status: VehicleStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    await verifyAuth(organizerId, WRITE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const allowedStatuses: VehicleStatus[] = ["available", "rented", "maintenance", "out_of_service"];
  if (!allowedStatuses.includes(status)) {
    return { success: false, error: "Invalid status value" };
  }

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("vehicles")
    .update({ status })
    .eq("id", vehicleId)
    .eq("organizer_id", organizerId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${organizerId}/fleet`);
  return { success: true };
}

export async function deleteVehicle(
  vehicleId: string,
  organizerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await verifyAuth(organizerId, MANAGE_ROLES);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const admin = createSupabaseAdmin();

  // Guard: Cannot delete vehicle if referenced by bookings or maintenance blocks
  try {
    const { data: bookingExists } = await admin
      .from("rental_bookings")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .in("status", ["pending", "awaiting_payment", "confirmed", "active", "completed"])
      .limit(1);

    if (bookingExists && bookingExists.length > 0) {
      return {
        success: false,
        error: "Cannot delete vehicle with existing rental bookings. Deactivate it instead.",
      };
    }

    const { data: blockExists } = await admin
      .from("rental_blocks")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .limit(1);

    if (blockExists && blockExists.length > 0) {
      return {
        success: false,
        error: "Cannot delete vehicle with existing maintenance blocks. Remove blocks first.",
      };
    }
  } catch {
    // If tables do not exist yet, proceed
  }

  const { error } = await admin
    .from("vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("organizer_id", organizerId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/org/${organizerId}/fleet`);
  return { success: true };
}
