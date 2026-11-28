/**
 * components/dashboard/overview/modules/OrdersMenuSection.tsx
 *
 * Real tenant-scoped Orders & Menu operational section.
 */

import React from "react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { formatMoney } from "@/lib/money";
import { StatCard } from "../StatCard";
import { StatusChip } from "../StatusChip";
import { EmptyState } from "../EmptyState";
import {
  IconReceipt as Receipt,
  IconArrowRight as ArrowRight,
  IconClock as Clock,
} from "@tabler/icons-react";

export interface OrdersMenuSectionProps {
  organizerId: string;
  fromIso: string;
  toIso: string;
  canManage?: boolean;
}

interface OrderRow {
  id: string;
  order_number: string;
  customer_name: string;
  total_amount: number;
  currency: string;
  status: string;
  payment_status: string;
  fulfilment_type: string;
  created_at: string;
}

export async function OrdersMenuSection({
  organizerId,
  fromIso,
  toIso,
  canManage = true,
}: OrdersMenuSectionProps) {
  const supabase = createSupabaseAdmin();

  let orders: OrderRow[] = [];
  let pendingCount = 0;
  let totalSales = 0;
  let currency = "USD";

  try {
    const [periodRes, pendingRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, customer_name, total_amount, currency, status, payment_status, fulfilment_type, created_at")
        .eq("organizer_id", organizerId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", organizerId)
        .eq("status", "pending"),
    ]);

    if (!periodRes.error && Array.isArray(periodRes.data)) {
      orders = periodRes.data as OrderRow[];
      if (orders.length > 0 && orders[0].currency) {
        currency = orders[0].currency;
      }
      totalSales = orders
        .filter((o) => o.status !== "cancelled" && o.payment_status !== "refunded")
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    }
    pendingCount = pendingRes.count ?? 0;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[OrdersMenuSection] query error:", err);
    }
  }

  const recentList = orders.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-brand-700" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
            Orders & Kitchen
          </h2>
        </div>
        {canManage && (
          <Link
            href={`/dashboard/org/${organizerId}/orders`}
            className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
          >
            <span>All orders</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="Total Orders"
          value={orders.length}
          format="count"
          href={`/dashboard/org/${organizerId}/orders`}
        />
        <StatCard
          label="Gross Sales"
          value={totalSales}
          format="money"
          currency={currency}
        />
        <StatCard
          label="Needs Attention"
          value={pendingCount}
          format="count"
          hint={pendingCount > 0 ? "Pending confirmation" : undefined}
          href={`/dashboard/org/${organizerId}/orders?status=pending`}
        />
      </div>

      {recentList.length === 0 ? (
        <EmptyState
          variant="inline"
          title="No orders placed in this period."
          action={{
            label: "View Orders",
            href: `/dashboard/org/${organizerId}/orders`,
          }}
          icon={Clock}
        />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
          {recentList.map((order) => (
            <div
              key={order.id}
              className="min-h-[52px] flex items-center justify-between p-3.5 gap-3 hover:bg-zinc-50/60 transition"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-900">
                    #{order.order_number}
                  </span>
                  <span className="text-xs text-zinc-400">·</span>
                  <span className="text-sm font-semibold text-zinc-800 truncate">
                    {order.customer_name}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {order.fulfilment_type ? order.fulfilment_type.replace("_", " ") : "Order"}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-bold tabular-nums text-zinc-900">
                  {formatMoney(Number(order.total_amount), order.currency || currency)}
                </span>
                <StatusChip domain="order" value={order.status} size="sm" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
