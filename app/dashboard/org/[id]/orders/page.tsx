/**
 * app/dashboard/org/[id]/orders/page.tsx
 *
 * Owner order visibility page (Phase 2b-2).
 * Fetches orders for the tenant, scoped to the authenticated organizer.
 * Allowed roles: owner, admin, manager, editor, finance (read) — matches the
 * RLS defined in migration_171_orders.sql.
 */

import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getTranslations } from "next-intl/server";
import { formatCurrency } from "@/lib/format-locale";

interface OrderRow {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  fulfilment_type: "pickup" | "delivery";
  delivery_address: string | null;
  customer_note: string | null;
  currency: string;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  status: string;
  payment_method: string;
  payment_status: string;
  scheduled_for: string | null;
  items: unknown;
  created_at: string;
}

interface OrderItemSnapshot {
  item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  chosen_options?: Array<{ name: string; price_delta: number }>;
}

const ALLOWED_ROLES = ["owner", "admin", "manager", "editor", "finance"] as const;

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await checkTenantAccess(user.id, organizerId, [...ALLOWED_ROLES]);
  if (!access.hasAccess) {
    return notFound();
  }

  const admin = createSupabaseAdmin();
  const { data: orders, error } = await admin
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_phone, customer_email, fulfilment_type, delivery_address, customer_note, currency, subtotal, delivery_fee, total_amount, status, payment_method, payment_status, scheduled_for, items, created_at"
    )
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[orders-page] fetch error:", error.code);
  }

  const t = await getTranslations("Orders");
  const orderRows = (orders ?? []) as OrderRow[];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
        </div>
      </div>

      {orderRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-8 py-16 text-center">
          <p className="text-base font-medium text-zinc-700">{t("noOrders")}</p>
          <p className="mt-1 text-sm text-zinc-400">{t("noOrdersDescription")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orderRows.map((order) => {
            const items = Array.isArray(order.items) ? (order.items as OrderItemSnapshot[]) : [];
            const total = formatCurrency(order.total_amount, order.currency, "en");
            const date = new Date(order.created_at).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            });
            return (
              <details
                key={order.id}
                className="group rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden"
              >
                {/* Summary row (collapsed) */}
                <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 hover:bg-zinc-50 transition-colors">
                  <div className="min-w-0 flex-1 grid grid-cols-2 gap-x-4 gap-y-0.5 md:grid-cols-4">
                    <span className="text-sm font-semibold text-zinc-800 truncate">
                      {order.order_number}
                    </span>
                    <span className="text-sm text-zinc-600 truncate">{order.customer_name}</span>
                    <span className="text-sm text-zinc-500 hidden md:block">{date}</span>
                    <span className="text-sm font-medium text-zinc-800 tabular-nums hidden md:block">{total}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={order.status} />
                    <span className="text-xs text-zinc-400 capitalize">{order.fulfilment_type}</span>
                  </div>
                </summary>

                {/* Expanded detail */}
                <div className="border-t border-zinc-100 px-5 py-4 space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                    <Field label={t("customer")}>
                      <p className="font-medium">{order.customer_name}</p>
                      <p className="text-zinc-500">{order.customer_phone}</p>
                      {order.customer_email && <p className="text-zinc-500">{order.customer_email}</p>}
                    </Field>

                    <Field label={t("fulfilment")}>
                      <p className="capitalize">{order.fulfilment_type}</p>
                      {order.delivery_address && (
                        <p className="text-zinc-500 mt-0.5">{order.delivery_address}</p>
                      )}
                    </Field>

                    <Field label={t("payment")}>
                      <p>{t("toCollect")}</p>
                      <p className="font-semibold text-zinc-800 mt-0.5">{total}</p>
                    </Field>

                    {order.scheduled_for && (
                      <Field label={t("scheduledFor")}>
                        <p className="text-zinc-700">
                          {new Date(order.scheduled_for).toLocaleString("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </Field>
                    )}

                    {order.customer_note && (
                      <Field label={t("note")}>
                        <p className="text-zinc-600">{order.customer_note}</p>
                      </Field>
                    )}
                  </div>

                  {items.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                        {t("items")}
                      </p>
                      <ul className="divide-y divide-zinc-100">
                        {items.map((item, idx) => (
                          <li key={idx} className="flex items-start justify-between py-2 text-sm">
                            <div>
                              <p className="font-medium text-zinc-800">
                                {item.quantity} × {item.name}
                              </p>
                              {item.chosen_options && item.chosen_options.length > 0 && (
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  {item.chosen_options.map((o) => o.name).join(", ")}
                                </p>
                              )}
                            </div>
                            <p className="font-medium text-zinc-700 tabular-nums ml-4">
                              {formatCurrency(item.line_total, order.currency, "en")}
                            </p>
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-center justify-between pt-2 mt-1 border-t border-zinc-100 text-sm font-semibold text-zinc-800">
                        <span>{t("total")}</span>
                        <span className="tabular-nums">{total}</span>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    accepted: "bg-blue-50 text-blue-700 border-blue-200",
    preparing: "bg-violet-50 text-violet-700 border-violet-200",
    ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
    completed: "bg-zinc-100 text-zinc-500 border-zinc-200",
    cancelled: "bg-red-50 text-red-600 border-red-200",
  };
  const cls = variants[status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1">{label}</p>
      {children}
    </div>
  );
}
