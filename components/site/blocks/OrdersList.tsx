"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export interface OrdersListProps {
  siteSlug?: string;
  catalogName?: string;
  catalogHref?: string;
}

function readOrders(siteSlug?: string): Array<{ orderNumber: string; token?: string | null; savedAt?: number }> {
  const slug = siteSlug ?? "";
  if (typeof window === "undefined" || !slug) return [];
  try {
    const raw = localStorage.getItem(`aldriva_orders_${siteSlug}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((o) => o && typeof o.orderNumber === "string");
  } catch {
    return [];
  }
}

function saveOrders(siteSlug: string, orders: Array<{ orderNumber: string; token?: string | null; savedAt?: number }>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`aldriva_orders_${siteSlug}`, JSON.stringify(orders.slice(0, 50)));
  } catch {
    // Storage unavailable (private browsing)
  }
}

export function OrdersList({ siteSlug, catalogName, catalogHref = `/site/${siteSlug}/menu` }: OrdersListProps) {
  const [orders, setOrders] = useState<Array<{ orderNumber: string; token?: string | null; savedAt?: number }>>(() =>
    readOrders(siteSlug),
  );

  useEffect(() => {
    setOrders(readOrders(siteSlug));
  }, [siteSlug]);

  const sorted = orders.slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  const empty = sorted.length === 0;
  const slug = siteSlug ?? "";
  const name = catalogName ?? "Menu";
  const browseHref = catalogHref || `/site/${slug}/menu`;

  return (
    <div className="space-y-[var(--ps-space-4)]">
      <h2 className="text-[24px] sm:text-[32px] font-bold text-[var(--tf-ink)] leading-[1.2]">
        {empty ? "No orders yet" : "Your orders"}
      </h2>

      {empty ? (
        <div className="pt-[var(--ps-space-6)]">
          <p className="text-sm text-[var(--tf-muted)] mb-[var(--ps-space-4)]">
            You haven’t placed any orders from this device yet.
          </p>
          <Link
            href={browseHref}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[var(--tf-accent)] px-5 py-1.5 text-sm font-semibold text-[var(--tf-on-accent)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
          >
            Browse {name}
          </Link>
        </div>
      ) : (
        <div className="space-y-[var(--ps-space-3)]">
          {sorted.map((order) => (
            <a
              key={order.orderNumber}
              href={`/site/${siteSlug}/orders/${order.token ?? ""}`}
              className="flex items-center justify-between gap-[var(--ps-space-3)] rounded-xl border border-[var(--tf-border)] bg-[var(--tf-card)] p-[var(--ps-space-4)] text-[var(--tf-ink)] hover:bg-[var(--tf-soft)] transition"
            >
              <div>
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="text-xs text-[var(--tf-muted)]">
                  {order.savedAt ? new Date(order.savedAt).toLocaleString() : ""} · Placed
                </p>
              </div>
              <span className="text-sm font-medium text-[var(--tf-accent)]">Track order →</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
