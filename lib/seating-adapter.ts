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
 * - A seat in `myHeldIds` (the buyer's own selection, persisted in
 *   sessionStorage) maps to `available` unless it is sold, unavailable, or
 *   invitation-held — a returning buyer sees their seats as selected, not
 *   Reserved. Display-only: checkout still revalidates server-side.
 * - `reserved` with no usable hold (missing, past, or within EXPIRED_GRACE_MS
 *   after `reserved_until`) maps to `available`: the hold RPC lets a new hold
 *   take such a seat atomically, so showing it locked would lie. The 30 s
 *   grace covers client-clock skew until the server timestamp exists.
 * - Active `reserved` maps to `reserved` with label "On hold".
 * - Everything else locks as `sold`: `sold`, `unavailable` (label
 *   "Unavailable"), and invitation-held seats (label "Held for a guest").
 *   These render locked and `toggleSeat` rejects them.
 */
export const EXPIRED_GRACE_MS = 30 * 1000;

/**
 * Clock-skew margin for honoring remembered holds. A timestamped entry
 * counts as live only while `now < holdUntil - HOLD_SKEW_MARGIN_MS`: a fast
 * client clock must never stretch a hold past its server-side expiry, and a
 * slow clock merely drops the entry early (display falls back to the
 * server-read status; the RPC arbitrates on retry).
 */
export const HOLD_SKEW_MARGIN_MS = 30 * 1000;

export interface AdaptOptions {
  /**
   * Seat ids the current buyer selected (own holds). Entries with a
   * `holdUntil` timestamp are honored only while live (`now < holdUntil`);
   * bare ids / Sets (legacy callers, tests) are treated as live.
   * Display-only: checkout still revalidates server-side.
   */
  myHeldIds?: ReadonlySet<string> | readonly (string | HoldEntry)[];
  /** Client clock ms. Defaults to Date.now(); injectable for tests. */
  now?: number;
}

/** A remembered hold: seat id + the hold's expiry as epoch ms. */
export interface HoldEntry {
  id: string;
  holdUntil: number;
}

/**
 * Parse persisted holds (e.g. sessionStorage). Accepts `{id, holdUntil}`
 * entries that are still live; drops expired entries and the legacy bare
 * string-array format (no timestamp → liveness unknowable → safe-side drop).
 * Never throws on garbage input.
 */
export function parseHeldEntries(raw: unknown, now?: number): HoldEntry[] {
  const t = now ?? Date.now();
  try {
    if (!Array.isArray(raw)) return [];
    const out: HoldEntry[] = [];
    for (const e of raw) {
      if (
        e != null &&
        typeof e === "object" &&
        typeof (e as HoldEntry).id === "string" &&
        typeof (e as HoldEntry).holdUntil === "number" &&
        Number.isFinite((e as HoldEntry).holdUntil) &&
        t < (e as HoldEntry).holdUntil - HOLD_SKEW_MARGIN_MS
      ) {
        out.push({ id: (e as HoldEntry).id, holdUntil: (e as HoldEntry).holdUntil });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** True when every id has a live entry. Used for the 409-skip decision. */
export function allLiveHolds(
  ids: readonly string[],
  entries: readonly HoldEntry[] | undefined,
  now?: number
): boolean {
  if (ids.length === 0) return false;
  const t = now ?? Date.now();
  const live = new Set(
    (entries ?? [])
      .filter(
        (e) => e && typeof e.holdUntil === "number" && t < e.holdUntil - HOLD_SKEW_MARGIN_MS
      )
      .map((e) => e.id)
  );
  return ids.every((id) => live.has(id));
}

function isMyHeld(
  id: string,
  held: ReadonlySet<string> | readonly (string | HoldEntry)[] | undefined,
  now: number
): boolean {
  if (id == null || held == null) return false;
  // Duck-type: Set has .has, arrays have .includes. No instanceof narrowing
  // (ReadonlySet is an interface; tsc cannot exclude it via instanceof).
  if (typeof (held as ReadonlySet<string>).has === "function") {
    return (held as ReadonlySet<string>).has(id);
  }
  if (!Array.isArray(held)) return false;
  return (held as readonly (string | HoldEntry)[]).some((e) => {
    if (typeof e === "string") return e === id; // legacy/test callers: no timestamp, treated live
    return (
      e != null &&
      typeof e === "object" &&
      (e as HoldEntry).id === id &&
      typeof (e as HoldEntry).holdUntil === "number" &&
      now < (e as HoldEntry).holdUntil - HOLD_SKEW_MARGIN_MS
    );
  });
}

function holdExpired(reservedUntil: string | null | undefined, now: number): boolean {
  if (reservedUntil == null) return true;
  const expiry = Date.parse(reservedUntil);
  if (Number.isNaN(expiry)) return true;
  return now - expiry > EXPIRED_GRACE_MS;
}

export function adaptSeatStatus(
  seat: {
    id?: string;
    status: string;
    reserved_until?: string | null;
    assigned_invitation_id?: string | null;
  },
  opts?: AdaptOptions
): PickerSeatStatus {
  const held = seat.assigned_invitation_id != null;
  if (seat.status === "available" && !held) return "available";
  if (seat.status === "reserved" && !held && holdExpired(seat.reserved_until, opts?.now ?? Date.now())) {
    return "available";
  }
  const mine = seat.id != null && isMyHeld(seat.id, opts?.myHeldIds, opts?.now ?? Date.now());
  if (mine && seat.status !== "sold" && seat.status !== "unavailable" && !held) {
    return "available";
  }
  if (seat.status === "reserved") return "reserved";
  return "sold";
}

/** Tooltip status word. Undefined → the picker capitalizes `status`. */
export function adaptStatusLabel(seat: {
  status: string;
  reserved_until?: string | null;
  assigned_invitation_id?: string | null;
}): string | undefined {
  if (seat.assigned_invitation_id != null) return "Held for a guest";
  if (seat.status === "unavailable") return "Unavailable";
  if (seat.status === "reserved") return "On hold";
  return undefined;
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
  tableIdByNumber: Map<string, string>,
  opts?: AdaptOptions
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
    status: adaptSeatStatus(seat, opts),
    statusLabel: adaptStatusLabel(seat),
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

export function adaptTable(o: VenueObject, chairCount?: number): VenueTable {
  const c = centreOf(o);
  const capacity =
    typeof o.table_capacity === "number" && Number.isFinite(o.table_capacity)
      ? o.table_capacity
      : chairCount;
  if (o.table_shape === "rect") {
    return {
      id: o.id,
      x: c.x,
      y: c.y,
      label: o.label ?? o.name,
      capacity,
      width: o.width,
      height: o.height,
    };
  }
  return {
    id: o.id,
    x: c.x,
    y: c.y,
    label: o.label ?? o.name,
    capacity,
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
export function adaptPlan(layout: FullVenueLayout, opts?: AdaptOptions): VenuePlan {
  const objects = layout.venue_objects ?? [];
  const seats = layout.seats ?? [];
  const tableIdByNumber = new Map<string, string>();
  const chairsByNumber = new Map<string, number>();
  for (const o of objects) {
    if (o.type === "table" && o.table_number != null) {
      tableIdByNumber.set(o.table_number, o.id);
    }
  }
  for (const s of seats) {
    if (s.table_number != null) {
      chairsByNumber.set(s.table_number, (chairsByNumber.get(s.table_number) ?? 0) + 1);
    }
  }
  return {
    seats: seats.map((s) => adaptSeat(s, tableIdByNumber, opts)),
    tables: objects
      .filter((o) => o.type === "table")
      .map((o) =>
        adaptTable(o, o.table_number != null ? chairsByNumber.get(o.table_number) : undefined)
      ),
    stages: objects.filter((o) => o.type === "stage").map(adaptStage),
    gaZones: objects.filter((o) => o.type === "ga_area").map(adaptGaZone),
    labels: objects
      .filter((o) => o.type === "label")
      .map((o) => ({ x: o.x, y: o.y, text: o.label ?? o.name })),
  };
}

/**
 * Booking-flow picker gate (P2). Render VenueSeatPicker3D only when ALL hold;
 * otherwise the existing 2D SeatMap renders unchanged (flag off, no plan,
 * oversized plan, or adapter failure).
 */
export const PICKER_MAX_SEATS = 2500;

export function shouldUse3DPicker(input: {
  flagOn: boolean;
  hasPlan: boolean;
  seatCount: number;
  adapterOk: boolean;
}): boolean {
  return (
    input.flagOn && input.hasPlan && input.seatCount <= PICKER_MAX_SEATS && input.adapterOk
  );
}
