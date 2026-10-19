/**
 * lib/menu-pricing.ts
 *
 * Pure, authoritative pricing and option-group validation engine for menu items.
 * Shared between client calculations, server action input validation, and
 * upcoming order validation (Phase 2b-2). Zero client trust.
 */

export interface MenuItemOption {
  id: string;
  name: string;
  price_delta: number;
}

export interface MenuItemOptionGroup {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: MenuItemOption[];
}

export interface MenuPricingItem {
  id?: string;
  price: number;
  promo_price?: number | null;
  is_sold_out?: boolean;
  option_groups?: readonly MenuItemOptionGroup[] | null;
}

export interface OptionGroupSelection {
  groupId: string;
  optionIds: readonly string[];
}

export const MAX_OPTION_GROUPS = 8;
export const MAX_OPTIONS_PER_GROUP = 20;
export const MIN_ORDER_QUANTITY = 1;
export const MAX_LINE_QUANTITY = 50;

/**
 * Validates promo price against the item base price.
 * Promo price must be >= 0 and strictly less than base price.
 */
export function validatePromoPrice(
  promoPrice: unknown,
  basePrice: number
): string | null {
  if (promoPrice === undefined || promoPrice === null || promoPrice === "") {
    return null;
  }
  const numericPromo = Number(promoPrice);
  if (!Number.isFinite(numericPromo)) {
    return "Promo price must be a valid number";
  }
  if (numericPromo < 0) {
    return "Promo price cannot be negative";
  }
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    return "Base price must be a non-negative number";
  }
  if (numericPromo >= basePrice) {
    return "Promo price must be strictly less than the regular price";
  }
  return null;
}

/**
 * Validates option_groups array structure matching migration 170 constraints:
 * - array <= 8 groups
 * - each group: id & name 1-80, required bool, min & max int >= 0, min <= max <= options.length <= 20
 * - required implies min >= 1
 * - each option: id & name 1-80, price_delta -10000..10000
 */
export function validateOptionGroups(groups: unknown): string | null {
  if (groups === undefined || groups === null) return null;
  if (!Array.isArray(groups)) return "Option groups must be an array";
  if (groups.length > MAX_OPTION_GROUPS) {
    return `Maximum of ${MAX_OPTION_GROUPS} option groups allowed`;
  }

  const seenGroupIds = new Set<string>();

  for (let i = 0; i < groups.length; i++) {
    const grp = groups[i];
    if (!grp || typeof grp !== "object") {
      return `Option group #${i + 1} must be an object`;
    }

    const { id, name, required, min, max, options } = grp as Record<string, unknown>;

    if (typeof id !== "string" || id.trim().length < 1 || id.trim().length > 80) {
      return `Option group #${i + 1} ID must be 1–80 characters`;
    }
    const trimmedId = id.trim();
    if (seenGroupIds.has(trimmedId)) {
      return `Duplicate option group ID: "${trimmedId}"`;
    }
    seenGroupIds.add(trimmedId);

    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 80) {
      return `Option group "${trimmedId}" name must be 1–80 characters`;
    }

    if (typeof required !== "boolean") {
      return `Option group "${name}" required flag must be a boolean`;
    }

    if (typeof min !== "number" || !Number.isInteger(min) || min < 0) {
      return `Option group "${name}" min must be an integer >= 0`;
    }

    if (typeof max !== "number" || !Number.isInteger(max) || max < min) {
      return `Option group "${name}" max must be an integer >= min`;
    }

    if (required && min < 1) {
      return `Option group "${name}" is required and must have min >= 1`;
    }

    if (!Array.isArray(options)) {
      return `Option group "${name}" options must be an array`;
    }

    if (options.length > MAX_OPTIONS_PER_GROUP) {
      return `Option group "${name}" can have at most ${MAX_OPTIONS_PER_GROUP} options`;
    }

    if (max > options.length) {
      return `Option group "${name}" max (${max}) cannot exceed total options count (${options.length})`;
    }

    const seenOptionIds = new Set<string>();

    for (let j = 0; j < options.length; j++) {
      const opt = options[j];
      if (!opt || typeof opt !== "object") {
        return `Option #${j + 1} in "${name}" must be an object`;
      }
      const { id: optId, name: optName, price_delta } = opt as Record<string, unknown>;

      if (typeof optId !== "string" || optId.trim().length < 1 || optId.trim().length > 80) {
        return `Option #${j + 1} in "${name}" ID must be 1–80 characters`;
      }
      const trimmedOptId = optId.trim();
      if (seenOptionIds.has(trimmedOptId)) {
        return `Duplicate option ID "${trimmedOptId}" in group "${name}"`;
      }
      seenOptionIds.add(trimmedOptId);

      if (typeof optName !== "string" || optName.trim().length < 1 || optName.trim().length > 80) {
        return `Option "${trimmedOptId}" in "${name}" name must be 1–80 characters`;
      }

      const delta = Number(price_delta);
      if (!Number.isFinite(delta) || delta < -10000 || delta > 10000) {
        return `Option "${optName}" in "${name}" price_delta must be between -10000 and 10000`;
      }
    }
  }

  return null;
}

/**
 * Returns the effective unit price of a menu item.
 * If promo_price is defined, valid, and strictly less than price, returns promo_price;
 * otherwise returns price.
 */
export function effectiveUnitPrice(
  item: Pick<MenuPricingItem, "price" | "promo_price">
): number {
  const base = Number(item.price);
  if (
    item.promo_price !== null &&
    item.promo_price !== undefined &&
    typeof item.promo_price === "number" &&
    Number.isFinite(item.promo_price) &&
    item.promo_price >= 0 &&
    item.promo_price < base
  ) {
    return Math.round(item.promo_price * 100) / 100;
  }
  return Math.round(base * 100) / 100;
}

export function calculateOptionAdjustedUnitPrice(unitPrice: number, optionsDelta: number): number {
  const roundedUnitPrice = Math.round(unitPrice * 100) / 100;
  const roundedOptionsDelta = Math.round(optionsDelta * 100) / 100;
  return Math.max(0, roundedUnitPrice + roundedOptionsDelta);
}

export function calculateMenuLineTotal(unitPrice: number, quantity: number): number {
  return Math.round(unitPrice * quantity * 100) / 100;
}

export interface SelectionValidationResult {
  valid: boolean;
  error?: string;
}

export function isOptionGroupSelectionSatisfied(
  group: Pick<MenuItemOptionGroup, "required" | "min" | "max">,
  selectedCount: number
): boolean {
  const minimum = group.required ? Math.max(1, group.min) : group.min;
  return selectedCount >= minimum && selectedCount <= group.max;
}

/**
 * Validates a customer's option selections against the item's configured option groups:
 * - Checks that required groups have at least `min` (and >= 1) selections.
 * - Checks that selection counts satisfy `min <= count <= max`.
 * - Checks for unknown option IDs or unknown group IDs.
 * - Checks for duplicate selections.
 */
export function validateSelection(
  item: MenuPricingItem,
  selections?: readonly OptionGroupSelection[] | null
): SelectionValidationResult {
  const groups = item.option_groups ?? [];
  const groupMap = new Map<string, MenuItemOptionGroup>();
  for (const g of groups) {
    groupMap.set(g.id, g);
  }

  const selectionMap = new Map<string, readonly string[]>();
  if (selections) {
    for (const sel of selections) {
      if (selectionMap.has(sel.groupId)) {
        return { valid: false, error: `Duplicate selection for group ID: "${sel.groupId}"` };
      }
      if (!groupMap.has(sel.groupId)) {
        return { valid: false, error: `Unknown option group ID: "${sel.groupId}"` };
      }
      selectionMap.set(sel.groupId, sel.optionIds);
    }
  }

  for (const group of groups) {
    const selectedIds = selectionMap.get(group.id) ?? [];
    const count = selectedIds.length;

    // Duplicate option id check within selection
    const uniqueIds = new Set(selectedIds);
    if (uniqueIds.size !== count) {
      return { valid: false, error: `Duplicate option selections in group "${group.name}"` };
    }

    // Verify all selected option IDs exist in this group
    const validOptionIds = new Set(group.options.map((o) => o.id));
    for (const optId of selectedIds) {
      if (!validOptionIds.has(optId)) {
        return { valid: false, error: `Unknown option ID "${optId}" in group "${group.name}"` };
      }
    }

    if (!isOptionGroupSelectionSatisfied(group, count)) {
      const minimum = group.required ? Math.max(1, group.min) : group.min;
      if (count < minimum) {
        if (group.required) {
          return { valid: false, error: `Selection required for "${group.name}" (minimum ${minimum})` };
        }
        return { valid: false, error: `Minimum ${minimum} selection(s) required for "${group.name}"` };
      }
      return { valid: false, error: `Maximum ${group.max} selection(s) allowed for "${group.name}"` };
    }
  }

  return { valid: true };
}

export interface LineTotalCalculation {
  unitPrice: number;
  optionsDelta: number;
  lineTotal: number;
}

/**
 * Authoritative server calculation for line total:
 * - Validates quantity is integer in [1, MAX_LINE_QUANTITY].
 * - Validates option selections.
 * - (effectiveUnitPrice + sum(options.price_delta)) * quantity, rounded to 2 decimals.
 */
export function computeLineTotal(params: {
  item: MenuPricingItem;
  selection?: readonly OptionGroupSelection[] | null;
  quantity: number;
}): LineTotalCalculation {
  const { item, selection, quantity } = params;

  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < MIN_ORDER_QUANTITY ||
    quantity > MAX_LINE_QUANTITY
  ) {
    throw new Error(`Quantity must be an integer between ${MIN_ORDER_QUANTITY} and ${MAX_LINE_QUANTITY}`);
  }

  const validation = validateSelection(item, selection);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid option selection");
  }

  const unitPrice = effectiveUnitPrice(item);

  // Compute option deltas
  let optionsDelta = 0;
  if (selection && item.option_groups) {
    const groupMap = new Map(item.option_groups.map((g) => [g.id, g]));
    for (const sel of selection) {
      const group = groupMap.get(sel.groupId);
      if (!group) continue;
      const optionMap = new Map(group.options.map((o) => [o.id, o]));
      for (const optId of sel.optionIds) {
        const opt = optionMap.get(optId);
        if (opt) {
          optionsDelta += Number(opt.price_delta);
        }
      }
    }
  }

  optionsDelta = Math.round(optionsDelta * 100) / 100;
  const singleItemPrice = calculateOptionAdjustedUnitPrice(unitPrice, optionsDelta);
  const lineTotal = calculateMenuLineTotal(singleItemPrice, quantity);

  return {
    unitPrice,
    optionsDelta,
    lineTotal,
  };
}
