/**
 * lib/seating-adapter.ts — P0
 *
 * Pure mapping from the saved plan (`FullVenueLayout` + enriched `SeatGeometry[]`,
 * exactly what `GET /api/seats` returns) to the attendee picker's `VenuePlan`.
 *
 * Lib only: not wired into any page. No React import; safe for server + client.
 * Prices are display-only here — checkout MUST re-resolve server-side via
 * `resolveEffectiveSeatPrice` (see `app/api/create-payment-intent/route.ts`).
 */

import type {
  FullVenueLayout,
  SeatGeometry,
  VenueObject,
} from "@/lib/seating";
import type {
  VenueGaZone,
  VenuePlan,
  VenueSeat,
  VenueStage,
  VenueTable,
} from "@/components/ui/venue-seat-picker-3d";

/** Repo seat glyph box (grid default from `generateSectionSeatsGrid`). */
export const SEAT_GLYPH_SIZE = 26;

/**
 * Suggested `seatRadius` prop for the picker: half the repo glyph box, so a
 * 26px seat renders at the same size it has in the organizer's 2D builder.
 */
export const SUGGESTED_SEAT_RADIUS = SEAT_GLYPH_SIZE / 2;

export type PickerSeatStatus = VenueSeat["status"];
export type PickerSeatCategory = NonNullable<VenueSeat["category"]>;

/**
 * VIP/accessible are boolean flags on `seats`; the picker folds them into a
 * single category. Accessible wins on conflict (a seat flagged both is
 * navigated-to as accessible first).
 */
export function adaptSeatCategory(seat: {
  is_vip?: boolean | null;
  is_accessible?: boolean | null;
}): PickerSeatCategory {
  if (seat.is_accessible) return "accessible";
  if (seat.is_vip) return "vip";
  return "standard";
}

/**
 * The picker union is `available | reserved | sold`. Locked-collapse rule:
 * - `available` passes through only when the seat is NOT invitation-held.
 * - `reserved` passes through (including expired holds — safe side: an
 *   expired hold may already be re-held by someone else; the hold RPC is the
 *   arbiter at checkout, and the UI must not sell what it cannot verify).
 * - Everything else locks as `sold`: `sold`, `unavailable`, and
 *   invitation-held seats (`assigned_invitation_id` set, regardless of
 *   status). These render with the locked glyph/cursor and `toggleSeat`
 *   rejects them, so the collapse is observably "cannot select".
 */
export function adaptSeatStatus(seat: {
  status: string;
  assigned_invitation_id?: string | null;
}): PickerSeatStatus {
  if (seat.status === "available" && !seat.assigned_invitation_id) {
    return "available";
  }
  if (seat.status === "reserved") return "reserved";
  return "sold";
}

/** Human label matching the existing `SeatMap` tooltip convention. */
export function adaptSeatLabel(seat: {
  section: string;
  row_label: string;
  seat_number: number;
  table_number?: string | null;
  table_name?: string | null;
}): string {
  if (seat.table_number) {
    return `Table ${seat.table_number} · Seat ${seat.seat_number}`;
  }
  return `${seat.section} · Row ${seat.row_label} · Seat ${seat.seat_number}`;
}

export function adaptSeat(
  seat: SeatGeometry,
  tableIdByNumber: Map<string, string>
): VenueSeat {
  const w =
    typeof seat.width === "number" && Number.isFinite(seat.width)
      ? seat.width
      : SEAT_GLYPH_SIZE;
  const h =
    typeof seat.height === "number" && Number.isFinite(seat.height)
      ? seat.height
      : SEAT_GLYPH_SIZE;
  return {
    id: seat.id,
    // Repo stores TOP-LEFT; the picker renders CENTRES.
    x: seat.x + w / 2,
    y: seat.y + h / 2,
    label: adaptSeatLabel(seat),
    number: seat.seat_number,
    status: adaptSeatStatus(seat),
    category: adaptSeatCategory(seat),
    // Enriched server-side (`effective_price`); undefined hides the price.
    price: seat.effective_price ?? undefined,
    tableId:
      seat.table_number != null
        ? tableIdByNumber.get(seat.table_number)
        : undefined,
  };
}

function centreOf(o: VenueObject): { x: number; y: number } {
  return { x: o.x + o.width / 2, y: o.y + o.height / 2 };
}

export function adaptTable(o: VenueObject): VenueTable {
  const c = centreOf(o);
  if (o.table_shape === "rect") {
    return {
      id: o.id,
      x: c.x,
      y: c.y,
      label: o.label ?? o.name,
      width: o.width,
      height: o.height,
    };
  }
  return {
    id: o.id,
    x: c.x,
    y: c.y,
    label: o.label ?? o.name,
    radius: Math.min(o.width, o.height) / 2,
  };
}

export function adaptStage(o: VenueObject): VenueStage {
  const c = centreOf(o);
  // No elevation source in `venue_objects` — picker default (R*2.2) applies.
  return { id: o.id, x: c.x, y: c.y, width: o.width, height: o.height };
}

export function adaptGaZone(o: VenueObject): VenueGaZone {
  const c = centreOf(o);
  const capacity =
    typeof o.capacity === "number" && Number.isFinite(o.capacity)
      ? o.capacity
      : 0;
  return {
    id: o.id,
    x: c.x,
    y: c.y,
    width: o.width,
    height: o.height,
    label: o.label ?? o.name,
    price: o.price ?? 0,
    capacity,
    // NO DECREMENT SOURCE EXISTS (no GA sales path, no per-zone counter).
    // P0 decision: read-only until the P4 counter migration.
    available: capacity,
    readOnly: true,
  };
}

/**
 * Full saved-plan → picker-plan mapping. Tables are joined to seats by
 * `table_number` string match (no table-UUID FK exists on `seats`); a seat
 * whose number matches no table object gets `tableId: undefined`.
 */
export function adaptPlan(layout: FullVenueLayout): VenuePlan {
  const objects = layout.venue_objects ?? [];
  const tableIdByNumber = new Map<string, string>();
  for (const o of objects) {
    if (o.type === "table" && o.table_number != null) {
      tableIdByNumber.set(o.table_number, o.id);
    }
  }
  return {
    seats: (layout.seats ?? []).map((s) => adaptSeat(s, tableIdByNumber)),
    tables: objects.filter((o) => o.type === "table").map(adaptTable),
    stages: objects.filter((o) => o.type === "stage").map(adaptStage),
    gaZones: objects.filter((o) => o.type === "ga_area").map(adaptGaZone),
    labels: objects
      .filter((o) => o.type === "label")
      .map((o) => ({ x: o.x, y: o.y, text: o.label ?? o.name })),
  };
}
