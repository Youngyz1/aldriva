"use client";

import Link from "next/link";
import { AlertCircle, Clock, FileEdit, ShieldAlert } from "lucide-react";
import type { AttentionItem } from "@/lib/overview-types";

export interface AttentionStripProps {
  items: AttentionItem[];
  organizerId: string;
}

export function AttentionStrip({ items, organizerId }: AttentionStripProps) {
  if (!items || items.length === 0) return null;

  return (
    <section
      role="status"
      aria-live="polite"
      className="space-y-3"
      aria-label="Items needing attention"
    >
      {items.map((item) => {
        const isHigh = item.priority === "high";
        const isInfo = item.priority === "info";

        let Icon = AlertCircle;
        if (item.kind === "pending_orders" || item.kind === "overdue_orders" || item.kind === "pending_reservations") Icon = Clock;
        if (item.kind === "approval_pending" || item.kind === "approval_rejected") Icon = ShieldAlert;
        if (item.kind === "unpublished_changes") Icon = FileEdit;

        const borderCls = isHigh
          ? "border-red-200 bg-red-50/70 text-red-900"
          : isInfo
          ? "border-blue-200 bg-blue-50/70 text-blue-900"
          : "border-amber-200 bg-amber-50/70 text-amber-900";

        const iconCls = isHigh
          ? "text-red-600 bg-red-100"
          : isInfo
          ? "text-blue-600 bg-blue-100"
          : "text-amber-600 bg-amber-100";

        // Resolve placeholder paths in href
        const href = item.href
          ? item.href
              .replace("ORDERS_PATH", `${organizerId}/orders`)
              .replace("RESERVATIONS_PATH", `${organizerId}/reservations`)
              .replace("BUILDER_PATH", `${organizerId}/website/builder`)
              .replace("SETTINGS_PATH", `${organizerId}/settings`)
          : undefined;

        return (
          <div
            key={item.id}
            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border p-4 shadow-xs transition ${borderCls}`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconCls}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm leading-snug">
                  {item.title}
                </p>
                {item.description && (
                  <p className="mt-0.5 text-xs text-zinc-600">
                    {item.description}
                  </p>
                )}
              </div>
            </div>

            {href && item.actionLabel && (
              <Link
                href={href}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-zinc-800 transition active:scale-95 self-start sm:self-auto"
              >
                {item.actionLabel} →
              </Link>
            )}
          </div>
        );
      })}
    </section>
  );
}
