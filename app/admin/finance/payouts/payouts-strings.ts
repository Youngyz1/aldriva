/**
 * app/admin/finance/payouts/payouts-strings.ts
 * Single copy file for the admin Payouts page (English, new chrome only).
 * Both money modals keep their copy inline so those flows stay
 * byte-identical.
 */

export const payoutsStrings = {
  eyebrow: "Admin",
  title: "Payout Management",
  description:
    "Disburse recipient funds, complete bank transfers, and manage payout state transitions.",

  searchPlaceholder: "Search recipient or ID...",

  tabs: [
    { value: "all", label: "All" },
    { value: "requested", label: "Requested" },
    { value: "processing", label: "Processing" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
  ] as const,

  columns: {
    recipient: "Recipient",
    amount: "Amount",
    status: "Status",
    destination: "Destination",
    payout: "Payout",
  } as const,

  statusLabels: {
    requested: "Requested",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  } as const,

  emptyTitle: "No payout records found",
  emptySub: "No payout requests matching the selected filters.",

  actionRequired: "Action required",
  totalVolume: "Total volume",
  terminal: "Terminal",
  stateLabel: "State",

  startProcessing: "Start Processing",
  /** Three ASCII dots, exactly as the pre-migration button. */
  updating: "Updating...",
  complete: "Complete…",
  fail: "Fail…",

  loadedTab: "loaded tab",
  unknownCurrency: "unknown currency",
} as const;

export type CurrencyVolume = { currency: string; total: number };

/**
 * Group loaded-tab amounts per currency code (upper-cased) — totals are
 * never added together across currencies. Sorted largest-first.
 */
export function groupVolumeByCurrency(
  items: { amount: number; currency: string | null }[]
): CurrencyVolume[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const code = (item.currency || "").toUpperCase();
    map.set(code, (map.get(code) ?? 0) + item.amount);
  }
  return [...map.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Format one per-currency total with its own code. Empty codes fall back
 * to the legacy $ rendering; unknown codes render as "CODE 0.00".
 */
export function formatCurrencyTotal(total: number, currency: string): string {
  if (!currency) return `$${total.toFixed(2)}`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(total);
  } catch {
    return `${currency} ${total.toFixed(2)}`;
  }
}
