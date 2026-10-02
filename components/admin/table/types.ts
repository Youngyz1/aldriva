/**
 * components/admin/table/types.ts
 * Column roles and row-action contracts for the shared admin table.
 *
 * Column role drives mobile placement AND documents desktop intent:
 * - title: primary entity label (mobile line 1, left; desktop name column)
 * - value: key value (mobile line 1, right; desktop column)
 * - meta: secondary context (mobile line 2; desktop column)
 * - detail: expansion-only on mobile (label/value list); renders as a
 *   normal desktop column unless the column is desktopOnly.
 */

import type React from "react";

export type ColumnRole = "title" | "value" | "meta" | "detail";

export type AdminColumn = {
  id: string;
  header: React.ReactNode;
  role: ColumnRole;
  /** Visible on desktop only; excluded from mobile rows entirely. */
  desktopOnly?: boolean;
  /** CSS width applied to the desktop <th> (opt-in per column). */
  width?: string;
  align?: "left" | "center" | "right";
};

export type RowAction = {
  key: string;
  label: string;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  /** Rendered red, last, behind a separator. The only red in the table. */
  destructive?: boolean;
};

export type RowActionsConfig = {
  /** Rendered inline (desktop) / full-width (mobile expansion). */
  primary?: RowAction;
  /** Overflow ⋯ menu items. */
  menu: RowAction[];
};

export type SelectionControl = {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
};

export type AdminTableRow = {
  id: string;
  /** Cells aligned by index with `columns`. */
  cells: React.ReactNode[];
  actions?: RowActionsConfig;
  selection?: SelectionControl | null;
  /** Opens the record detail (drawer/page). Row click also triggers it. */
  onOpen?: () => void;
  /** "Full record" destination for the mobile expansion. */
  detailHref?: string;
};
