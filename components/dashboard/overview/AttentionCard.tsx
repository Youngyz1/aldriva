"use client";

/**
 * components/dashboard/overview/AttentionCard.tsx
 *
 * Single grouped attention card replacing AttentionStrip.
 * docs/design/dashboard-overview/04-components.md §5 and 01 §1.2.
 */

import React, { useState } from "react";
import Link from "next/link";
import {
  IconChevronRight as ChevronRight,
  IconAlertCircle as AlertCircle,
  IconClock as Clock,
  IconShieldExclamation as ShieldAlert,
  IconFilePencil as FileEdit,
} from "@tabler/icons-react";
import type { AttentionItem } from "@/lib/overview-types";

export interface AttentionCardItem {
  id: string;
  tone: "critical" | "warning" | "info";
  title: string;
  detail?: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface AttentionCardProps {
  items: AttentionItem[];
  organizerId: string;
  max?: number;
}

const TONE_CLASSES: Record<
  "critical" | "warning" | "info",
  { border: string; text: string; bg: string }
> = {
  critical: {
    border: "border-l-red-600",
    text: "text-red-700",
    bg: "bg-red-50",
  },
  warning: {
    border: "border-l-amber-500",
    text: "text-amber-700",
    bg: "bg-amber-50",
  },
  info: {
    border: "border-l-blue-500",
    text: "text-blue-700",
    bg: "bg-blue-50",
  },
};

function resolveItemTone(priority: AttentionItem["priority"]): "critical" | "warning" | "info" {
  if (priority === "high") return "critical";
  if (priority === "info") return "info";
  return "warning";
}

function resolveItemIcon(kind: AttentionItem["kind"]) {
  if (kind === "pending_orders" || kind === "overdue_orders" || kind === "pending_reservations") {
    return Clock;
  }
  if (kind === "approval_pending" || kind === "approval_rejected" || kind === "approval_archived") {
    return ShieldAlert;
  }
  if (kind === "unpublished_changes") {
    return FileEdit;
  }
  return AlertCircle;
}

function resolveItemHref(href: string | undefined, organizerId: string): string {
  if (!href) return `/dashboard/org/${organizerId}/overview`;
  return href
    .replace("ORDERS_PATH", `${organizerId}/orders`)
    .replace("RESERVATIONS_PATH", `${organizerId}/reservations`)
    .replace("BUILDER_PATH", `${organizerId}/website/builder`)
    .replace("SETTINGS_PATH", `${organizerId}/settings`);
}

export function AttentionCard({ items, organizerId, max = 3 }: AttentionCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (!items || items.length === 0) return null;

  const visibleItems = expanded ? items : items.slice(0, max);
  const hasMore = items.length > max && !expanded;

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Items needing attention"
      className="rounded-xl border border-zinc-200 bg-white overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/60">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
            Needs attention
          </h2>
        </div>
        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-900 text-white">
          {items.length}
        </span>
      </div>

      <div className="divide-y divide-zinc-100">
        {visibleItems.map((item) => {
          const tone = resolveItemTone(item.priority);
          const toneStyle = TONE_CLASSES[tone];
          const Icon = resolveItemIcon(item.kind);
          const href = resolveItemHref(item.href, organizerId);

          return (
            <Link
              key={item.id}
              href={href}
              className={`min-h-[56px] flex items-center justify-between gap-3 px-4 py-3 border-l-4 ${toneStyle.border} hover:bg-zinc-50 transition group`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`h-7 w-7 rounded-md shrink-0 flex items-center justify-center ${toneStyle.bg} ${toneStyle.text}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] sm:text-[15px] font-semibold text-zinc-900 truncate">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-[12px] sm:text-[13px] text-zinc-500 truncate">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {item.actionLabel && (
                  <span className="text-xs font-bold text-zinc-700 hidden sm:inline group-hover:text-zinc-950">
                    {item.actionLabel}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 transition" />
              </div>
            </Link>
          );
        })}
      </div>

      {hasMore && (
        <div className="px-4 py-2.5 border-t border-zinc-100 bg-zinc-50/40 text-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs font-bold text-brand-700 hover:text-brand-800 transition min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
          >
            See all {items.length} items
          </button>
        </div>
      )}
    </section>
  );
}
