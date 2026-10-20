import { resolveBasePrice, roundToCurrencyMinorUnit } from "./menu-promotions";
import type { MenuPromotion } from "./menu-promotions";

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
  description?: string | null;
  image_url?: string | null;
  allergens?: readonly string[];
  /** Full unit price for variants; add-on amount for normalized add-ons. */
  price?: number;
  is_default?: boolean;
  max_qty?: number;
  is_available?: boolean;
}

export type MenuOptionKind = "variant" | "addon";

export interface MenuItemOptionGroup {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  kind?: MenuOptionKind;
  options: MenuItemOption[];
}

export interface ResolvedOptionGroup extends MenuItemOptionGroup {
  kind: MenuOptionKind;
}

export interface NormalizedOptionAssignmentRow {
  id?: string;
  item_id: string;
  group_id: string;
  position?: number;
  hidden_option_ids?: readonly string[] | null;
  price_overrides?: Record<string, unknown> | null;
  group?: {
    id?: string;
    name: string;
    kind: MenuOptionKind;
    min_select: number;
    max_select: number;
    is_required: boolean;
    position?: number;
    is_active?: boolean;
    options?: readonly Record<string, unknown>[];
  } | null;
  menu_option_groups?: NormalizedOptionAssignmentRow["group"];
  options?: readonly Record<string, unknown>[];
}

export interface MenuPricingItem {
  id?: string;
  organizer_id?: string;
  section_id?: string | null;
  created_at?: string | null;
  price: number;
  promo_price?: number | null;
  is_sold_out?: boolean;
  options_source?: "json" | "normalized" | null;
  option_groups?: readonly MenuItemOptionGroup[] | null;
  promotions?: readonly import("./menu-promotions").MenuPromotion[];
}

export interface OptionGroupSelection {
  groupId: string;
  optionIds: readonly string[];
  selectedOptions?: readonly { optionId: string; qty: number }[];
}

export const MAX_OPTION_GROUPS = 8;
export const MAX_OPTIONS_PER_GROUP = 20;
export const MIN_ORDER_QUANTITY = 1;
export const MAX_LINE_QUANTITY = 50;

/**
 * Converts the selected source plus its rows into the shared pricing shape.
 * The persisted source marker is authoritative, including when a normalized
 * item currently has no assignments.
 */
export function resolveItemOptionGroups(
  item: MenuPricingItem & { id?: string },
  normalizedRows?: readonly NormalizedOptionAssignmentRow[] | null
): ResolvedOptionGroup[] {
  if (item.options_source !== "normalized") {
    return (item.option_groups || []).map((group) => ({
      ...group,
      kind: group.kind || "addon",
      options: group.options.map((option) => ({
        ...option,
        price: typeof option.price === "number" ? option.price : Number(option.price_delta) || 0,
        is_default: option.is_default === true,
        price_delta: group.kind === "variant" ? 0 : Number(option.price_delta) || 0,
        max_qty: option.max_qty ?? 1,
        is_available: option.is_available ?? true,
      })),
    }));
  }

  const assignments = (normalizedRows || []).filter((row) => !item.id || row.item_id === item.id);
  return assignments
    .map((assignment) => {
      const group = assignment.group ?? assignment.menu_option_groups;
      if (!group) return null;
      const hiddenIds = new Set(assignment.hidden_option_ids || []);
      const overrides = assignment.price_overrides || {};
      const sourceOptions = assignment.options || group.options || [];
      const options = sourceOptions
        .filter((option) => option.is_available !== false && !hiddenIds.has(String(option.id)))
        .map((option) => {
          const id = String(option.id);
          const rawPrice = Object.prototype.hasOwnProperty.call(overrides, id)
            ? overrides[id]
            : option.price;
          const price = Number(rawPrice) || 0;
          return {
            id,
            name: String(option.name || ""),
            price,
            is_default: option.is_default === true,
            price_delta: group.kind === "addon" ? price : 0,
            description: option.description == null ? null : String(option.description),
            image_url: option.image_url == null ? null : String(option.image_url),
            allergens: Array.isArray(option.allergens) ? option.allergens.map(String) : [],
            max_qty: Number(option.max_qty) || 1,
            is_available: option.is_available !== false,
          };
        })
        .sort((left, right) => Number(sourceOptions.find((option) => String(option.id) === left.id)?.position || 0) - Number(sourceOptions.find((option) => String(option.id) === right.id)?.position || 0));
      return {
        id: String(group.id || assignment.group_id),
        name: String(group.name || ""),
        kind: group.kind,
        required: Boolean(group.is_required),
        min: Number(group.min_select),
        max: Number(group.max_select),
        options,
        position: Number(assignment.position ?? group.position ?? 0),
      } as ResolvedOptionGroup & { position: number };
    })
    .filter((group): group is ResolvedOptionGroup & { position: number } => Boolean(group))
    .sort((left, right) => left.position - right.position)
    .map((group) => ({
      id: group.id,
      name: group.name,
      kind: group.kind,
      required: group.required,
      min: group.min,
      max: group.max,
      options: group.options,
    }));
}

function selectedQuantities(selection: OptionGroupSelection): Array<{ optionId: string; qty: number }> {
  if (selection.selectedOptions) return [...selection.selectedOptions];
  return (selection.optionIds || []).map((optionId) => ({ optionId, qty: 1 }));
}

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
  item: Pick<MenuPricingItem, "price" | "promo_price" | "option_groups"> & Partial<Pick<MenuPricingItem, "id" | "organizer_id" | "section_id" | "created_at" | "promotions">>,
  selection?: readonly OptionGroupSelection[] | null,
  pricingContext: MenuPricingContext = {}
): number {
  const variantGroup = (item.option_groups || []).find((group) => group.kind === "variant");
  let variantPrice: number | undefined;
  if (variantGroup) {
    const selectedGroup = selection?.find((entry) => entry.groupId === variantGroup.id);
    const selected = selectedGroup ? selectedQuantities(selectedGroup) : [];
    const option = variantGroup.options.find((candidate) => candidate.id === selected[0]?.optionId);
    if (option && Number.isFinite(Number(option.price))) variantPrice = Number(option.price);
  }
  const sourceItem = item as MenuPricingItem;
  return resolveBasePrice(sourceItem, pricingContext.promotions ?? item.promotions ?? [], {
    ...pricingContext,
    variantPrice,
  }).basePrice;
}

export function calculateOptionAdjustedUnitPrice(unitPrice: number, optionsDelta: number, currency = "USD"): number {
  const roundedUnitPrice = roundToCurrencyMinorUnit(unitPrice, currency);
  const roundedOptionsDelta = roundToCurrencyMinorUnit(optionsDelta, currency);
  return Math.max(0, roundToCurrencyMinorUnit(roundedUnitPrice + roundedOptionsDelta, currency));
}

export function calculateSelectedMenuUnitPrice(
  item: MenuPricingItem,
  selection?: readonly OptionGroupSelection[] | null,
  pricingContext: MenuPricingContext = {}
): { baseUnitPrice: number; optionsDelta: number; unitPrice: number; appliedPromotion: MenuPromotion | null; source: "promo_price" | "promotion" | "none"; originalPrice: number; discountPerUnit: number } {
  const variantGroup = (item.option_groups || []).find((group) => group.kind === "variant");
  const selectedVariantGroup = variantGroup && selection?.find((entry) => entry.groupId === variantGroup.id);
  const selectedVariant = selectedVariantGroup
    ? variantGroup!.options.find((option) => option.id === selectedQuantities(selectedVariantGroup)[0]?.optionId)
    : undefined;
  const baseResolution = resolveBasePrice(item, pricingContext.promotions ?? item.promotions ?? [], {
    ...pricingContext,
    variantPrice: selectedVariant ? Number(selectedVariant.price) : undefined,
  });
  const baseUnitPrice = baseResolution.basePrice;
  let optionsDelta = 0;
  if (selection && item.option_groups) {
    const groupMap = new Map(item.option_groups.map((group) => [group.id, group]));
    for (const selectedGroup of selection) {
      const group = groupMap.get(selectedGroup.groupId);
      if (!group || group.kind === "variant") continue;
      const optionMap = new Map(group.options.map((option) => [option.id, option]));
      for (const { optionId, qty } of selectedQuantities(selectedGroup)) {
        const option = optionMap.get(optionId);
        if (option) optionsDelta += Number(option.price_delta) * qty;
      }
    }
  }
  optionsDelta = roundToCurrencyMinorUnit(optionsDelta, pricingContext.currency);
  return {
    baseUnitPrice,
    optionsDelta,
    unitPrice: calculateOptionAdjustedUnitPrice(baseUnitPrice, optionsDelta, pricingContext.currency),
    appliedPromotion: baseResolution.appliedPromotion,
    source: baseResolution.source,
    originalPrice: baseResolution.originalPrice,
    discountPerUnit: baseResolution.discountPerUnit,
  };
}

export function calculateMenuLineTotal(unitPrice: number, quantity: number, currency = "USD"): number {
  const roundedUnitPrice = roundToCurrencyMinorUnit(unitPrice, currency);
  return roundToCurrencyMinorUnit(roundedUnitPrice * quantity, currency);
}

export interface SelectionValidationResult {
  valid: boolean;
  error?: string;
}

export function isOptionGroupSelectionSatisfied(
  group: Pick<MenuItemOptionGroup, "required" | "min" | "max" | "kind">,
  selectedCount: number
): boolean {
  if (group.kind === "variant") return selectedCount === 1;
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
  if (groups.filter((group) => group.kind === "variant").length > 1) {
    return { valid: false, error: "An item can have only one variant group" };
  }
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
      const selectedIds = sel.selectedOptions?.length
        ? sel.selectedOptions.map((entry) => entry.optionId)
        : sel.optionIds;
      selectionMap.set(sel.groupId, selectedIds);
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
      if (group.options.find((option) => option.id === optId)?.is_available === false) {
        return { valid: false, error: `Unavailable or unknown option ID "${optId}" in group "${group.name}"` };
      }
    }

    const selected = selections?.find((entry) => entry.groupId === group.id);
    if (selected?.selectedOptions) {
      const selectedOptions = selectedQuantities(selected);
      const selectedOptionIds = selectedOptions.map((entry) => entry.optionId);
      if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
        return { valid: false, error: `Duplicate option selections in group "${group.name}"` };
      }
      if (selected.optionIds.length > 0 && (
        selected.optionIds.length !== selectedOptionIds.length ||
        selected.optionIds.some((id) => !selectedOptionIds.includes(id))
      )) {
        return { valid: false, error: `Option IDs and option quantities do not match for "${group.name}"` };
      }
      const optionMap = new Map(group.options.map((option) => [option.id, option]));
      for (const entry of selectedOptions) {
        const option = optionMap.get(entry.optionId);
        if (!option || option.is_available === false) {
          return { valid: false, error: `Unavailable or unknown option ID "${entry.optionId}" in group "${group.name}"` };
        }
        const maxQty = option.max_qty ?? 1;
        if (!Number.isInteger(entry.qty) || entry.qty < 1 || entry.qty > maxQty) {
          return { valid: false, error: `Maximum ${maxQty} allowed for "${option.name}"` };
        }
        if (group.kind === "variant" && entry.qty !== 1) {
          return { valid: false, error: `Variant option "${option.name}" can only be selected once` };
        }
      }
    }

    const hasAvailableOptions = group.options.some((option) => option.is_available !== false);
    if (!hasAvailableOptions && count === 0) continue;

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
  appliedPromotion?: import("./menu-promotions").MenuPromotion | null;
  source?: import("./menu-promotions").MenuPromotionSource;
  originalPrice?: number;
  discountPerUnit?: number;
}

export interface MenuPricingContext {
  promotions?: readonly import("./menu-promotions").MenuPromotion[];
  organizerId?: string;
  code?: string | null;
  now?: Date;
  subtotal?: number;
  currency?: string;
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
  promotions?: readonly MenuPromotion[];
  code?: string | null;
  now?: Date;
  subtotal?: number;
  currency?: string;
  organizerId?: string;
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

  const price = calculateSelectedMenuUnitPrice(item, selection, {
    promotions: params.promotions,
    code: params.code,
    now: params.now,
    subtotal: params.subtotal,
    currency: params.currency,
    organizerId: params.organizerId,
  });
  const lineTotal = calculateMenuLineTotal(price.unitPrice, quantity, params.currency);
  const exposePromotionDetails =
    params.promotions !== undefined ||
    params.code !== undefined ||
    params.now !== undefined ||
    params.subtotal !== undefined ||
    params.currency !== undefined ||
    params.organizerId !== undefined ||
    item.promotions !== undefined;

  return {
    unitPrice: price.baseUnitPrice,
    optionsDelta: price.optionsDelta,
    lineTotal,
    ...(exposePromotionDetails ? {
      appliedPromotion: price.appliedPromotion,
      source: price.source,
      originalPrice: price.originalPrice,
      discountPerUnit: price.discountPerUnit,
    } : {}),
  };
}
