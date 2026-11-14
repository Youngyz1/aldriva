import React from "react";
import type { VehicleStatus } from "@/lib/actions/vehicles";

export interface FleetStatusBadgeProps {
  status: VehicleStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  VehicleStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  available: {
    label: "Available",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  rented: {
    label: "Out on Rental",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200",
    dot: "bg-blue-500",
  },
  maintenance: {
    label: "In Maintenance",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  out_of_service: {
    label: "Out of Service",
    bg: "bg-zinc-100",
    text: "text-zinc-700",
    border: "border-zinc-200",
    dot: "bg-zinc-400",
  },
};

export function FleetStatusBadge({ status, className = "" }: FleetStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.available;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
