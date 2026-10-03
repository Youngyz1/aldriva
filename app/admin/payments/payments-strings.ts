/**
 * app/admin/payments/payments-strings.ts
 * Single copy file for the admin Payments page (English). Amount and date
 * formatting stay byte-identical to the pre-migration page.
 */

import type { StatItem } from "@/components/admin/StatStrip";

export const paymentsStrings = {
  eyebrow: "Admin",
  title: "Payments",
  description: "Most recent 50 ticket orders and donations. Read only.",

  ticketOrdersTitle: "Ticket Orders",
  donationsTitle: "Donations",

  columns: {
    buyer: "Buyer",
    event: "Event",
    donor: "Donor",
    fundraiser: "Fundraiser",
    amount: "Amount",
    status: "Status",
    date: "Date",
  } as const,

  emptyOrders: "No orders yet.",
  emptyDonations: "No donations yet.",

  ordersNoun: "ticket orders",
  donationsNoun: "donations",
} as const;

/**
 * Sticky-footer line covering both read-only tables. Counts are the loaded
 * slice only (latest 50 each); there is no pagination and no new query.
 * Same "start-end of total noun" shape as tableStrings.showingResults.
 */
export function paymentsFooter(ordersShown: number, donationsShown: number): string {
  const line = (shown: number, noun: string) => `1-${shown} of ${shown} ${noun}`;
  return `${line(ordersShown, paymentsStrings.ordersNoun)} · ${line(donationsShown, paymentsStrings.donationsNoun)}`;
}

/**
 * Format an amount with its own stored currency code. Null or unknown
 * codes fall back to the legacy $ rendering, byte-identical to before.
 */
export function formatMoneyWithCurrency(
  n: number | null,
  currency: string | null
): string {
  const legacy = () =>
    `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  if (!currency) return legacy();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(Number(n || 0));
  } catch {
    return legacy();
  }
}

/**
 * Shown-slice per-status chips (latest 50 only; no new query). Null
 * statuses read as the fallback, mirroring the displayed status text.
 */
export function statusChips(
  rows: { status: string | null }[],
  noun: string,
  fallback: string
): StatItem[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const status = r.status ?? fallback;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, n]) => ({
    label: `${status} ${noun}`,
    value: n,
  }));
}
