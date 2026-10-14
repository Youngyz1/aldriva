"use client";

import Link from "next/link";
import { ShoppingBag, DollarSign, Store, CalendarCheck } from "lucide-react";
import { formatCurrency } from "@/lib/format-locale";
import type { TodayMetrics } from "@/lib/overview-types";

export interface TodayStripProps {
  metrics: TodayMetrics;
  organizerId: string;
}

export function TodayStrip({ metrics, organizerId }: TodayStripProps) {
  const formattedSales = formatCurrency(metrics.salesTotal, metrics.currency, "en");
  const formattedPaid = formatCurrency(metrics.paidTotal, metrics.currency, "en");
  const formattedToCollect = formatCurrency(metrics.toCollectTotal, metrics.currency, "en");

  return (
    <section aria-labelledby="today-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="today-heading" className="text-sm font-black uppercase tracking-wider text-zinc-400">
          Today · {metrics.timeZone}
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
            metrics.isOpen
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-zinc-200 bg-zinc-100 text-zinc-600"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              metrics.isOpen ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
            }`}
            aria-hidden="true"
          />
          {metrics.hoursBadgeText}
        </span>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {/* Orders Today Card */}
        <Link
          href={`/dashboard/org/${organizerId}/orders`}
          className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-orange-300 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 transition group-hover:scale-105">
            <ShoppingBag className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-black text-zinc-950 tabular-nums">
              {metrics.ordersCount}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Orders placed today
            </p>
          </div>
        </Link>

        {/* Orders Value Today Card (with paid vs to-collect split) */}
        <div className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <DollarSign className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-black text-zinc-950 tabular-nums truncate">
                {formattedSales}
              </p>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Orders value today
              </p>
            </div>
          </div>
          {metrics.salesTotal > 0 && (
            <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
              <span>Paid: <strong className="text-zinc-800 tabular-nums">{formattedPaid}</strong></span>
              <span>To collect: <strong className="text-zinc-800 tabular-nums">{formattedToCollect}</strong></span>
            </div>
          )}
        </div>

        {/* Business Hours Card */}
        <div className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs sm:col-span-2 lg:col-span-1">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Store className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-zinc-900 leading-snug">
              {metrics.isOpen ? "Open for orders" : "Currently closed"}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5 truncate">
              {metrics.hoursBadgeText}
            </p>
          </div>
        </div>

        {/* Upcoming Tables Today Card (reservations module only) */}
        {metrics.reservationsToday !== undefined && (
          <Link
            href={`/dashboard/org/${organizerId}/reservations`}
            className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-orange-300 hover:shadow-sm"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition group-hover:scale-105">
              <CalendarCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-black text-zinc-950 tabular-nums">
                {metrics.reservationsToday}
              </p>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Upcoming tables today
              </p>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
