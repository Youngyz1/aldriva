"use client";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Reusable sticky table toolbar — stays pinned beneath the global Aldriva header
 * while table rows scroll. Used by Events, Fundraisers, Businesses, Products, etc.
 *
 * - Top offset accounts for global header (h-16 = 64px)
 * - Opaque background + border + subtle shadow prevents bleed-through
 * - z-30 sits above table content but below global header (z-50)
 * - Normal page scroll, no nested scroll containers
 */
export default function StickyTableToolbar({ children, className }: Props) {
  return (
    <div
      className={cn(
        "sticky top-16 z-30 border-b border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur-md sm:px-4",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StickyTablePagination({ children, className }: Props) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:px-4",
        "shadow-[0_-1px_2px_rgba(0,0,0,0.04)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StickyTableShell({
  toolbar,
  pagination,
  children,
  className,
}: {
  toolbar: React.ReactNode;
  pagination?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0", className)}>
      <StickyTableToolbar>{toolbar}</StickyTableToolbar>
      <div className="space-y-4 pt-4">{children}</div>
      {pagination ? <StickyTablePagination>{pagination}</StickyTablePagination> : null}
    </div>
  );
}
