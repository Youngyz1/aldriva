/**
 * lib/seating.ts
 * Authoritative Seating Engine & Spatial Geometry Model for Aldriva Events.
 * Manages venue_layouts, persistent SVG geometries, non-seat venue objects,
 * seat generation, effective pricing, and atomic reservations.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type VenueObjectType =
  | "stage"
  | "ga_area"
  | "label"
  | "table"
  | "shape"
  | "aisle"
  | "structure";

export interface VenueObject {
  id: string;
  type: VenueObjectType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  label?: string;
  color?: string;
  capacity?: number | null;
  table_number?: string | null;
  table_name?: string | null;
  table_capacity?: number | null;
  table_shape?: "round" | "rect";
  ticket_type_id?: string | null;
  price?: number | null;
}

export interface SectionDefinition {
  name: string;
  color?: string;
  ticket_type_id?: string | null;
  default_price?: number | null;
  rows?: number;
  seatsPerRow?: number;
  x?: number;
  y?: number;
}

export type SeatStatus = "available" | "reserved" | "sold" | "unavailable";
export type SeatObjectType = "seat" | "table_seat" | "ga_spot";

export interface SeatGeometry {
  id: string;
  event_id: string;
  layout_id: string;
  section: string;
  row_label: string;
  seat_number: number;
  table_number: string | null;
  table_name: string | null;
  table_capacity: number | null;
  is_vip: boolean;
  is_accessible: boolean;
  status: SeatStatus;
  reserved_until: string | null;
  price_override: number | null;
  ticket_id: string | null;
  ticket_type_id: string | null;
  assigned_invitation_id: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  object_type: SeatObjectType;
  effective_price?: number;
  invitation?: {
    id: string;
    guest_name: string;
    guest_title: string | null;
    organization: string | null;
    invitation_status: string;
    rsvp_status: string;
  } | null;
}

export interface TicketTypeSummary {
  id: string;
  event_id: string;
  name: string;
  price: number;
  quantity?: number;
}

export interface FullVenueLayout {
  id: string;
  event_id: string;
  name: string;
  canvas_width: number;
  canvas_height: number;
  version: number;
  is_published: boolean;
  published_at: string | null;
  sections: SectionDefinition[];
  venue_objects: VenueObject[];
  seats: SeatGeometry[];
  ticket_types?: TicketTypeSummary[];
}

// ─── UTILITY HELPERS ─────────────────────────────────────────────────────────

export function isSeatActivelyReserved(seat: {
  status: string;
  reserved_until?: string | null;
}): boolean {
  return (
    seat.status === "reserved" &&
    !!seat.reserved_until &&
    new Date(seat.reserved_until) > new Date()
  );
}

export function isSeatPurchasable(seat: {
  status: string;
  reserved_until?: string | null;
  assigned_invitation_id?: string | null;
}): boolean {
  return (
    seat.status === "available" &&
    !seat.assigned_invitation_id &&
    !isSeatActivelyReserved(seat)
  );
}

export function formatSeatLabel(seat: {
  section: string;
  row_label: string;
  seat_number: number;
  table_number?: string | null;
  table_name?: string | null;
}): string {
  if (seat.table_number) {
    const tablePart = seat.table_name
      ? `Table ${seat.table_number} (${seat.table_name})`
      : `Table ${seat.table_number}`;
    return `${tablePart}, Seat ${seat.seat_number}`;
  }
  return `${seat.section}, Row ${seat.row_label}, Seat ${seat.seat_number}`;
}

export function resolveEffectiveSeatPrice(
  seat: {
    price_override?: number | null;
    ticket_type_id?: string | null;
    section?: string;
  },
  sections: SectionDefinition[] = [],
  ticketTypes: TicketTypeSummary[] = [],
  fallbackBasePrice = 0
): number {
  if (seat.price_override != null && seat.price_override >= 0) {
    return seat.price_override;
  }

  if (seat.ticket_type_id) {
    const tt = ticketTypes.find((t) => t.id === seat.ticket_type_id);
    if (tt && tt.price != null) return tt.price;
  }

  if (seat.section) {
    const sec = sections.find((s) => s.name === seat.section);
    if (sec) {
      if (sec.default_price != null && sec.default_price >= 0) {
        return sec.default_price;
      }
      if (sec.ticket_type_id) {
        const tt = ticketTypes.find((t) => t.id === sec.ticket_type_id);
        if (tt && tt.price != null) return tt.price;
      }
    }
  }

  return fallbackBasePrice;
}

// ─── GEOMETRY GENERATORS ────────────────────────────────────────────────────

export interface GenerateSectionSeatsOptions {
  eventId: string;
  layoutId: string;
  sectionName: string;
  rowsCount: number;
  seatsPerRow: number;
  startX: number;
  startY: number;
  seatWidth?: number;
  seatHeight?: number;
  seatGap?: number;
  rowGap?: number;
  rowLabelPrefix?: string;
  startRowIndex?: number;
  startSeatNumber?: number;
  ticketTypeId?: string | null;
  defaultPrice?: number | null;
  isVip?: boolean;
  isAccessible?: boolean;
}

export function generateSectionSeatsGrid(
  opts: GenerateSectionSeatsOptions
): Omit<SeatGeometry, "id">[] {
  const {
    eventId,
    layoutId,
    sectionName,
    rowsCount,
    seatsPerRow,
    startX,
    startY,
    seatWidth = 26,
    seatHeight = 26,
    seatGap = 8,
    rowGap = 12,
    rowLabelPrefix = "",
    startRowIndex = 0,
    startSeatNumber = 1,
    ticketTypeId = null,
    defaultPrice = null,
    isVip = false,
    isAccessible = false,
  } = opts;

  const rowsAlpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const seats: Omit<SeatGeometry, "id">[] = [];

  for (let r = 0; r < rowsCount; r++) {
    const rowIndex = startRowIndex + r;
    const rowLabel =
      rowLabelPrefix +
      (rowIndex < rowsAlpha.length
        ? rowsAlpha[rowIndex]
        : String(rowIndex + 1));
    const curY = startY + r * (seatHeight + rowGap);

    for (let s = 0; s < seatsPerRow; s++) {
      const seatNumber = startSeatNumber + s;
      const curX = startX + s * (seatWidth + seatGap);

      seats.push({
        event_id: eventId,
        layout_id: layoutId,
        section: sectionName,
        row_label: rowLabel,
        seat_number: seatNumber,
        table_number: null,
        table_name: null,
        table_capacity: null,
        is_vip: isVip,
        is_accessible: isAccessible,
        status: "available",
        reserved_until: null,
        price_override: defaultPrice,
        ticket_id: null,
        ticket_type_id: ticketTypeId,
        assigned_invitation_id: null,
        x: curX,
        y: curY,
        width: seatWidth,
        height: seatHeight,
        rotation: 0,
        object_type: "seat",
      });
    }
  }

  return seats;
}

export interface GenerateTableSeatsOptions {
  eventId: string;
  layoutId: string;
  tableNumber: string;
  tableName?: string | null;
  tableCapacity: number;
  tableX: number;
  tableY: number;
  tableWidth?: number;
  tableHeight?: number;
  tableShape?: "round" | "rect";
  ticketTypeId?: string | null;
  priceOverride?: number | null;
  isVip?: boolean;
}

export function generateTableSeats(
  opts: GenerateTableSeatsOptions
): Omit<SeatGeometry, "id">[] {
  const {
    eventId,
    layoutId,
    tableNumber,
    tableName = null,
    tableCapacity,
    tableX,
    tableY,
    tableWidth = 100,
    tableHeight = 100,
    tableShape = "round",
    ticketTypeId = null,
    priceOverride = null,
    isVip = false,
  } = opts;

  const seats: Omit<SeatGeometry, "id">[] = [];
  const seatSize = 24;
  const centerX = tableX + tableWidth / 2;
  const centerY = tableY + tableHeight / 2;

  if (tableShape === "round") {
    const radius = Math.max(tableWidth, tableHeight) / 2 + 20;
    for (let i = 0; i < tableCapacity; i++) {
      const angle = (i / tableCapacity) * (2 * Math.PI) - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle) - seatSize / 2;
      const y = centerY + radius * Math.sin(angle) - seatSize / 2;

      seats.push({
        event_id: eventId,
        layout_id: layoutId,
        section: `Table ${tableNumber}`,
        row_label: "T",
        seat_number: i + 1,
        table_number: tableNumber,
        table_name: tableName,
        table_capacity: tableCapacity,
        is_vip: isVip,
        is_accessible: false,
        status: "available",
        reserved_until: null,
        price_override: priceOverride,
        ticket_id: null,
        ticket_type_id: ticketTypeId,
        assigned_invitation_id: null,
        x: Math.round(x),
        y: Math.round(y),
        width: seatSize,
        height: seatSize,
        rotation: Math.round((angle * 180) / Math.PI + 90),
        object_type: "table_seat",
      });
    }
  } else {
    // Rectangular table arrangement around perimeter
    for (let i = 0; i < tableCapacity; i++) {
      const fraction = i / tableCapacity;
      let x = centerX;
      let y = centerY;
      let rot = 0;

      if (fraction < 0.25) {
        // Top edge
        const t = fraction / 0.25;
        x = tableX + t * tableWidth;
        y = tableY - 20;
        rot = 0;
      } else if (fraction < 0.5) {
        // Right edge
        const t = (fraction - 0.25) / 0.25;
        x = tableX + tableWidth + 20;
        y = tableY + t * tableHeight;
        rot = 90;
      } else if (fraction < 0.75) {
        // Bottom edge
        const t = (fraction - 0.5) / 0.25;
        x = tableX + tableWidth - t * tableWidth;
        y = tableY + tableHeight + 20;
        rot = 180;
      } else {
        // Left edge
        const t = (fraction - 0.75) / 0.25;
        x = tableX - 20;
        y = tableY + tableHeight - t * tableHeight;
        rot = 270;
      }

      seats.push({
        event_id: eventId,
        layout_id: layoutId,
        section: `Table ${tableNumber}`,
        row_label: "T",
        seat_number: i + 1,
        table_number: tableNumber,
        table_name: tableName,
        table_capacity: tableCapacity,
        is_vip: isVip,
        is_accessible: false,
        status: "available",
        reserved_until: null,
        price_override: priceOverride,
        ticket_id: null,
        ticket_type_id: ticketTypeId,
        assigned_invitation_id: null,
        x: Math.round(x - seatSize / 2),
        y: Math.round(y - seatSize / 2),
        width: seatSize,
        height: seatSize,
        rotation: rot,
        object_type: "table_seat",
      });
    }
  }

  return seats;
}

// ─── ATOMIC OPERATIONS ───────────────────────────────────────────────────────

export async function reserveSeatsAtomic(
  seatIds: string[],
  holdDurationMinutes = 5
): Promise<{
  success: boolean;
  reserved_until?: string;
  unavailable_ids?: string[];
  error?: string;
}> {
  const admin = createSupabaseAdmin();

  const { data, error } = await admin.rpc("reserve_seats_atomic", {
    p_seat_ids: seatIds,
    p_hold_duration_minutes: holdDurationMinutes,
  });

  if (error) {
    // Fallback if RPC is not deployed: conditional atomic update
    const now = new Date();
    const reservedUntil = new Date(
      now.getTime() + holdDurationMinutes * 60 * 1000
    ).toISOString();

    const { data: seats } = await admin
      .from("seats")
      .select("id, status, reserved_until, assigned_invitation_id")
      .in("id", seatIds);

    const unavailable = (seats || []).filter(
      (s) =>
        s.status === "sold" ||
        s.status === "unavailable" ||
        s.assigned_invitation_id !== null ||
        (s.status === "reserved" &&
          s.reserved_until &&
          new Date(s.reserved_until) > now)
    );

    if (unavailable.length > 0) {
      return {
        success: false,
        error: "Some seats are no longer available.",
        unavailable_ids: unavailable.map((s) => s.id),
      };
    }

    const { error: updateErr } = await admin
      .from("seats")
      .update({ status: "reserved", reserved_until: reservedUntil })
      .in("id", seatIds);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true, reserved_until: reservedUntil };
  }

  return data as {
    success: boolean;
    reserved_until?: string;
    unavailable_ids?: string[];
    error?: string;
  };
}

export async function assignSeatToInvitationAtomic(params: {
  eventId: string;
  invitationId: string;
  seatId: string;
}): Promise<{
  success: boolean;
  seatId?: string;
  seatLabel?: string;
  error?: string;
}> {
  const { eventId, invitationId, seatId } = params;
  const admin = createSupabaseAdmin();

  const { data, error } = await admin.rpc(
    "assign_seat_to_invitation_atomic",
    {
      p_event_id: eventId,
      p_invitation_id: invitationId,
      p_seat_id: seatId,
    }
  );

  if (error) {
    // Fallback if RPC is not yet loaded in Postgres
    const { assignSeatToInvitation } = await import("@/lib/invitations");
    try {
      const res = await assignSeatToInvitation({
        eventId,
        invitationId,
        seatId,
      });
      return { success: true, seatId: res.seatId, seatLabel: res.seatLabel };
    } catch (e: any) {
      return { success: false, error: e.message || "Assignment failed" };
    }
  }

  const result = data as {
    success: boolean;
    seat_id?: string;
    seat_label?: string;
    error?: string;
  };

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    seatId: result.seat_id,
    seatLabel: result.seat_label,
  };
}
