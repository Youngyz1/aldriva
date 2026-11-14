/**
 * components/dashboard/rentals/RentalBookingStatusBadge.tsx
 *
 * Status chip for rental booking rows.
 * Matches the design system's StatusChip pattern (Zinc + semantic colors).
 */

import React from "react";

export type RentalBookingStatus =
  | "pending"
  | "awaiting_payment"
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled"
  | "expired"
  | "no_show";

interface StatusConfig {
  label: string;
  className: string;
}

const STATUS_MAP: Record<RentalBookingStatus, StatusConfig> = {
  pending: {
    label: "Pending",
    className:
      "bg-amber-50 text-amber-700 border border-amber-200",
  },
  awaiting_payment: {
    label: "Awaiting payment",
    className:
      "bg-violet-50 text-violet-700 border border-violet-200",
  },
  confirmed: {
    label: "Confirmed",
    className:
      "bg-blue-50 text-blue-700 border border-blue-200",
  },
  active: {
    label: "Active",
    className:
      "bg-green-50 text-green-700 border border-green-200",
  },
  completed: {
    label: "Completed",
    className:
      "bg-zinc-100 text-zinc-600 border border-zinc-200",
  },
  cancelled: {
    label: "Cancelled",
    className:
      "bg-zinc-50 text-zinc-500 border border-zinc-200",
  },
  expired: {
    label: "Expired",
    className:
      "bg-zinc-50 text-zinc-400 border border-zinc-200",
  },
  no_show: {
    label: "No Show",
    className:
      "bg-red-50 text-red-700 border border-red-200",
  },
};

export interface RentalBookingStatusBadgeProps {
  status: RentalBookingStatus | string;
  isOverdue?: boolean;
  size?: "sm" | "md";
}

export function RentalBookingStatusBadge({
  status,
  isOverdue = false,
  size = "sm",
}: RentalBookingStatusBadgeProps) {
  const config = STATUS_MAP[status as RentalBookingStatus] ?? {
    label: status,
    className: "bg-zinc-100 text-zinc-600 border border-zinc-200",
  };

  const sizeClass =
    size === "md"
      ? "text-xs font-semibold px-2.5 py-1 rounded-lg"
      : "text-[11px] font-bold px-2 py-0.5 rounded-md";

  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center ${sizeClass} ${config.className}`}>
        {config.label}
      </span>
      {isOverdue && (
        <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md bg-red-600 text-white">
          Overdue
        </span>
      )}
    </span>
  );
}
