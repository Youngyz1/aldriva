/**
 * components/admin/table/logic.ts
 * Pure, dependency-free table logic (unit-tested in logic.test.ts).
 */

import type { ColumnRole, HideBelow, RowAction } from "./types";

/**
 * Desktop visibility classes for a column. Applied to BOTH the <th> and
 * its <td>s so headers can never misalign with cells. Literal class
 * strings (Tailwind generates them from source).
 */
export function visibilityClass(hideBelow?: HideBelow): string {
  if (hideBelow === "lg") return "hidden @[1024px]:table-cell";
  if (hideBelow === "md") return "hidden @[800px]:table-cell";
  return "";
}

/** Mobile placement for each column role. */
export function lineForRole(
  role: ColumnRole
): "line1-left" | "line1-right" | "line2" | "expanded" {
  switch (role) {
    case "title":
      return "line1-left";
    case "value":
      return "line1-right";
    case "meta":
      return "line2";
    case "detail":
      return "expanded";
  }
}

/**
 * Order ⋯ menu items: non-destructive first (stable), destructive last.
 * The renderer draws one separator before the first destructive item.
 */
export function sortMenuActions(menu: RowAction[]): RowAction[] {
  const normal = menu.filter((a) => !a.destructive);
  const destructive = menu.filter((a) => a.destructive);
  return [...normal, ...destructive];
}

/** Single-open expansion state: opening one row closes any other. */
export function expandedReducer(
  openId: string | null,
  action: { type: "toggle"; id: string } | { type: "close" }
): string | null {
  if (action.type === "close") return null;
  return openId === action.id ? null : action.id;
}

/** ARIA wiring for a row toggle button controlling an expansion panel. */
export function rowToggleAria(expanded: boolean, id: string): {
  "aria-expanded": boolean;
  "aria-controls": string;
} {
  return { "aria-expanded": expanded, "aria-controls": `row-details-${id}` };
}

export type IdentityStatus = "pending" | "verified" | "rejected" | string;

/**
 * Contextual identity actions, moved verbatim from the users page
 * (getIdentityActions): pending rows offer verify + reject; verified rows
 * can be re-rejected; rejected rows can be re-verified.
 */
export function selectIdentityActions(
  identityStatus: IdentityStatus
): Array<"identity_verify" | "identity_reject"> {
  switch (identityStatus) {
    case "pending":
      return ["identity_verify", "identity_reject"];
    case "verified":
      return ["identity_reject"];
    case "rejected":
      return ["identity_verify"];
    default:
      return [];
  }
}

/** English pluralization for counts ("1 org" / "2 orgs"). */
export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Footer range math: 1-based "start–end" of the rows actually shown. */
export function pageRange(
  page: number,
  perPage: number,
  total: number,
  shown: number
): { start: number; end: number } {
  if (total === 0 || shown === 0) return { start: 0, end: 0 };
  const start = (page - 1) * perPage + 1;
  return { start, end: Math.min(start + shown - 1, total) };
}
