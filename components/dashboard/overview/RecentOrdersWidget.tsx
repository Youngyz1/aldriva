"use client";

import Link from "next/link";
import { formatMoney as formatCurrency } from "@/lib/money";
import type { RecentOrderSummary } from "@/lib/overview-types";

export interface RecentOrdersWidgetProps {
  orders: RecentOrderSummary[];
  organizerId: string;
}

const STATUS_VARIANTS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  accepted: "bg-blue-50 text-blue-700 border-blue-200",
  preparing: "bg-violet-50 text-violet-700 border-violet-200",
  ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
  out_for_delivery: "bg-sky-50 text-sky-700 border-sky-200",
  delivered: "bg-zinc-100 text-zinc-600 border-zinc-200",
  completed: "bg-zinc-100 text-zinc-600 border-zinc-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

function formatTimeAgo(isoDate: string): string {
  const diffSec = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function RecentOrdersWidget({ orders, organizerId }: RecentOrdersWidgetProps) {
  if (!orders || orders.length === 0) return null;

  return (
    <section aria-labelledby="recent-orders-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="recent-orders-heading" className="text-sm font-black uppercase tracking-wider text-zinc-400">
          Recent Orders
        </h2>
        <Link
          href={`/dashboard/org/${organizerId}/orders`}
          className="text-xs font-bold text-orange-700 hover:text-orange-800 hover:underline"
        >
          View all orders →
        </Link>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
        <ul className="divide-y divide-zinc-100">
          {orders.map((order) => {
            const formattedTotal = formatCurrency(order.totalAmount, order.currency, "en");
            const badgeCls = STATUS_VARIANTS[order.status] || "bg-zinc-100 text-zinc-600 border-zinc-200";
            const firstName = order.customerName.trim().split(/\s+/)[0] || "Customer";

            return (
              <li key={order.id}>
                <Link
                  href={`/dashboard/org/${organizerId}/orders`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-zinc-50 transition"
                >
                  <div className="min-w-0 flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                    <div>
                      <p className="font-bold text-sm text-zinc-900 truncate">
                        {order.orderNumber}
                      </p>
                      <p className="text-xs text-zinc-400 truncate">
                        {order.fulfilmentType}
                      </p>
                    </div>

                    <p className="text-sm text-zinc-700 truncate">
                      {firstName}
                    </p>

                    <p className="text-xs text-zinc-500 tabular-nums">
                      {formatTimeAgo(order.createdAt)}
                    </p>

                    <p className="text-sm font-bold text-zinc-950 tabular-nums">
                      {formattedTotal}
                    </p>
                  </div>

                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize shrink-0 ${badgeCls}`}>
                    {order.status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
