"use client";

/**
 * OrderSummary
 * ────────────
 * Reusable order summary card used in both event checkout and donation flows.
 *
 * Props
 *   title      – card heading, e.g. "Order summary" or "Your donation"
 *   items      – line items shown above the total
 *   total      – total amount (number)
 *   currency   – currency code, defaults to "USD"
 *   accentColor – color used for the total amount
 *   children   – optional footer content (e.g. progress bar for fundraisers)
 */

type LineItem = {
  label: string;
  value: string | number;
  /** If true, renders value in a muted style (e.g. optional fields) */
  muted?: boolean;
};

type Props = {
  title?: string;
  items: LineItem[];
  total: number;
  currency?: string;
  accentColor?: string;
  children?: React.ReactNode;
};

function formatMoney(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function OrderSummary({
  title = "Order summary",
  items,
  total,
  currency = "USD",
  accentColor = "#f97316",
  children,
}: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-6 py-4">
        <h3 className="text-sm font-black text-zinc-800">{title}</h3>
      </div>

      <div className="space-y-1 px-6 py-4">
        {items.map((item, i) => (
          <div key={i} className="flex items-start justify-between py-1.5">
            <span className="text-sm text-zinc-500">{item.label}</span>
            <span
              className={`ml-4 text-right text-sm ${
                item.muted ? "text-zinc-400" : "font-semibold text-zinc-800"
              }`}
            >
              {typeof item.value === "number"
                ? formatMoney(item.value, currency)
                : item.value}
            </span>
          </div>
        ))}

        <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
          <span className="text-sm font-black text-zinc-800">Total</span>
          <span className="text-lg font-black" style={{ color: accentColor }}>
            {formatMoney(total, currency)}
          </span>
        </div>
      </div>

      {children && (
        <div className="border-t border-zinc-100 px-6 pb-5 pt-4">{children}</div>
      )}
    </div>
  );
}

export { formatMoney };
