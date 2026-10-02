"use client";

/**
 * components/admin/table/AdminTable.tsx
 * Shared admin table: unboxed desktop table (container >= 700px) and
 * two-line expandable mobile rows (container < 700px) via @container.
 * Tables scroll inside their own overflow-x-auto wrapper, never the page.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  expandedReducer,
  lineForRole,
  rowToggleAria,
  sortMenuActions,
} from "./logic";
import { tableStrings as s } from "./strings";
import type {
  AdminColumn,
  AdminTableRow,
  RowAction,
  SelectionControl,
} from "./types";

export type AdminTableProps = {
  columns: AdminColumn[];
  rows: AdminTableRow[];
  /** Header select-all checkbox (desktop). */
  selectAll?: SelectionControl;
  /** Mobile checkbox reveal; desktop checkboxes always show. */
  selectMode?: boolean;
  emptyMessage?: ReactNode;
  /** Inline expansion (default) or bottom sheet for complex records. */
  expandMode?: "inline" | "sheet";
  className?: string;
};

function alignClass(align?: AdminColumn["align"]) {
  return align === "right"
    ? "text-right"
    : align === "center"
      ? "text-center"
      : "text-left";
}

/** ⋯ overflow menu. Destructive items render last, separated, red. */
export function RowMenu({ items }: { items: RowAction[] }) {
  const ordered = sortMenuActions(items);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={s.moreActions}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 @[700px]:opacity-0 @[700px]:group-hover:opacity-100 @[700px]:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <MoreHorizontal size={15} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        {ordered.flatMap((item, idx) => {
          const nodes = [];
          if (idx > 0 && !!item.destructive && !ordered[idx - 1]?.destructive) {
            nodes.push(<DropdownMenuSeparator key={`${item.key}-sep`} />);
          }
          nodes.push(
            <DropdownMenuItem
              key={item.key}
              disabled={item.disabled}
              onSelect={(e) => {
                if (item.href) return;
                e.preventDefault();
                item.onSelect?.();
              }}
              className={cn(
                "cursor-pointer text-xs font-bold",
                item.destructive
                  ? "text-red-600 focus:bg-red-50 focus:text-red-700"
                  : "text-zinc-700"
              )}
            >
              {item.href && !item.disabled ? (
                <Link
                  href={item.href}
                  className="flex w-full items-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="flex w-full items-center">{item.label}</span>
              )}
            </DropdownMenuItem>
          );
          return nodes;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DesktopPrimaryButton({ action }: { action: RowAction }) {
  return (
    <button
      type="button"
      disabled={action.disabled}
      onClick={(e) => {
        e.stopPropagation();
        action.onSelect?.();
      }}
      className="shrink-0 text-xs font-bold whitespace-nowrap text-violet-700 hover:underline disabled:opacity-40"
    >
      {action.label}
    </button>
  );
}

function DesktopTable({
  columns,
  rows,
  selectAll,
}: Pick<AdminTableProps, "columns" | "rows" | "selectAll">) {
  const showActions = rows.some(
    (r) => r.actions && (r.actions.primary || r.actions.menu.length > 0)
  );
  return (
    <div className="hidden overflow-x-auto @[700px]:block">
      <table className="w-full text-left text-sm">
        {/* NOTE: sticky keeps the header docked below the navbar when the
            table fits; inside this horizontal scroll wrapper it cannot
            stick vertically (CSS scroll containment). Kept per spec. */}
        <thead className="sticky top-16 z-10 border-b border-zinc-200 bg-zinc-100">
          <tr>
            {selectAll && (
              <th className="w-11 px-4 py-3" scope="col">
                <input
                  type="checkbox"
                  checked={selectAll.checked}
                  onChange={selectAll.onChange}
                  disabled={selectAll.disabled}
                  className="rounded border-zinc-300 disabled:opacity-40"
                  aria-label={selectAll.label}
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  "px-4 py-3 text-xs font-semibold text-zinc-500 first:pl-0 last:pr-0",
                  alignClass(col.align)
                )}
              >
                {col.header}
              </th>
            ))}
            {showActions && (
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">
                {s.moreActions}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {rows.map((row) => {
            const primary = row.actions?.primary;
            const menu = row.actions ? sortMenuActions(row.actions.menu) : [];
            return (
              <tr
                key={row.id}
                onClick={row.onOpen}
                className={cn(
                  "group h-16 transition-colors hover:bg-zinc-50/70",
                  row.onOpen && "cursor-pointer"
                )}
              >
                {row.selection && (
                  <td className="w-11 px-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={row.selection.checked}
                      disabled={row.selection.disabled}
                      onChange={row.selection.onChange}
                      className="rounded border-zinc-300 disabled:opacity-40"
                      aria-label={row.selection.label}
                    />
                  </td>
                )}
                {columns.map((col, i) => (
                  <td
                    key={col.id}
                    className={cn(
                      "px-4 text-sm first:pl-0 last:pr-0",
                      col.role === "title"
                        ? "font-semibold text-zinc-950"
                        : "text-zinc-600",
                      alignClass(col.align)
                    )}
                  >
                    {row.cells[i]}
                  </td>
                ))}
                {showActions && (
                  <td className="px-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {primary &&
                        (primary.href ? (
                          <Link
                            href={primary.href}
                            className="shrink-0 text-xs font-bold whitespace-nowrap text-violet-700 hover:underline"
                          >
                            {primary.label}
                          </Link>
                        ) : (
                          <DesktopPrimaryButton action={primary} />
                        ))}
                      {menu.length > 0 && <RowMenu items={menu} />}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailList({
  columns,
  cells,
}: {
  columns: AdminColumn[];
  cells: ReactNode[];
}) {
  return (
    <dl className="space-y-2">
      {columns.map((col, i) => {
        if (col.role !== "detail") return null;
        return (
          <div key={col.id} className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-xs font-semibold text-zinc-400">
              {col.header}
            </dt>
            <dd className="min-w-0 text-right text-sm font-medium text-zinc-800">
              {cells[i]}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function MobileRow({
  row,
  columns,
  open,
  onToggle,
  selectMode,
  expandMode,
  onOpenSheet,
}: {
  row: AdminTableRow;
  columns: AdminColumn[];
  open: boolean;
  onToggle: () => void;
  selectMode?: boolean;
  expandMode: "inline" | "sheet";
  onOpenSheet: () => void;
}) {
  const aria = rowToggleAria(open, row.id);
  const primary = row.actions?.primary;
  const menu = row.actions ? sortMenuActions(row.actions.menu) : [];
  const showChevron = expandMode === "inline";

  const line1: ReactNode[] = [];
  const line2: ReactNode[] = [];
  columns.forEach((col, i) => {
    if (col.desktopOnly) return;
    const line = lineForRole(col.role);
    if (line === "line1-left") {
      line1.push(
        <span
          key={col.id}
          className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-950"
        >
          {row.cells[i]}
        </span>
      );
    } else if (line === "line1-right") {
      line1.push(
        <span key={col.id} className="shrink-0 text-sm text-zinc-700">
          {row.cells[i]}
        </span>
      );
    } else if (line === "line2") {
      line2.push(
        <span key={col.id} className="flex items-center gap-1.5">
          {row.cells[i]}
        </span>
      );
    }
  });

  const handleActivate = () => {
    if (expandMode === "sheet") onOpenSheet();
    else onToggle();
  };

  return (
    <div role="listitem" className="py-1">
      <div className="flex items-center gap-2">
        {selectMode && row.selection && (
          <input
            type="checkbox"
            checked={row.selection.checked}
            disabled={row.selection.disabled}
            onChange={row.selection.onChange}
            className="h-4 w-4 shrink-0 rounded border-zinc-300 disabled:opacity-40"
            aria-label={row.selection.label}
          />
        )}
        <button
          type="button"
          onClick={handleActivate}
          aria-expanded={expandMode === "inline" ? aria["aria-expanded"] : undefined}
          aria-controls={expandMode === "inline" ? aria["aria-controls"] : undefined}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 py-2 text-left"
          aria-label={s.expandRow}
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              {line1}
            </span>
            {line2.length > 0 && (
              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
                {line2.map((node, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && (
                      <span aria-hidden="true" className="text-zinc-300">
                        ·
                      </span>
                    )}
                    {node}
                  </span>
                ))}
              </span>
            )}
          </span>
        </button>
        {showChevron && (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180"
            )}
          />
        )}
      </div>

      {expandMode === "inline" && (
        <div
          id={aria["aria-controls"]}
          className={cn(
            "grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-3 px-1 pt-1 pb-3">
              <DetailList columns={columns} cells={row.cells} />
              {primary && (
                <button
                  type="button"
                  disabled={primary.disabled}
                  onClick={primary.onSelect}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-800 disabled:opacity-40"
                >
                  {primary.label}
                </button>
              )}
              <div className="flex items-center justify-between gap-2">
                {menu.length > 0 ? (
                  <RowMenu items={menu} />
                ) : (
                  <span />
                )}
                {row.detailHref && (
                  <Link
                    href={row.detailHref}
                    className="text-xs font-bold text-violet-700 hover:underline"
                  >
                    {s.fullRecord} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminTable({
  columns,
  rows,
  selectAll,
  selectMode,
  emptyMessage,
  expandMode = "inline",
  className,
}: AdminTableProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const sheetRow = rows.find((r) => r.id === sheetId) ?? null;

  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm font-semibold text-zinc-400">
        {emptyMessage ?? s.empty}
      </div>
    );
  }

  return (
    <div className={cn("@container w-full", className)}>
      <DesktopTable columns={columns} rows={rows} selectAll={selectAll} />

      <div className="divide-y divide-zinc-200 @[700px]:hidden" role="list">
        {rows.map((row) => (
          <MobileRow
            key={row.id}
            row={row}
            columns={columns}
            open={openId === row.id}
            onToggle={() =>
              setOpenId((prev) =>
                expandedReducer(prev, { type: "toggle", id: row.id })
              )
            }
            selectMode={selectMode}
            expandMode={expandMode}
            onOpenSheet={() => setSheetId(row.id)}
          />
        ))}
      </div>

      <Sheet
        open={sheetId !== null}
        onOpenChange={(open) => {
          if (!open) setSheetId(null);
        }}
      >
        <SheetContent side="bottom" aria-label={s.fullRecord}>
          {sheetRow && (
            <div className="space-y-4 px-1 pb-2">
              <SheetHeader>
                <SheetTitle className="text-left text-base font-bold">
                  {s.fullRecord}
                </SheetTitle>
              </SheetHeader>
              <DetailList columns={columns} cells={sheetRow.cells} />
              {sheetRow.actions?.primary && (
                <button
                  type="button"
                  disabled={sheetRow.actions.primary.disabled}
                  onClick={() => {
                    sheetRow.actions?.primary?.onSelect?.();
                    setSheetId(null);
                  }}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-800 disabled:opacity-40"
                >
                  {sheetRow.actions.primary.label}
                </button>
              )}
              {sheetRow.actions && sheetRow.actions.menu.length > 0 && (
                <RowMenu items={sheetRow.actions.menu} />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
