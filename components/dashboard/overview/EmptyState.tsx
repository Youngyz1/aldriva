/**
 * components/dashboard/overview/EmptyState.tsx
 *
 * Lightweight, unboxed empty states for overview cards and sections.
 * docs/design/dashboard-overview/04-components.md §10.
 */

import Link from "next/link";
import React from "react";
import { IconAlertTriangle as AlertTriangle, IconArrowRight as ArrowRight } from "@tabler/icons-react";

export interface EmptyStateProps {
  variant: "inline" | "section" | "blocked";
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function EmptyState({
  variant,
  title,
  description,
  action,
  icon: Icon,
  className = "",
}: EmptyStateProps) {
  if (variant === "inline") {
    return (
      <div
        className={`min-h-[56px] flex items-center justify-between gap-3 text-sm text-zinc-600 ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-zinc-400" />}
          <span className="truncate">{title}</span>
        </div>
        {action && (
          action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800 shrink-0 min-h-[44px] min-w-[44px] items-center"
            >
              {action.label} <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800 shrink-0 min-h-[44px] min-w-[44px] items-center"
            >
              {action.label}
            </button>
          )
        )}
      </div>
    );
  }

  if (variant === "blocked") {
    return (
      <div
        className={`min-h-[80px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50/50 text-red-900 ${className}`}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {description && <p className="text-xs text-red-700 mt-0.5">{description}</p>}
          </div>
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 shrink-0"
          >
            {action.label}
          </button>
        )}
      </div>
    );
  }

  // Section variant: 120px min, dashed top/bottom border only, no full box
  return (
    <div
      className={`min-h-[120px] py-6 border-y border-dashed border-zinc-200 flex flex-col items-center justify-center text-center px-4 ${className}`}
    >
      {Icon && <Icon className="h-6 w-6 text-zinc-400 mb-2" />}
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      {description && (
        <p className="text-xs text-zinc-500 mt-1 max-w-sm">{description}</p>
      )}
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 text-xs font-bold transition active:scale-95"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 text-xs font-bold transition active:scale-95"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
