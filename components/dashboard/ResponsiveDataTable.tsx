"use client";

import React, { createContext, useContext, useState } from "react";
import { cn } from "@/lib/utils";

export type ColumnPriority = "primary" | "value" | "state" | "secondary" | "actions";

export type ResponsiveColumn = {
  id: string;
  header: React.ReactNode;
  align?: "left" | "center" | "right";
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
  /** CSS width string applied as inline style, e.g. "96px" or "120px" */
  width?: string;
};

type TableContextType = {
  columns: ResponsiveColumn[];
  expandedRowIds: Set<string>;
  toggleRowExpanded: (id: string) => void;
  isSelectable?: boolean;
};

const ResponsiveTableContext = createContext<TableContextType | null>(null);

export function useResponsiveTable() {
  const ctx = useContext(ResponsiveTableContext);
  if (!ctx) {
    throw new Error("useResponsiveTable must be used within a ResponsiveDataTable");
  }
  return ctx;
}

export type TableRenderMode = "table" | "list";
export const ResponsiveTableModeContext = createContext<TableRenderMode>("table");

export function useResponsiveTableMode() {
  return useContext(ResponsiveTableModeContext);
}

export type ResponsiveDataTableProps = {
  columns: ResponsiveColumn[];
  children: React.ReactNode;
  className?: string;
  isSelectable?: boolean;
  totalCount?: number;
  emptyMessage?: React.ReactNode;
  selectAllControl?: React.ReactNode;
};

export function ResponsiveDataTable({
  columns,
  children,
  className,
  isSelectable = false,
  totalCount,
  emptyMessage,
  selectAllControl,
}: ResponsiveDataTableProps) {
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  const toggleRowExpanded = (id: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <ResponsiveTableContext.Provider
      value={{
        columns,
        expandedRowIds,
        toggleRowExpanded,
        isSelectable,
      }}
    >
      <div className={cn("w-full @container", className)}>
        {/* Desktop / Constrained Table View (Visible at container width >= md: 768px) */}
        <div className="hidden @md:block w-full">
          <table className="w-full text-left text-sm border-collapse table-fixed">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-black uppercase tracking-wide text-zinc-400">
              <tr>
                {columns.map((col) => {
                  const hideClass =
                    col.hideBelow === "lg"
                      ? "hidden @lg:table-cell"
                      : col.hideBelow === "md"
                      ? "hidden @md:table-cell"
                      : "";
                  const alignClass =
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                      ? "text-center"
                      : "text-left";

                  return (
                    <th
                      key={col.id}
                      scope="col"
                      style={col.width ? { width: col.width } : undefined}
                      className={cn("py-3 px-4 whitespace-nowrap", alignClass, hideClass, col.className)}
                    >
                      {col.header}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              <ResponsiveTableModeContext.Provider value="table">
                {children}
              </ResponsiveTableModeContext.Provider>
            </tbody>
          </table>
        </div>

        {/* Mobile Two-Line Structured List View (Visible at container width < md: 768px) */}
        <div className="block @md:hidden divide-y divide-zinc-100" role="list">
          <ResponsiveTableModeContext.Provider value="list">
            {children}
          </ResponsiveTableModeContext.Provider>
        </div>
      </div>
    </ResponsiveTableContext.Provider>
  );
}
