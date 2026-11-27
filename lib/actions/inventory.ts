"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { mapInventoryError, INVENTORY_NOT_FOUND_OR_DENIED } from "@/lib/inventory/errors";
import type { ActionResult } from "@/lib/actions/staff-members";

// Inventory foundation (migration 268). Uses the caller's session client, so
// the RLS policies and inventory_apply_movement decide who can read and
// write. The code here adds the reach gate, input validation and readable
// errors only. This file may export only async functions and types.

export type InventoryItemType =
  | "product" | "raw_material" | "supply" | "packaging" | "asset" | "spare_part" | "internal";

export type MovementType =
  | "opening" | "received" | "returned_in" | "transfer_in"
  | "sold" | "consumed" | "transfer_out" | "returned_out" | "damaged" | "expired" | "lost"
  | "adjustment";

export type InventoryItemRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  unit: string;
  item_type: InventoryItemType;
  min_stock: number;
  reorder_quantity: number | null;
  cost_price: number | null;
  selling_price: number | null;
  is_active: boolean;
};

export type InventoryLocationRow = {
  id: string;
  name: string;
  branch_id: string | null;
  is_default: boolean;
  status: "active" | "archived";
};

export type InventoryBalanceRow = {
  item_id: string;
  location_id: string;
  on_hand: number;
  reserved: number;
};

export type InventorySnapshot = {
  items: InventoryItemRow[];
  locations: InventoryLocationRow[];
  balances: InventoryBalanceRow[];
};

export type CreateInventoryItemInput = {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  description?: string | null;
  item_type?: InventoryItemType;
  unit?: string;
  cost_price?: number | null;
  selling_price?: number | null;
  min_stock?: number;
  reorder_quantity?: number | null;
};

export type AdjustStockInput = {
  item_id: string;
  location_id: string;
  type: MovementType;
  // Positive amount for every type except "adjustment", which is signed.
  quantity: number;
  reason?: string | null;
  unit_cost?: number | null;
};

const ITEM_SELECT =
  "id, name, sku, barcode, category, unit, item_type, min_stock, reorder_quantity, cost_price, selling_price, is_active";
const LOCATION_SELECT = "id, name, branch_id, is_default, status";
const BALANCE_SELECT = "item_id, location_id, on_hand, reserved";
const ROW_LIMIT = 2000;

const ITEM_TYPES: readonly string[] = ["product", "raw_material", "supply", "packaging", "asset", "spare_part", "internal"];
const IN_TYPES: readonly string[] = ["opening", "received", "returned_in", "transfer_in"];
const OUT_TYPES: readonly string[] = ["sold", "consumed", "transfer_out", "returned_out", "damaged", "expired", "lost"];
const MAX_QUANTITY = 99999999999; // numeric(14,3) holds 11 integer digits

type FieldError = { code: string; message: string };

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function mapItem(row: Record<string, unknown>): InventoryItemRow {
  return {
    id: String(row.id),
    name: String(row.name),
    sku: (row.sku as string | null) ?? null,
    barcode: (row.barcode as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    unit: String(row.unit),
    item_type: row.item_type as InventoryItemType,
    min_stock: num(row.min_stock),
    reorder_quantity: row.reorder_quantity == null ? null : num(row.reorder_quantity),
    cost_price: row.cost_price == null ? null : num(row.cost_price),
    selling_price: row.selling_price == null ? null : num(row.selling_price),
    is_active: Boolean(row.is_active),
  };
}

function cleanText(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t.length > 0 ? t : null;
}

function hasAtMostDecimals(value: number, places: number): boolean {
  return Number(value.toFixed(places)) === value;
}

function validateItem(input: CreateInventoryItemInput): FieldError | null {
  const name = (input.name ?? "").trim();
  if (name.length < 1 || name.length > 200) return { code: "item_name_invalid", message: "Enter a name of up to 200 characters." };
  const sku = cleanText(input.sku);
  if (sku && sku.length > 64) return { code: "item_sku_invalid", message: "The SKU can be at most 64 characters." };
  const barcode = cleanText(input.barcode);
  if (barcode && barcode.length > 64) return { code: "item_barcode_invalid", message: "The barcode can be at most 64 characters." };
  const category = cleanText(input.category);
  if (category && category.length > 100) return { code: "item_category_invalid", message: "The category can be at most 100 characters." };
  const description = cleanText(input.description);
  if (description && description.length > 1000) return { code: "item_description_invalid", message: "The description can be at most 1000 characters." };
  if (input.item_type !== undefined && !ITEM_TYPES.includes(input.item_type)) return { code: "item_type_invalid", message: "Choose a valid item type." };
  const unit = (input.unit ?? "piece").trim();
  if (unit.length < 1 || unit.length > 30) return { code: "item_unit_invalid", message: "Enter a unit of up to 30 characters." };
  for (const [key, value] of [["cost_price", input.cost_price], ["selling_price", input.selling_price], ["reorder_quantity", input.reorder_quantity]] as const) {
    if (value != null && (!Number.isFinite(value) || value < 0 || value > MAX_QUANTITY)) {
      return { code: key === "reorder_quantity" ? "item_reorder_invalid" : "item_price_invalid", message: "Enter a number of zero or more." };
    }
  }
  if (input.min_stock != null && (!Number.isFinite(input.min_stock) || input.min_stock < 0 || input.min_stock > MAX_QUANTITY || !hasAtMostDecimals(input.min_stock, 3))) {
    return { code: "item_min_stock_invalid", message: "Enter a minimum stock of zero or more, with at most 3 decimals." };
  }
  return null;
}

function revalidateInventory() {
  revalidatePath("/dashboard/org/[id]/inventory", "page");
}

export async function listInventory(businessId: string): Promise<ActionResult<InventorySnapshot>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const [items, locations, balances] = await Promise.all([
    supabase.from("inventory_items").select(ITEM_SELECT).eq("business_id", businessId).order("name", { ascending: true }).limit(ROW_LIMIT),
    supabase.from("inventory_locations").select(LOCATION_SELECT).eq("business_id", businessId).order("name", { ascending: true }).limit(ROW_LIMIT),
    supabase.from("inventory_balances").select(BALANCE_SELECT).eq("business_id", businessId).limit(ROW_LIMIT * 5),
  ]);

  const failed = items.error ?? locations.error ?? balances.error;
  if (failed) {
    console.error("[listInventory]", failed.message);
    return { success: false, error: "Could not load inventory. Please try again.", code: "generic_error" };
  }

  return {
    success: true,
    data: {
      items: ((items.data ?? []) as unknown as Record<string, unknown>[]).map(mapItem),
      locations: (locations.data ?? []) as unknown as InventoryLocationRow[],
      balances: ((balances.data ?? []) as unknown as Record<string, unknown>[]).map((b) => ({
        item_id: String(b.item_id),
        location_id: String(b.location_id),
        on_hand: num(b.on_hand),
        reserved: num(b.reserved),
      })),
    },
  };
}

// Creates the "Main storage" location on first use. Safe to call repeatedly.
export async function ensureDefaultLocation(businessId: string): Promise<ActionResult<{ location_id: string }>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("inventory_ensure_default_location", { p_business_id: businessId });
  if (error) {
    const mapped = mapInventoryError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  revalidateInventory();
  return { success: true, data: { location_id: String(data) } };
}

export async function createInventoryItem(
  businessId: string,
  input: CreateInventoryItemInput
): Promise<ActionResult<InventoryItemRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const invalid = validateItem(input);
  if (invalid) return { success: false, error: invalid.message, code: invalid.code };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      business_id: businessId,
      name: input.name.trim(),
      sku: cleanText(input.sku),
      barcode: cleanText(input.barcode),
      category: cleanText(input.category),
      description: cleanText(input.description),
      item_type: input.item_type ?? "supply",
      unit: (input.unit ?? "piece").trim(),
      cost_price: input.cost_price ?? null,
      selling_price: input.selling_price ?? null,
      min_stock: input.min_stock ?? 0,
      reorder_quantity: input.reorder_quantity ?? null,
      created_by: auth.userId,
    })
    .select(ITEM_SELECT)
    .single();

  if (error) {
    const mapped = mapInventoryError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  revalidateInventory();
  return { success: true, data: mapItem(data as unknown as Record<string, unknown>) };
}

// Edits an item's details. Stock is never changed here; that only happens
// through adjustStock. The UPDATE policy decides who may do this.
export type UpdateInventoryItemInput = CreateInventoryItemInput;

export async function updateInventoryItem(
  businessId: string,
  itemId: string,
  input: UpdateInventoryItemInput
): Promise<ActionResult<InventoryItemRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const invalid = validateItem(input);
  if (invalid) return { success: false, error: invalid.message, code: invalid.code };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("inventory_items")
    .update({
      name: input.name.trim(),
      sku: cleanText(input.sku),
      category: cleanText(input.category),
      item_type: input.item_type ?? "supply",
      unit: (input.unit ?? "piece").trim(),
      cost_price: input.cost_price ?? null,
      selling_price: input.selling_price ?? null,
      min_stock: input.min_stock ?? 0,
      reorder_quantity: input.reorder_quantity ?? null,
    })
    .eq("id", itemId)
    .eq("business_id", businessId)
    .select(ITEM_SELECT);

  if (error) {
    const mapped = mapInventoryError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) {
    return { success: false, error: INVENTORY_NOT_FOUND_OR_DENIED.message, code: INVENTORY_NOT_FOUND_OR_DENIED.code };
  }
  revalidateInventory();
  return { success: true, data: mapItem(rows[0]) };
}

// Turns an item off (or back on). Items are never deleted.
export async function setInventoryItemActive(
  businessId: string,
  itemId: string,
  isActive: boolean
): Promise<ActionResult<InventoryItemRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  // A row hidden by the UPDATE policy returns zero rows, not an error.
  const { data, error } = await supabase
    .from("inventory_items")
    .update({ is_active: isActive })
    .eq("id", itemId)
    .eq("business_id", businessId)
    .select(ITEM_SELECT);

  if (error) {
    const mapped = mapInventoryError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) {
    return { success: false, error: INVENTORY_NOT_FOUND_OR_DENIED.message, code: INVENTORY_NOT_FOUND_OR_DENIED.code };
  }
  revalidateInventory();
  return { success: true, data: mapItem(rows[0]) };
}

// The only way stock changes: inventory_apply_movement locks the balance row,
// checks permission at the location's branch and refuses negative stock.
export async function adjustStock(
  businessId: string,
  input: AdjustStockInput
): Promise<ActionResult<{ movement_id: string }>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const isIn = IN_TYPES.includes(input.type);
  const isOut = OUT_TYPES.includes(input.type);
  if (!isIn && !isOut && input.type !== "adjustment") {
    return { success: false, error: "Choose a valid type of movement.", code: "bad_type" };
  }
  const q = input.quantity;
  if (typeof q !== "number" || !Number.isFinite(q) || q === 0 || Math.abs(q) > MAX_QUANTITY || !hasAtMostDecimals(q, 3)) {
    return { success: false, error: "Enter a quantity above zero with at most 3 decimals.", code: "bad_quantity" };
  }
  const signed = input.type === "adjustment" ? q : isIn ? Math.abs(q) : -Math.abs(q);
  const reason = cleanText(input.reason);
  if (reason && reason.length > 500) {
    return { success: false, error: "The reason can be at most 500 characters.", code: "reason_too_long" };
  }
  const unitCost = input.unit_cost ?? null;
  if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
    return { success: false, error: "Enter a cost of zero or more.", code: "item_price_invalid" };
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("inventory_apply_movement", {
    p_business_id: businessId,
    p_item_id: input.item_id,
    p_location_id: input.location_id,
    p_type: input.type,
    p_quantity: signed,
    p_reason: reason,
    p_unit_cost: unitCost,
  });
  if (error) {
    const mapped = mapInventoryError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  revalidateInventory();
  return { success: true, data: { movement_id: String(data) } };
}

export type InventoryMovementRow = {
  id: string;
  location_id: string;
  movement_type: MovementType;
  quantity: number;
  balance_after: number;
  unit_cost: number | null;
  reason: string | null;
  created_at: string;
  created_by_name: string | null;
  by_me: boolean;
};

export type InventoryItemDetail = {
  item: InventoryItemRow;
  locations: InventoryLocationRow[];
  balances: InventoryBalanceRow[];
  movements: InventoryMovementRow[];
};

const MOVEMENT_LIMIT = 200;

// One item with its balances and its newest movements. Reads use the caller's
// session, so RLS decides what is visible (a branch manager sees only their
// branch). Names come from profiles via the admin client, only for user ids
// found on movements the caller was already allowed to read.
export async function getInventoryItemDetail(
  businessId: string,
  itemId: string
): Promise<ActionResult<InventoryItemDetail>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const itemRes = await supabase
    .from("inventory_items")
    .select(ITEM_SELECT)
    .eq("id", itemId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (itemRes.error) {
    console.error("[getInventoryItemDetail]", itemRes.error.message);
    return { success: false, error: "Could not load inventory. Please try again.", code: "generic_error" };
  }
  if (!itemRes.data) {
    return { success: false, error: INVENTORY_NOT_FOUND_OR_DENIED.message, code: INVENTORY_NOT_FOUND_OR_DENIED.code };
  }

  const [locations, balances, movements] = await Promise.all([
    supabase.from("inventory_locations").select(LOCATION_SELECT).eq("business_id", businessId).order("name", { ascending: true }).limit(ROW_LIMIT),
    supabase.from("inventory_balances").select(BALANCE_SELECT).eq("business_id", businessId).eq("item_id", itemId),
    supabase
      .from("inventory_movements")
      .select("id, location_id, movement_type, quantity, balance_after, unit_cost, reason, created_by, created_at")
      .eq("business_id", businessId)
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(MOVEMENT_LIMIT),
  ]);
  const failed = locations.error ?? balances.error ?? movements.error;
  if (failed) {
    console.error("[getInventoryItemDetail]", failed.message);
    return { success: false, error: "Could not load inventory. Please try again.", code: "generic_error" };
  }

  const moveRows = (movements.data ?? []) as unknown as Record<string, unknown>[];
  const ids = Array.from(new Set(moveRows.map((m) => m.created_by).filter((v): v is string => typeof v === "string")));
  const names = new Map<string, string>();
  if (ids.length > 0) {
    try {
      const { data: profiles } = await createSupabaseAdmin().from("profiles").select("id, display_name").in("id", ids);
      for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name && p.display_name.trim()) names.set(p.id, p.display_name.trim());
      }
    } catch (err) {
      console.error("[getInventoryItemDetail] name lookup failed:", err instanceof Error ? err.message : err);
    }
  }

  return {
    success: true,
    data: {
      item: mapItem(itemRes.data as unknown as Record<string, unknown>),
      locations: (locations.data ?? []) as unknown as InventoryLocationRow[],
      balances: ((balances.data ?? []) as unknown as Record<string, unknown>[]).map((b) => ({
        item_id: String(b.item_id),
        location_id: String(b.location_id),
        on_hand: num(b.on_hand),
        reserved: num(b.reserved),
      })),
      movements: moveRows.map((m) => {
        const by = typeof m.created_by === "string" ? m.created_by : null;
        return {
          id: String(m.id),
          location_id: String(m.location_id),
          movement_type: m.movement_type as MovementType,
          quantity: num(m.quantity),
          balance_after: num(m.balance_after),
          unit_cost: m.unit_cost == null ? null : num(m.unit_cost),
          reason: (m.reason as string | null) ?? null,
          created_at: String(m.created_at),
          created_by_name: by ? names.get(by) ?? null : null,
          by_me: by !== null && by === auth.userId,
        };
      }),
    },
  };
}

// ---- Locations (Phase 2). The database decides who may write (RLS and the
// archive guard trigger); these actions only validate shape and map errors.
export type InventoryLocationInput = {
  name: string;
  branch_id?: string | null;
};

function validateLocationName(name: string): { code: string; message: string } | null {
  const n = (name ?? "").trim();
  if (n.length < 1 || n.length > 100) {
    return { code: "invalid_input", message: "Enter a name of 1 to 100 characters." };
  }
  return null;
}

export async function createInventoryLocation(
  businessId: string,
  input: InventoryLocationInput
): Promise<ActionResult<InventoryLocationRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };
  const invalid = validateLocationName(input.name);
  if (invalid) return { success: false, error: invalid.message, code: invalid.code };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("inventory_locations")
    .insert({
      business_id: businessId,
      name: input.name.trim(),
      branch_id: input.branch_id ?? null,
      is_default: false,
      status: "active",
    })
    .select(LOCATION_SELECT);
  if (error) {
    const mapped = mapInventoryError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as unknown as InventoryLocationRow[];
  if (rows.length === 0) {
    return { success: false, error: INVENTORY_NOT_FOUND_OR_DENIED.message, code: INVENTORY_NOT_FOUND_OR_DENIED.code };
  }
  revalidateInventory();
  return { success: true, data: rows[0] };
}

// Renames a location and, only when branch_id is given, relinks it to a branch
// (null means business-wide). Stock and status are never touched here.
export async function updateInventoryLocation(
  businessId: string,
  locationId: string,
  input: InventoryLocationInput
): Promise<ActionResult<InventoryLocationRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };
  const invalid = validateLocationName(input.name);
  if (invalid) return { success: false, error: invalid.message, code: invalid.code };

  const patch: { name: string; branch_id?: string | null } = { name: input.name.trim() };
  if (input.branch_id !== undefined) patch.branch_id = input.branch_id;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("inventory_locations")
    .update(patch)
    .eq("id", locationId)
    .eq("business_id", businessId)
    .select(LOCATION_SELECT);
  if (error) {
    const mapped = mapInventoryError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as unknown as InventoryLocationRow[];
  if (rows.length === 0) {
    return { success: false, error: INVENTORY_NOT_FOUND_OR_DENIED.message, code: INVENTORY_NOT_FOUND_OR_DENIED.code };
  }
  revalidateInventory();
  return { success: true, data: rows[0] };
}

// Archives or restores a location. Migration 269's trigger refuses archiving
// the default location or one that still holds stock.
export async function setInventoryLocationArchived(
  businessId: string,
  locationId: string,
  archived: boolean
): Promise<ActionResult<InventoryLocationRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("inventory_locations")
    .update({ status: archived ? "archived" : "active" })
    .eq("id", locationId)
    .eq("business_id", businessId)
    .select(LOCATION_SELECT);
  if (error) {
    const mapped = mapInventoryError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as unknown as InventoryLocationRow[];
  if (rows.length === 0) {
    return { success: false, error: INVENTORY_NOT_FOUND_OR_DENIED.message, code: INVENTORY_NOT_FOUND_OR_DENIED.code };
  }
  revalidateInventory();
  return { success: true, data: rows[0] };
}
