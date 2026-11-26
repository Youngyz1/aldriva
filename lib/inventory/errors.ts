/**
 * lib/inventory/errors.ts
 *
 * Maps database errors from the inventory module (migration 268) to a plain
 * English message and a stable code the UI translates (next-intl,
 * "Inventory" namespace, err* keys). Never surfaces raw database text.
 * Plain TS, no "use server" and no server-only imports.
 *
 * The primary signal is the machine-readable HINT that inventory_apply_movement
 * and inventory_ensure_default_location raise. SQLSTATE and constraint names
 * are the fallback for plain constraint and RLS failures.
 */

export type InventoryDbError = {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
};

export type InventoryError = {
  code: string;
  message: string;
};

const HINT_ERRORS: Record<string, InventoryError> = {
  inventory_forbidden: { code: "not_allowed", message: "You don't have permission to do that." },
  inventory_insufficient_stock: { code: "insufficient_stock", message: "There isn't enough stock to remove that quantity." },
  inventory_bad_quantity: { code: "bad_quantity", message: "Enter a quantity above zero with at most 3 decimals." },
  inventory_bad_sign: { code: "bad_sign", message: "That quantity doesn't match the type of movement." },
  inventory_bad_type: { code: "bad_type", message: "Choose a valid type of movement." },
  inventory_location_archived: { code: "location_archived", message: "That location is archived." },
  inventory_item_not_found: { code: "item_not_found", message: "That item was not found in this business." },
  inventory_item_inactive: { code: "item_inactive", message: "That item is inactive. Reactivate it before changing its stock." },
  inventory_default_location_conflict: { code: "default_location_conflict", message: "A location named Main storage already exists. Rename it first." },
  inventory_immutable_owner: { code: "generic_error", message: "Something went wrong. Please try again." },
};

const UQ_SKU = "inventory_items_business_sku_uidx";
const UQ_LOCATION_NAME = "inventory_locations_business_name_uidx";
const UQ_ONE_DEFAULT = "inventory_locations_one_default_uidx";

export const INVENTORY_NOT_FOUND_OR_DENIED: InventoryError = {
  code: "not_found_or_denied",
  message: "You don't have permission to do that, or this item no longer exists.",
};

export function mapInventoryError(error: InventoryDbError): InventoryError {
  const message = error.message ?? "";
  const code = error.code ?? "";

  const hint = (error.hint ?? "").trim();
  if (hint && Object.prototype.hasOwnProperty.call(HINT_ERRORS, hint)) return { ...HINT_ERRORS[hint] };

  if (code === "23505") {
    if (message.includes(UQ_SKU)) return { code: "sku_exists", message: "Another item in this business already uses that SKU." };
    if (message.includes(UQ_LOCATION_NAME)) return { code: "location_name_exists", message: "A location with that name already exists." };
    if (message.includes(UQ_ONE_DEFAULT)) return { code: "default_location_exists", message: "This business already has a default location." };
    return { code: "generic_error", message: "Something went wrong. Please try again." };
  }
  if (code === "23514") return { code: "invalid_input", message: "Some of the values are not valid." };
  if (code === "23503") return { code: "branch_mismatch", message: "That branch or item doesn't belong to this business." };
  if (code === "42501") return { code: "not_allowed", message: "You don't have permission to do that." };
  return { code: "generic_error", message: "Something went wrong. Please try again." };
}