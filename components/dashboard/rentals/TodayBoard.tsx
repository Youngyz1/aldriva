/**
 * components/dashboard/rentals/TodayBoard.tsx
 *
 * Today's pickups, drop-offs, and late (overdue) returns — rendered at the
 * top of the Rentals page. Styled like FinancialsCard.tsx (bordered
 * rounded-xl white card, clear hierarchy, big numbers): one card, three
 * columns on desktop, stacked on mobile. Pure presentational — all data
 * is fetched server-side in app/dashboard/org/[id]/rentals/page.tsx.
 */

import type { ComponentType } from "react";
import Link from "next/link";
import {
  IconCalendarClock as CalendarClock,
  IconLogout as DropoffIcon,
  IconAlertTriangle as AlertTriangle,
} from "@tabler/icons-react";
import { formatMoney } from "@/lib/money";

export type TodayBoardPaymentStatus = "paid" | "partially_paid" | "unpaid" | "refunded";

export interface TodayBoardItem {
  id: string;
  bookingNumber: string;
  customerName: string;
  vehicleLabel: string | null;
  time: string;
  paymentStatus: TodayBoardPaymentStatus;
  balanceDue: number;
  currency: string;
}

export interface TodayBoardProps {
  organizerId: string;
  pickups: TodayBoardItem[];
  dropoffs: TodayBoardItem[];
  lateReturns: TodayBoardItem[];
}

const PAYMENT_BADGE: Record<TodayBoardPaymentStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-green-50 text-green-700 border-green-200" },
  partially_paid: { label: "Partially paid", className: "bg-amber-50 text-amber-700 border-amber-200" },
  unpaid: { label: "Unpaid", className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  refunded: { label: "Refunded", className: "bg-blue-50 text-blue-700 border-blue-200" },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function PaymentBadge({ item }: { item: TodayBoardItem }) {
  const badge = PAYMENT_BADGE[item.paymentStatus] ?? PAYMENT_BADGE.unpaid;
  return (
    <span className={`inline-flex items-center rounded-lg border px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>
      {badge.label}
      {item.balanceDue > 0 && (item.paymentStatus === "partially_paid" || item.paymentStatus === "unpaid") && (
        <span className="ml-1 font-mono">{formatMoney(item.balanceDue, item.currency)}</span>
      )}
    </span>
  );
}

function BoardColumn({
  organizerId,
  title,
  icon: Icon,
  items,
  emptyLabel,
  tone = "zinc",
}: {
  organizerId: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  items: TodayBoardItem[];
  emptyLabel: string;
  tone?: "zinc" | "red";
}) {
  return (
    <div className="space-y-2 p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          <Icon className="h-3.5 w-3.5 text-zinc-400" />
          {title}
        </p>
        <span
          className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
            tone === "red" && items.length > 0 ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/dashboard/org/${organizerId}/rentals/${item.id}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition hover:bg-zinc-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900">{item.customerName}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {formatTime(item.time)}
                    {item.vehicleLabel ? ` · ${item.vehicleLabel}` : ""}
                    {" · "}
                    <span className="font-mono">{item.bookingNumber}</span>
                  </p>
                </div>
                <PaymentBadge item={item} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TodayBoard({ organizerId, pickups, dropoffs, lateReturns }: TodayBoardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 sm:divide-y-0 sm:divide-x sm:grid sm:grid-cols-3">
      <BoardColumn
        organizerId={organizerId}
        title="Today's Pickups"
        icon={CalendarClock}
        items={pickups}
        emptyLabel="No pickups scheduled today."
      />
      <BoardColumn
        organizerId={organizerId}
        title="Today's Drop-offs"
        icon={DropoffIcon}
        items={dropoffs}
        emptyLabel="No drop-offs scheduled today."
      />
      <BoardColumn
        organizerId={organizerId}
        title="Late Returns"
        icon={AlertTriangle}
        items={lateReturns}
        emptyLabel="No overdue returns."
        tone="red"
      />
    </div>
  );
}
