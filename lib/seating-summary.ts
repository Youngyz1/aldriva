/**
 * lib/seating-summary.ts — Phase 6E unified seating-plan summary.
 *
 * Single authoritative derivation of workspace-level seat counts from the
 * persisted seat list. Manual, AI, and SVG views all operate on the same
 * `SeatGeometry[]`; this helper guarantees they describe it identically.
 *
 * Semantics intentionally mirror SeatingManagerClient's long-standing stats:
 * - reserved counts only actively-reserved seats (reserved_until in future)
 * - available excludes assigned and actively-reserved seats
 * - guestAssigned counts seats holding an invitation assignment
 *
 * Pure function: no I/O, no mutation, safe to unit test.
 */

export interface SeatingPlanSummary {
  total: number;
  available: number;
  reserved: number;
  sold: number;
  guestAssigned: number;
  vip: number;
  accessible: number;
  regular: number;
  tables: number;
}

interface SummarySeatInput {
  status?: string | null;
  reserved_until?: string | null;
  assigned_invitation_id?: string | null;
  is_vip?: boolean | null;
  is_accessible?: boolean | null;
}

function isActivelyReservedSeat(seat: SummarySeatInput): boolean {
  return (
    seat.status === "reserved" &&
    !!seat.reserved_until &&
    new Date(seat.reserved_until) > new Date()
  );
}

export function summarizeSeatingPlan(
  seats: SummarySeatInput[],
  venueObjects?: Array<{ type?: string }> | null
): SeatingPlanSummary {
  const list = Array.isArray(seats) ? seats : [];
  const total = list.length;
  const sold = list.filter((s) => s.status === "sold").length;
  const reserved = list.filter(isActivelyReservedSeat).length;
  const guestAssigned = list.filter((s) => !!s.assigned_invitation_id).length;
  const vip = list.filter((s) => !!s.is_vip).length;
  const accessible = list.filter((s) => !!s.is_accessible).length;
  const available = list.filter(
    (s) =>
      s.status === "available" &&
      !s.assigned_invitation_id &&
      !isActivelyReservedSeat(s)
  ).length;
  const tables = Array.isArray(venueObjects)
    ? venueObjects.filter((o) => o && o.type === "table").length
    : 0;

  return {
    total,
    available,
    reserved,
    sold,
    guestAssigned,
    vip,
    accessible,
    regular: total - vip,
    tables,
  };
}
