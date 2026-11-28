import { notFound, redirect } from "next/navigation";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { formatMoney } from "@/lib/money";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await assertCanManageBusiness(id);
  if (!auth.ok) return notFound();

  const admin = createSupabaseAdmin();
  const { data: business } = await admin
    .from("businesses")
    .select("id, name, organizer_id")
    .eq("id", id)
    .maybeSingle();

  if (business?.organizer_id) {
    redirect(`/dashboard/org/${business.organizer_id}/orders`);
  }

  // Fallback for standalone business without linked organizer tenant
  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("id, order_number, customer_name, items, total_amount, currency, status, payment_status, created_at")
    .eq("business_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (ordersError) return notFound();

  const revenueByCurrency = new Map<string, number>();
  for (const order of orders ?? []) {
    if (order.payment_status !== "paid") continue;
    const currency = String(order.currency || "USD").toUpperCase();
    revenueByCurrency.set(currency, (revenueByCurrency.get(currency) ?? 0) + Number(order.total_amount));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Orders — {business?.name || id.slice(0, 8)}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Showing storefront and restaurant orders for this business.
        </p>
        {revenueByCurrency.size ? (
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            Collected revenue: {[...revenueByCurrency].map(([currency, amount]) => formatMoney(amount, currency)).join(" · ")}
          </p>
        ) : null}
      </div>

      {!orders || orders.length === 0 ? (
        <div className="py-12 text-center text-sm text-zinc-500">
          No orders received yet for this business.
        </div>
      ) : (
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {orders.map((ord) => (
            <div key={ord.id} className="flex items-center justify-between gap-4 p-4 text-sm">
              <div className="min-w-0">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  #{ord.order_number}
                </span>{" "}
                — {ord.customer_name}
                <p className="mt-1 text-xs text-zinc-500">
                  {new Date(ord.created_at).toLocaleString()} · {ord.status}
                </p>
                {Array.isArray(ord.items) ? (
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {ord.items.map((item: { name?: string; quantity?: number }) => `${item.quantity ?? 1}× ${item.name ?? "Item"}`).join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="text-zinc-600 dark:text-zinc-300">
                  {formatMoney(Number(ord.total_amount), String(ord.currency || "USD"))}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    ord.payment_status === "paid"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {ord.payment_status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
