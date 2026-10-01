"use client";

import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useResponsiveTable, useResponsiveTableMode } from "./ResponsiveDataTable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

// ---------------------------------------------------------------------------
// Structured action types (new API)
// ---------------------------------------------------------------------------

export type RowAction = {
  /** Unique key for React list rendering */
  key: string;
  label: string;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Renders red, placed after a separator at the bottom of the menu */
  destructive?: boolean;
  /** Show a separator before this item regardless of destructive flag */
  separatorBefore?: boolean;
};

export type RowActionsConfig = {
  /**
   * Primary action — rendered as a labelled button inline in the row.
   * Keep labels short (≤ 8 chars) so they fit the Actions column.
   */
  primary?: RowAction;
  /**
   * Additional actions placed in the ⋯ overflow dropdown.
   * Destructive items are automatically sorted last with a separator.
   */
  menu: RowAction[];
};

// ---------------------------------------------------------------------------
// Inline ⋯ overflow menu
// ---------------------------------------------------------------------------

export function RowActionsDropdown({ items, rowId }: { items: RowAction[]; rowId?: string }) {
  const normal = items.filter((i) => !i.destructive && !i.separatorBefore);
  const separated = items.filter((i) => i.destructive || i.separatorBefore);
  const ordered = [...normal, ...separated];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="More actions"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 transition-colors"
      >
        <MoreHorizontal size={15} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        {ordered.map((item, idx) => {
          const prevItem = ordered[idx - 1];
          const needsSep =
            idx > 0 &&
            (item.destructive || item.separatorBefore) &&
            prevItem &&
            !prevItem.destructive &&
            !prevItem.separatorBefore;
          return (
            <React.Fragment key={item.key}>
              {needsSep && <DropdownMenuSeparator />}
              <DropdownMenuItem
                disabled={item.disabled}
                title={item.disabledReason}
                onSelect={() => {
                  if (!item.href) item.onSelect?.();
                }}
                className={cn(
                  "text-xs font-bold cursor-pointer",
                  item.destructive
                    ? "text-red-600 focus:bg-red-50 focus:text-red-700"
                    : "text-zinc-700"
                )}
              >
                {item.href ? (
                  <a
                    href={item.href}
                    className="flex w-full items-center"
                    aria-disabled={item.disabled}
                    onClick={item.disabled ? (e) => e.preventDefault() : undefined}
                  >
                    {item.label}
                  </a>
                ) : (
                  <span className="flex w-full items-center">{item.label}</span>
                )}
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Row props
// ---------------------------------------------------------------------------

export type ResponsiveDataRowProps = {
  id: string;
  /** Desktop table cells mapping 1:1 to columns */
  desktopCells: React.ReactNode[];

  // ── Mobile identity slots ─────────────────────────────────────────────────
  /** Line 1 left: name / primary entity label */
  identity: React.ReactNode;
  /** Line 1 right: role badge or key value */
  primaryValue?: React.ReactNode;
  /** @deprecated alias for primaryValue */
  numericMetric?: React.ReactNode;
  /** Line 2 left: status pill */
  state?: React.ReactNode;
  /** @deprecated alias for state */
  statusBadge?: React.ReactNode;
  /** Line 2 right: secondary meta (string | ReactNode | array) */
  secondary?: React.ReactNode | React.ReactNode[];
  /** @deprecated alias for secondary */
  primaryMeta?: React.ReactNode | React.ReactNode[];

  // ── Selection ─────────────────────────────────────────────────────────────
  /** Checkbox or other selection control */
  selectionControl?: React.ReactNode;

  // ── Actions ───────────────────────────────────────────────────────────────
  /**
   * Structured actions API (preferred for new callers).
   * `primary` renders inline; `menu` items go into a ⋯ dropdown.
   * Destructive items are auto-sorted last with a red style + separator.
   */
  rowActions?: RowActionsConfig;
  /**
   * Legacy unstructured actions — React nodes rendered as-is.
   * Kept for backward compatibility with existing screens.
   * Prefer `rowActions` for new callers.
   */
  actions?: React.ReactNode;

  // ── Expansion ─────────────────────────────────────────────────────────────
  /**
   * Content shown in the mobile expanded drawer.
   * When omitted the row is non-expandable.
   */
  expandedDetails?: React.ReactNode;
  /** @deprecated alias for expandedDetails */
  mobileDetails?: React.ReactNode;

  onRowClick?: () => void;
  className?: string;
  /** Controlled expanded state */
  isExpanded?: boolean;
  /** Controlled toggle callback */
  onToggleExpand?: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResponsiveDataRow({
  id,
  desktopCells,
  identity,
  primaryValue,
  numericMetric,
  state,
  statusBadge,
  secondary,
  primaryMeta,
  selectionControl,
  rowActions,
  actions,
  expandedDetails,
  mobileDetails,
  onRowClick,
  className,
  isExpanded: controlledExpanded,
  onToggleExpand: controlledToggle,
}: ResponsiveDataRowProps) {
  const { columns, expandedRowIds, toggleRowExpanded } = useResponsiveTable();
  const mode = useResponsiveTableMode();

  const resolvedPrimaryValue = primaryValue ?? numericMetric;
  const resolvedState = state ?? statusBadge;
  const resolvedSecondary = secondary ?? primaryMeta;
  const resolvedExpandedDetails = expandedDetails ?? mobileDetails;

  // Legacy actions node (non-structured)
  const legacyActions = actions;

  const isExpanded =
    controlledExpanded !== undefined ? controlledExpanded : expandedRowIds.has(id);

  const handleToggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ("key" in e && e.key !== "Enter" && e.key !== " ") return;
    e.stopPropagation();
    if (controlledToggle) {
      controlledToggle();
    } else {
      toggleRowExpanded(id);
    }
  };

  const hasExpandableContent = Boolean(resolvedExpandedDetails);
  const hasAnyActions = Boolean(rowActions || legacyActions);

  // ── Action rendering helpers ─────────────────────────────────────────────

  function renderStructuredActions(size: "sm" | "md" = "sm") {
    if (!rowActions) return null;
    const { primary, menu } = rowActions;
    const btnCls =
      size === "md"
        ? "rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 whitespace-nowrap transition-colors"
        : "rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 whitespace-nowrap transition-colors";
    return (
      <>
        {primary && (
          <button
            type="button"
            disabled={primary.disabled}
            title={primary.disabledReason}
            onClick={primary.onSelect}
            className={btnCls}
          >
            {primary.label}
          </button>
        )}
        {menu.length > 0 && <RowActionsDropdown items={menu} rowId={id} />}
      </>
    );
  }

  // ── Normalize secondary metadata list ─────────────────────────────────────

  const renderSecondary = () => {
    if (!resolvedSecondary) return null;
    if (Array.isArray(resolvedSecondary)) {
      const items = (resolvedSecondary as React.ReactNode[]).filter(Boolean);
      return items.map((item, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="text-zinc-300 font-bold select-none">·</span>}
          <span>{item}</span>
        </React.Fragment>
      ));
    }
    return resolvedSecondary;
  };

  // ── Desktop table row ─────────────────────────────────────────────────────

  if (mode === "table") {
    return (
      <tr
        className={cn(
          "hover:bg-zinc-50/70 transition-colors group",
          onRowClick && "cursor-pointer",
          className
        )}
        style={{ height: "60px" }}
        onClick={onRowClick}
      >
        {desktopCells.map((cell, idx) => {
          const col = columns[idx];
          const hideClass =
            col?.hideBelow === "lg"
              ? "hidden @lg:table-cell"
              : col?.hideBelow === "md"
              ? "hidden @md:table-cell"
              : "";
          const alignClass =
            col?.align === "right"
              ? "text-right"
              : col?.align === "center"
              ? "text-center"
              : "text-left";

          return (
            <td
              key={col?.id || idx}
              className={cn("px-4 text-zinc-700 overflow-hidden", alignClass, hideClass)}
            >
              {cell}
            </td>
          );
        })}
      </tr>
    );
  }

  // ── Mobile list row ───────────────────────────────────────────────────────

  return (
    <div
      role="listitem"
      className={cn("hover:bg-zinc-50/70 transition-colors", className)}
    >
      {/* Top strip: checkbox + two-line content + chevron */}
      <div className="flex items-start gap-2.5 p-3.5 sm:p-4">
        {/* Optional selection checkbox */}
        {selectionControl && (
          <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {selectionControl}
          </div>
        )}

        {/* Two-line content — tapping expands if expandable content exists */}
        <div
          className={cn(
            "flex-1 min-w-0 select-none",
            hasExpandableContent && "cursor-pointer"
          )}
          role={hasExpandableContent ? "button" : undefined}
          tabIndex={hasExpandableContent ? 0 : undefined}
          aria-expanded={hasExpandableContent ? isExpanded : undefined}
          onClick={
            onRowClick ||
            (hasExpandableContent ? (e) => handleToggle(e as React.MouseEvent) : undefined)
          }
          onKeyDown={hasExpandableContent ? (e) => handleToggle(e) : undefined}
        >
          {/* Line 1: identity + role/primary value */}
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-bold text-sm text-zinc-950 truncate min-w-0 pr-1">
              {identity}
            </div>
            {resolvedPrimaryValue && (
              <div className="shrink-0 text-right font-extrabold text-sm text-zinc-950">
                {resolvedPrimaryValue}
              </div>
            )}
          </div>

          {/* Line 2: status pill + secondary context (date, joined, etc.) */}
          <div className="mt-1 flex items-center flex-wrap gap-1.5 text-xs text-zinc-500">
            {resolvedState && <div className="shrink-0">{resolvedState}</div>}
            {resolvedSecondary && (
              <div className="flex items-center flex-wrap gap-1.5 text-xs text-zinc-500 min-w-0">
                {renderSecondary()}
              </div>
            )}
          </div>
        </div>

        {/* Trailing: disclosure chevron (when expandable) */}
        {hasExpandableContent && (
          <button
            type="button"
            onClick={(e) => handleToggle(e)}
            aria-expanded={isExpanded}
            aria-controls={`row-details-${id}`}
            aria-label={isExpanded ? "Collapse row details" : "Expand row details"}
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition focus-visible:outline-2 focus-visible:outline-orange-500"
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        )}

        {/* No expandable content but has actions: show inline in the trail */}
        {!hasExpandableContent && hasAnyActions && (
          <div className="shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {rowActions ? (
              renderStructuredActions("sm")
            ) : (
              legacyActions
            )}
          </div>
        )}
      </div>

      {/* Expanded detail drawer */}
      {hasExpandableContent && isExpanded && (
        <div
          id={`row-details-${id}`}
          className="mx-3.5 mb-3.5 sm:mx-4 sm:mb-4 rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3 text-xs text-zinc-600 animate-in fade-in-50 slide-in-from-top-1 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {resolvedExpandedDetails}

          {/* Actions at the bottom of the drawer */}
          {hasAnyActions && (
            <div className="mt-3 pt-2 border-t border-zinc-100 flex items-center gap-2">
              {rowActions ? (
                renderStructuredActions("md")
              ) : (
                legacyActions
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
