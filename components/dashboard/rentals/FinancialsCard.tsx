/**
 * components/dashboard/rentals/FinancialsCard.tsx
 *
 * Financials summary for the rental booking detail page: rental amount,
 * paid, balance due, a paid/rental-amount progress bar, a payment status
 * badge, and the applied rental_payments history. Security deposits are
 * tracked on a separate panel and are never counted here as revenue.
 */

import { formatMoney } from "@/lib/money";

export type FinancialsPaymentStatus = "paid" | "partially_paid" | "unpaid" | "refunded";

export interface FinancialsPaymentRow {
  id: string;
  method: string;
  kind: string;
  amount: number;
  createdAt: string;
}

export interface FinancialsCardProps {
  currency: string;
  rentalAmount: number;
  paymentStatus: FinancialsPaymentStatus;
  payments: FinancialsPaymentRow[];
  lateFeeAmount?: number;
  lateFeeStatus?: string;
}

const STATUS_BADGE: Record<FinancialsPaymentStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-green-50 text-green-700 border-green-200" },
  partially_paid: { label: "Partially paid", className: "bg-amber-50 text-amber-700 border-amber-200" },
  unpaid: { label: "Unpaid", className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  refunded: { label: "Refunded", className: "bg-blue-50 text-blue-700 border-blue-200" },
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card_offline: "Card terminal",
  mobile_money: "Mobile money",
  stripe: "Card online",
};

function methodLabel(method: string): string {
  return METHOD_LABEL[method] ?? "Other";
}

const KIND_LABEL: Record<string, string> = {
  rental_charge: "Rental charge",
  advance: "Advance",
  balance: "Balance",
  refund: "Refund",
  late_fee: "Late fee",
  other: "Other",
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FinancialsCard({
  currency,
  rentalAmount,
  paymentStatus,
  payments,
  lateFeeAmount = 0,
  lateFeeStatus = "none",
}: FinancialsCardProps) {
  const netPaid = payments.reduce((total, row) => {
    const sign = row.kind === "refund" ? -1 : 1;
    return total + sign * row.amount;
  }, 0);
  const paid = Math.max(0, netPaid);
  const balanceDue = Math.max(0, rentalAmount - paid);
  const progressPercent = rentalAmount > 0 ? Math.min(100, Math.round((paid / rentalAmount) * 100)) : 0;
  const badge = STATUS_BADGE[paymentStatus] ?? STATUS_BADGE.unpaid;
  const showLateFee = lateFeeStatus !== "none" || lateFeeAmount > 0;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Payment</p>
        <span
          className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-bold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Rental amount</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-zinc-900">
            {formatMoney(rentalAmount, currency)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Paid</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-green-700">
            {formatMoney(paid, currency)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Balance due</p>
          <p className={`mt-1 text-lg font-extrabold tabular-nums ${balanceDue > 0 ? "text-amber-600" : "text-zinc-400"}`}>
            {formatMoney(balanceDue, currency)}
          </p>
        </div>
        {showLateFee && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Late fee</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-zinc-900">
              {formatMoney(lateFeeAmount, currency)}
            </p>
            <p className="text-[11px] font-semibold text-zinc-500 capitalize">{lateFeeStatus.replace(/_/g, " ")}</p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-green-600 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-[11px] font-semibold text-zinc-500 tabular-nums">
          {progressPercent}% of rental amount paid
        </p>
      </div>

      <div className="space-y-2 border-t border-zinc-100 pt-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Payment history</p>
        {payments.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {payments.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900">{methodLabel(row.method)}</p>
                  <p className="text-xs text-zinc-500">
                    {kindLabel(row.kind)} · {formatTime(row.createdAt)}
                  </p>
                </div>
                <p
                  className={`shrink-0 font-mono text-sm font-bold ${row.kind === "refund" ? "text-red-600" : "text-zinc-900"}`}
                >
                  {row.kind === "refund" ? "-" : ""}
                  {formatMoney(row.amount, currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
