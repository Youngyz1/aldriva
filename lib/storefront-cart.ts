import { isOptionGroupSelectionSatisfied, MAX_LINE_QUANTITY } from "./menu-pricing";
import type { BrowseItem } from "./storefront-browse";

export const STOREFRONT_CART_VERSION = 3;

export interface StorefrontCartLine {
  lineId: string;
  itemId: string;
  selectedOptionIds: string[];
  selectedOptions: Array<{ groupId: string; optionId: string; qty: number }>;
  quantity: number;
  /** Item update token only; prices are always recalculated from the live menu. */
  itemUpdatedAt?: string | null;
}

export function migrateStorefrontCart(
  value: unknown,
  createLineId: () => string
): { lines: StorefrontCartLine[]; needsSave: boolean } {
  const wrapped = !Array.isArray(value) && value && typeof value === "object"
    ? value as { version?: unknown; items?: unknown }
    : null;
  const rawLines = Array.isArray(value)
    ? value
    : wrapped && [1, 2, STOREFRONT_CART_VERSION].includes(Number(wrapped.version)) && Array.isArray(wrapped.items)
      ? wrapped.items
      : [];
  let needsSave = !Array.isArray(value) && (!wrapped || wrapped.version !== STOREFRONT_CART_VERSION);
  const lines: StorefrontCartLine[] = [];
  for (const raw of rawLines) {
    if (!raw || typeof raw !== "object") { needsSave = true; continue; }
    const line = raw as Partial<StorefrontCartLine>;
    if (
      typeof line.itemId !== "string" ||
      !Array.isArray(line.selectedOptionIds) ||
      !line.selectedOptionIds.every((id) => typeof id === "string") ||
      !Number.isInteger(line.quantity) ||
      Number(line.quantity) < 1 ||
      Number(line.quantity) > MAX_LINE_QUANTITY
    ) { needsSave = true; continue; }
    const lineId = typeof line.lineId === "string" && line.lineId ? line.lineId : createLineId();
    if (lineId !== line.lineId || !Array.isArray(line.selectedOptions)) needsSave = true;
    const selectedOptions = Array.isArray(line.selectedOptions)
      ? line.selectedOptions.filter((option) =>
          option && typeof option.groupId === "string" && typeof option.optionId === "string" && Number.isInteger(option.qty) && option.qty >= 1
        ).map((option) => ({ groupId: option.groupId, optionId: option.optionId, qty: option.qty }))
      : [];
    if (Array.isArray(line.selectedOptions) && selectedOptions.length !== line.selectedOptions.length) needsSave = true;
    lines.push({
      lineId,
      itemId: line.itemId,
      selectedOptionIds: [...line.selectedOptionIds],
      selectedOptions,
      quantity: Number(line.quantity),
      ...(typeof line.itemUpdatedAt === "string" ? { itemUpdatedAt: line.itemUpdatedAt } : {}),
    });
  }
  if (lines.length !== rawLines.length) needsSave = true;
  return { lines, needsSave };
}

export function reconcileStorefrontCart(
  lines: readonly StorefrontCartLine[],
  items: readonly BrowseItem[]
): { lines: StorefrontCartLine[]; removed: number } {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const valid: StorefrontCartLine[] = [];
  for (const line of lines) {
    const item = itemMap.get(line.itemId);
    if (!item || item.isSoldOut) continue;
    const groups = item.optionGroups || [];
    const selectableGroups = groups.filter((group) =>
      group.options.some((option) => option.isAvailable !== false)
    );
    const resolved: Array<{ groupId: string; optionId: string; qty: number }> = [];
    let invalid = false;
    for (const optionId of line.selectedOptionIds) {
      const matches = groups.flatMap((group) => group.options
        .filter((option) => option.id === optionId && option.isAvailable !== false)
        .map((option) => ({ group, option })));
      if (matches.length !== 1) { invalid = true; break; }
      const { group, option } = matches[0];
      const saved = line.selectedOptions.find((selection) => selection.optionId === optionId);
      if (saved?.groupId && saved.groupId !== group.id) { invalid = true; break; }
      const qty = saved?.qty ?? 1;
      if (!Number.isInteger(qty) || qty < 1 || qty > (option.maxQty ?? 1)) { invalid = true; break; }
      resolved.push({ groupId: group.id, optionId, qty });
    }
    if (invalid || (line.selectedOptions.length > 0 && line.selectedOptions.length !== resolved.length)) continue;
    if (selectableGroups.some((group) => !isOptionGroupSelectionSatisfied(
      group,
      resolved.filter((selection) => selection.groupId === group.id).length
    ))) continue;
    valid.push({ ...line, selectedOptions: resolved });
  }
  return { lines: valid, removed: lines.length - valid.length };
}

function selectionKeys(line: Pick<StorefrontCartLine, "selectedOptionIds" | "selectedOptions">): string[] {
  if (line.selectedOptions.length > 0) {
    return line.selectedOptions.map((entry) => `${entry.groupId}:${entry.optionId}:${entry.qty}`).sort();
  }
  return line.selectedOptionIds.map((id) => `:${id}:1`).sort();
}

function sameSelections(left: StorefrontCartLine, right: StorefrontCartLine): boolean {
  const a = selectionKeys(left);
  const b = selectionKeys(right);
  return left.itemId === right.itemId && a.length === b.length && a.every((key, index) => key === b[index]);
}

export function upsertStorefrontCartLine(
  lines: readonly StorefrontCartLine[],
  incoming: StorefrontCartLine,
  editingLineId?: string | null
): { lines: StorefrontCartLine[]; capped: boolean } {
  const existingIndex = editingLineId ? lines.findIndex((line) => line.lineId === editingLineId) : -1;
  const candidate = {
    ...incoming,
    quantity: Math.min(MAX_LINE_QUANTITY, incoming.quantity),
  };
  const otherIndex = lines.findIndex((line) =>
    line.lineId !== editingLineId && sameSelections(line, candidate)
  );
  if (otherIndex >= 0) {
    const combined = lines[otherIndex].quantity + candidate.quantity;
    const next = lines.filter((line) => line.lineId !== editingLineId);
    const targetIndex = next.findIndex((line) => line.lineId === lines[otherIndex].lineId);
    next[targetIndex] = { ...next[targetIndex], quantity: Math.min(MAX_LINE_QUANTITY, combined) };
    return { lines: next, capped: combined > MAX_LINE_QUANTITY };
  }
  if (existingIndex >= 0) {
    const next = [...lines];
    next[existingIndex] = { ...candidate, lineId: lines[existingIndex].lineId };
    return { lines: next, capped: incoming.quantity > MAX_LINE_QUANTITY };
  }
  const existing = lines.findIndex((line) => sameSelections(line, candidate));
  if (existing < 0) return { lines: [...lines, candidate], capped: incoming.quantity > MAX_LINE_QUANTITY };
  const combined = lines[existing].quantity + candidate.quantity;
  const next = [...lines];
  next[existing] = { ...next[existing], quantity: Math.min(MAX_LINE_QUANTITY, combined) };
  return { lines: next, capped: combined > MAX_LINE_QUANTITY };
}

export function createStorefrontCartLineId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
