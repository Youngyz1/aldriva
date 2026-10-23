"use client";

export type KitchenOrder = {
  id: string;
  status: "accepted" | "preparing" | "ready";
  shortCode: string;
  orderNumber: string;
  fulfilmentType: "PICKUP" | "DELIVERY";
  customerFirstName: string | null;
  items: Array<{
    name: string;
    quantity: number;
    options: Array<{ name: string; quantity: number }>;
  }>;
  customerNote: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  estimatedReadyAt: string | null;
  readyAt: string | null;
  isNew: boolean;
};

type Props = {
  order: KitchenOrder;
  canUpdate: boolean;
  busy: boolean;
  onTransition: (order: KitchenOrder, nextStatus: "preparing" | "ready") => void;
};

function clockTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function KitchenOrderCard({ order, canUpdate, busy, onTransition }: Props) {
  const createdTime = clockTime(order.createdAt);
  const readyTime = clockTime(order.estimatedReadyAt);
  const completedTime = clockTime(order.readyAt);

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span aria-label={`Short order code ${order.shortCode}`} className="text-4xl font-black leading-none tracking-tight text-zinc-950">
              {order.shortCode || "----"}
            </span>
            {order.isNew && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-sm font-bold text-orange-900">NEW</span>}
          </div>
          <p className="mt-1 text-sm text-zinc-600">{order.orderNumber}</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-sm font-bold tracking-wide ${order.fulfilmentType === "PICKUP" ? "bg-sky-100 text-sky-900" : "bg-violet-100 text-violet-900"}`}>
          {order.fulfilmentType}
        </span>
      </header>

      {order.fulfilmentType === "PICKUP" && order.customerFirstName && (
        <p className="mt-3 text-sm font-medium text-zinc-700">Pickup for {order.customerFirstName}</p>
      )}

      <ul className="mt-4 space-y-3">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="border-t border-zinc-100 pt-3 first:border-0 first:pt-0">
            <p className="font-semibold text-zinc-900">{item.quantity} × {item.name}</p>
            {item.options.length > 0 && (
              <p className="mt-1 text-sm text-zinc-600">
                {item.options.map((option) => `${option.quantity > 1 ? `${option.quantity} × ` : ""}${option.name}`).join(", ")}
              </p>
            )}
          </li>
        ))}
      </ul>

      {order.customerNote && (
        <section className="mt-4 rounded-xl bg-amber-50 p-3">
          <h2 className="text-sm font-bold text-amber-950">Customer note</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">{order.customerNote}</p>
        </section>
      )}

      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-700">
        {createdTime && <div><dt className="inline font-medium">Ordered </dt><dd className="inline">{createdTime}</dd></div>}
        {readyTime && <div><dt className="inline font-medium">Ready by </dt><dd className="inline">{readyTime}</dd></div>}
        {order.status === "ready" && completedTime && <div><dt className="inline font-medium">Ready at </dt><dd className="inline">{completedTime}</dd></div>}
      </dl>

      {canUpdate && order.status === "accepted" && (
        <button type="button" disabled={busy} onClick={() => onTransition(order, "preparing")} className="mt-5 min-h-11 w-full rounded-xl bg-orange-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
          {busy ? "Updating…" : "Start preparing"}
        </button>
      )}
      {canUpdate && order.status === "preparing" && (
        <button type="button" disabled={busy} onClick={() => onTransition(order, "ready")} className="mt-5 min-h-11 w-full rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
          {busy ? "Updating…" : "Mark ready"}
        </button>
      )}
    </article>
  );
}
