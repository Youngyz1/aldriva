"use client";

/**
 * components/dashboard/rentals/VehicleAssignmentPanel.tsx
 *
 * Panel for assigning or reassigning a vehicle to a booking.
 * Staff-only. Calls assignVehicleToBooking server action.
 */

import { vehicleLabel } from "@/lib/vehicle-label";
import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconCar as Car,
  IconLoader2 as Loader,
  IconCheck as Check,
} from "@tabler/icons-react";

export interface AssignableVehicle {
  id: string;
  make: string;
  model: string;
  license_plate: string;
  current_mileage: number;
  status: string;
  branch_id: string | null;
}

export interface VehicleAssignmentPanelProps {
  bookingId: string;
  organizerId: string;
  currentVehicleId: string | null;
  currentVehicleLabel?: string | null;
  availableVehicles: AssignableVehicle[];
  categoryId: string;
  canManage: boolean;
}

export function VehicleAssignmentPanel({
  bookingId,
  organizerId,
  currentVehicleId,
  currentVehicleLabel,
  availableVehicles,
  canManage,
}: VehicleAssignmentPanelProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState(currentVehicleId ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  function handleAssign() {
    if (!selectedVehicleId) return;
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        const { assignVehicleToBooking } = await import("@/lib/actions/rental-bookings");
        const result = await assignVehicleToBooking(bookingId, organizerId, selectedVehicleId);
        if (result && "error" in result) {
          if (result.error === "VEHICLE_CONFLICT") {
            setError("That vehicle already has an overlapping booking. Choose a different vehicle.");
          } else {
            setError(result.error || "Assignment failed");
          }
          return;
        }
        setSuccess(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Assignment failed");
      }
    });
  }

  if (!canManage) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-600">
        <Car className="h-4 w-4 text-zinc-400" />
        {currentVehicleLabel ?? <span className="text-amber-600 font-medium">Unassigned</span>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {currentVehicleId && currentVehicleLabel && (
        <div className="flex items-center gap-2 text-sm text-zinc-700">
          <Car className="h-4 w-4 text-zinc-400" />
          <span>Currently: <strong>{currentVehicleLabel}</strong></span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}

      {success && (
        <div className="flex items-center gap-1.5 text-xs text-green-700 font-semibold">
          <Check className="h-3.5 w-3.5" />
          Vehicle assigned
        </div>
      )}

      <div className="flex gap-2">
        <select
          value={selectedVehicleId}
          onChange={(e) => setSelectedVehicleId(e.target.value)}
          className="flex-1 h-9 px-3 rounded-xl border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
          disabled={isPending}
        >
          <option value="">Select a vehicle…</option>
          {availableVehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {vehicleLabel(v.make, v.model)} ({v.license_plate}) · {v.current_mileage.toLocaleString()} km
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAssign}
          disabled={isPending || !selectedVehicleId || selectedVehicleId === currentVehicleId}
          className="inline-flex items-center gap-1 h-9 px-4 rounded-xl bg-brand-700 text-xs font-bold text-white hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isPending ? <Loader className="h-3.5 w-3.5 animate-spin" /> : null}
          {currentVehicleId ? "Reassign" : "Assign"}
        </button>
      </div>
    </div>
  );
}
