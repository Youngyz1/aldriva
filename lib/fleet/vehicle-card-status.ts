/**
 * lib/fleet/vehicle-card-status.ts
 *
 * Pure helper, no "use server" / "server-only" — imported by both a
 * client component (FleetDirectoryClient.tsx) and a server component
 * (fleet/page.tsx). Moved out of lib/actions/vehicles.ts, where a
 * synchronous export broke the "use server" build ("Server Actions must
 * be async functions").
 */

import type { VehicleRow } from "@/lib/actions/vehicles";

export type VehicleCardStatus = "available" | "rented" | "maintenance" | "inactive";

/**
 * Single source of truth for the fleet "effective" status shown on the
 * Fleet cards and used for the Fleet page's header tiles — so the two
 * can never disagree. Out-on-rental is derived from a live booking
 * (isActiveNow), not the manually-set vehicles.status field, which can go
 * stale. Maintenance/inactive are the owner's own explicit flags and
 * always win over the booking signal.
 */
export function resolveVehicleCardStatus(
  vehicle: Pick<VehicleRow, "status">,
  isActiveNow: boolean
): VehicleCardStatus {
  if (vehicle.status === "maintenance") return "maintenance";
  if (vehicle.status === "out_of_service") return "inactive";
  if (isActiveNow) return "rented";
  return "available";
}
