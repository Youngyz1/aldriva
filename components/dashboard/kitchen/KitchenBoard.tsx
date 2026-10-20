"use client";

import { useCallback, useEffect, useState } from "react";
import { transitionKitchenOrder } from "@/lib/actions/kitchen-orders";
import { KitchenOrderCard, type KitchenOrder } from "./KitchenOrderCard";

type OrdersResponse = {
  ok: true;
  viewer: "cook" | "display";
  orders: KitchenOrder[];
};

const POLL_INTERVAL_MS = 30_000;

export default function KitchenBoard() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [viewer, setViewer] = useState<"cook" | "display" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch("/api/kitchen/orders", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Kitchen orders are temporarily unavailable.");
      const payload = result as OrdersResponse;
      setOrders(Array.isArray(payload.orders) ? payload.orders : []);
      setViewer(payload.viewer);
      setError("");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Kitchen orders are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  async function updateOrder(order: KitchenOrder, nextStatus: "preparing" | "ready") {
    setBusyOrderId(order.id);
    setError("");
    try {
      const result = await transitionKitchenOrder(
        order.id,
        order.status as "accepted" | "preparing",
        nextStatus
      );
      if (!result.success) throw new Error("This order could not be updated. Refresh and try again.");
      await refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "This order could not be updated.");
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-800">Kitchen</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">Order board</h1>
        <p className="mt-2 text-sm text-zinc-600">Updates every 30 seconds while this screen is visible.</p>
      </header>

      {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? (
        <p role="status" className="text-sm text-zinc-600">Loading kitchen orders…</p>
      ) : !viewer ? (
        <p role="alert" className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">This kitchen link is invalid or has expired. Ask the business owner for a current link.</p>
      ) : orders.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">No accepted, preparing, or recently ready orders.</p>
      ) : (
        <section aria-label="Kitchen orders" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              canUpdate={viewer === "cook"}
              busy={busyOrderId === order.id}
              onTransition={updateOrder}
            />
          ))}
        </section>
      )}
    </main>
  );
}
