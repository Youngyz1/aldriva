/**
 * lib/rental/allocation.ts
 *
 * Auto-allocation engine for the rental booking system.
 * Called by createRentalBooking when rental_allocation_mode = 'auto_on_booking'.
 * Architecture: docs/design/rental/architecture.md Decision 1 (Allocation Strategy).
 *
 * Strategy:
 *  1. Query candidate vehicles: active, not out_of_service, in category.
 *  2. Filter out vehicles blocked (rental_blocks) or already booked (rental_bookings).
 *  3. Sort: branch-match first, then lowest mileage (fleet wear leveling).
 *  4. Attempt up to 3 candidates — retry on exclusion constraint violation (23P01).
 *  5. Return first success or error 'no_vehicle_available'.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllocationResult {
  vehicleId: string;
  retries: number;
}

export interface AllocationError {
  error: "no_vehicle_available" | "allocation_failed";
  retries: number;
}

// ---------------------------------------------------------------------------
// autoAllocateVehicle
// ---------------------------------------------------------------------------

export async function autoAllocateVehicle(
  bookingId: string,
  organizerId: string,
  opts: {
    categoryId: string;
    businessId: string;
    startsAt: string; // ISO string
    endsAt: string; // ISO string
    pickupBranchId?: string | null;
  }
): Promise<AllocationResult | AllocationError> {
  const adminSupabase = createSupabaseAdmin();
  let retries = 0;

  try {
    // Step 1: Query eligible candidate vehicles (sorted by mileage ascending for wear leveling)
    const { data: candidates, error: candidatesErr } = await adminSupabase
      .from("vehicles")
      .select("id, current_mileage, branch_id")
      .eq("category_id", opts.categoryId)
      .eq("business_id", opts.businessId)
      .eq("is_active", true)
      .not("status", "in", '("out_of_service","maintenance")')
      .order("current_mileage", { ascending: true });

    if (candidatesErr || !candidates || candidates.length === 0) {
      return { error: "no_vehicle_available", retries };
    }

    const candidateIds = candidates.map((c: { id: string }) => c.id);

    // Step 2a: Get vehicle IDs with overlapping blocks
    const { data: blockedData } = await adminSupabase
      .from("rental_blocks")
      .select("vehicle_id")
      .in("vehicle_id", candidateIds)
      .lt("starts_at", opts.endsAt)
      .gt("ends_at", opts.startsAt);

    const blockedIds = new Set(
      (blockedData || []).map((b: { vehicle_id: string }) => b.vehicle_id)
    );

    // Step 2b: Get vehicle IDs with overlapping active bookings (excluding current booking)
    const { data: bookedData } = await adminSupabase
      .from("rental_bookings")
      .select("vehicle_id")
      .in("vehicle_id", candidateIds)
      .in("status", ["pending", "awaiting_payment", "confirmed", "active"])
      .neq("id", bookingId)
      .lt("starts_at", opts.endsAt)
      .gt("ends_at", opts.startsAt)
      .not("vehicle_id", "is", null);

    const bookedIds = new Set(
      (bookedData || [])
        .map((b: { vehicle_id: string | null }) => b.vehicle_id)
        .filter(Boolean) as string[]
    );

    // Step 3: Filter to truly available vehicles
    const available = candidates.filter(
      (c: { id: string }) => !blockedIds.has(c.id) && !bookedIds.has(c.id)
    );

    if (available.length === 0) {
      return { error: "no_vehicle_available", retries };
    }

    // Step 4: Sort — branch-match first, then by mileage (already sorted from DB)
    const pickupBranchId = opts.pickupBranchId;
    const sorted = [...available].sort(
      (
        a: { id: string; current_mileage: number | null; branch_id: string | null },
        b: { id: string; current_mileage: number | null; branch_id: string | null }
      ) => {
        const aMatch = a.branch_id === pickupBranchId ? 0 : 1;
        const bMatch = b.branch_id === pickupBranchId ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return (a.current_mileage ?? 0) - (b.current_mileage ?? 0);
      }
    );

    // Step 5: Try up to 3 candidates
    const MAX_CANDIDATES = 3;
    for (const candidate of sorted.slice(0, MAX_CANDIDATES)) {
      retries++;
      const { error: updateErr } = await adminSupabase
        .from("rental_bookings")
        .update({
          vehicle_id: candidate.id,
          assigned_by: "auto",
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", bookingId)
        .eq("organizer_id", organizerId)
        .is("vehicle_id", null); // Only assign if not already assigned (safe guard)

      if (!updateErr) {
        return { vehicleId: candidate.id, retries };
      }

      // 23P01 = exclusion_violation — try next candidate
      if ((updateErr as { code?: string }).code === "23P01") {
        continue;
      }

      // Any other error is fatal
      return { error: "allocation_failed", retries };
    }

    return { error: "no_vehicle_available", retries };
  } catch {
    return { error: "allocation_failed", retries };
  }
}
