"use client";

import Link from "next/link";
import { Fragment } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RowActionItem = {
  key: string;
  label: string;
  href?: string;
  external?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  separatorBefore?: boolean;
};

/**
 * Shared compact row-action menu (Phase 6F).
 *
 * Secondary/operational row actions live behind one `Actions` control;
 * destructive actions render separated and red. Keyboard focus, Escape,
 * outside-click close, and viewport-aware positioning come from Radix;
 * the Portal keeps the menu out of `overflow-x-auto` table containers.
 * Callers keep owning permissions, handlers, and confirmations.
 */
export default function RowActionsMenu({
  items,
  label = "Actions",
  ariaLabel,
  align = "end",
}: {
  items: RowActionItem[];
  label?: string;
  ariaLabel?: string;
  align?: "start" | "center" | "end";
}) {
  const visible = items.filter((i) => i);
  if (visible.length === 0) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={ariaLabel ?? label}
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
      >
        {label}
        <ChevronDown size={13} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[11rem]">
        {visible.map((item) => (
          <Fragment key={item.key}>
            {(item.separatorBefore || item.destructive) && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={item.disabled}
              title={item.disabledReason}
              onSelect={() => {
                if (!item.href) item.onSelect?.();
              }}
              className={cn(
                "text-xs font-bold",
                item.destructive ? "text-red-600 focus:text-red-700" : "text-zinc-700"
              )}
            >
              {item.href ? (
                <Link
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noreferrer" : undefined}
                  className="flex w-full items-center"
                  aria-disabled={item.disabled}
                  onClick={item.disabled ? (e) => e.preventDefault() : undefined}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="flex w-full items-center">{item.label}</span>
              )}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
