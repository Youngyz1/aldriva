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

/**
 * Parses a cleared-or-typed numeric count from a controlled number input
 * into seating form state (`number | ""`).
 *
 * An emptied input yields "" (rendered as empty; seat generation falls back
 * via `Number(...) || <default>`), and any other input parses to an integer.
 * NaN can never enter state, so a controlled `value={...}` prop never
 * receives NaN (React's "Received NaN for the `value` attribute" warning).
 * Used by the VenueBuilder section/table modals for rows, seats-per-row,
 * and table capacity.
 */
export function parseCountInput(raw: string): number | "" {
  if (raw === "") return "";
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? "" : parsed;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for database-issued seat ids. The canvas mints client-side temp ids
 * (`new-…`, `new-table-…`, `dup-…`, …) for unsaved seats; anything that is
 * not a UUID can never address an existing row, so the save endpoint must
 * treat it as an insert — never as an update/delete target. Centralizes the
 * classification so client and server cannot disagree about id prefixes.
 */
export function isPersistedSeatId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/**
 * Splits a full-layout seat payload into updates (persisted UUIDs) and
 * inserts (client temp ids / missing ids). Used by the seating save
 * endpoint so re-sent unsaved seats can never collide with existing rows
 * as phantom updates, and temp ids can never reach UUID-typed queries.
 */
export function partitionSeatSaves<T extends { id?: unknown }>(
  seats: T[]
): { updates: T[]; inserts: T[] } {
  const updates: T[] = [];
  const inserts: T[] = [];
  for (const seat of seats) {
    if (isPersistedSeatId(seat?.id)) updates.push(seat);
    else inserts.push(seat);
  }
  return { updates, inserts };
}

const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Maps a generated row_label back to its row index (inverse of the
 * generation rule in generateSectionSeatsGrid: A-Z then 27, 28, …).
 * Returns null for labels that don't follow the convention.
 */
export function rowLabelToIndex(label: unknown): number | null {
  if (typeof label !== "string" || label.length === 0) return null;
  if (label.length === 1) {
    const idx = ROW_LETTERS.indexOf(label.toUpperCase());
    return idx >= 0 ? idx : null;
  }
  const n = parseInt(label, 10);
  return Number.isNaN(n) || n < 1 ? null : n - 1;
}

/**
 * Next row start index when appending rows to an existing section: one past
 * the highest generated label already on the canvas (0 when the section is
 * new). Without this, every "add rows" action regenerates labels from A and
 * collides with persisted rows under UNIQUE(layout_id, section, row_label,
 * seat_number) — the deterministic second-save 409.
 */
export function nextRowStartIndex(
  seats: Array<{ section?: unknown; row_label?: unknown }>,
  sectionName: string
): number {
  let max = -1;
  for (const seat of seats) {
    if (seat?.section !== sectionName) continue;
    const idx = rowLabelToIndex(seat?.row_label);
    if (idx !== null && idx > max) max = idx;
  }
  return max + 1;
}

/**
 * Bottom edge (y + height) of a section's existing seats, so appended rows
 * continue below them instead of stacking on top of row A. Returns null
 * when the section has no seats yet (caller keeps its default origin).
 */
export function sectionBottomEdge(
  seats: Array<{ section?: unknown; y?: unknown; height?: unknown }>
): number | null {
  let bottom: number | null = null;
  for (const seat of seats) {
    if (typeof seat?.y !== "number" || Number.isNaN(seat.y)) continue;
    const edge = seat.y + (typeof seat?.height === "number" && !Number.isNaN(seat.height) ? seat.height : 26);
    if (bottom === null || edge > bottom) bottom = edge;
  }
  return bottom;
}

/**
 * Next free table number default ("1", "2", …) from table seats and table
 * shape objects already on the canvas. Prevents every table silently
 * regenerating as Table 1 (same UNIQUE collision as rows). Non-numeric
 * custom numbers are ignored; the caller keeps any explicit user input.
 */
export function nextTableNumber(
  seats: Array<{ table_number?: unknown }>,
  venueObjects: Array<{ type?: unknown; table_number?: unknown }> = []
): string {
  let max = 0;
  const consider = (value: unknown) => {
    const n = typeof value === "string" ? parseInt(value, 10) : typeof value === "number" ? value : NaN;
    if (Number.isInteger(n) && (n as number) > max) max = n as number;
  };
  for (const seat of seats) consider(seat?.table_number);
  for (const obj of venueObjects) {
    if (obj?.type === "table") consider(obj?.table_number);
  }
  return String(max + 1);
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

// ─── CANONICAL SEATING GENERATION ENGINE (PHASE 6B) ─────────────────────────

export class SeatingValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Seating plan configuration error: ${errors.join("; ")}`);
    this.name = "SeatingValidationError";
    this.errors = errors;
  }
}

export type SeatingSectionMode = "rows" | "tables";

export interface SeatingSectionConfig {
  name: string;
  mode: SeatingSectionMode;

  isVip?: boolean;
  isAccessible?: boolean;

  defaultPrice?: number | null;
  ticketTypeId?: string | null;

  // ── Row-based section options ──
  rowCount?: number;
  seatsPerRow?: number;
  rowLabelPrefix?: string;
  startRowIndex?: number;
  startSeatNumber?: number;

  // ── Table-based section options ──
  tableCount?: number;
  seatsPerTable?: number;
  tableShape?: "round" | "rect";
  startTableNumber?: number;
  tableNamePrefix?: string;

  // ── Spatial positioning options ──
  startX?: number;
  startY?: number;
  tableGapX?: number;
  gapY?: number;
}

export interface SeatingPlanConfig {
  eventId?: string;
  layoutId?: string;
  sections: SeatingSectionConfig[];
  originX?: number;
  originY?: number;
  existingSeats?: Array<Partial<SeatGeometry> & { section: string; row_label: string; seat_number: number }>;
  existingVenueObjects?: Array<Partial<VenueObject>>;
}

export type CanonicalGeneratedSeat = Omit<SeatGeometry, "id"> & { id?: string };

export interface CanonicalSeatingPlanResult {
  seats: CanonicalGeneratedSeat[];
  venueObjects: VenueObject[];
  sections: SectionDefinition[];
  summary: {
    totalSeats: number;
    vipSeats: number;
    regularSeats: number;
    accessibleSeats: number;
    sectionCount: number;
    tableCount: number;
  };
}

export function validateSeatingPlanConfig(config: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Configuration must be a non-null object."] };
  }

  const cfg = config as Partial<SeatingPlanConfig>;

  if (!Array.isArray(cfg.sections) || cfg.sections.length === 0) {
    errors.push("Seating plan configuration must include at least one section.");
    return { valid: false, errors };
  }

  cfg.sections.forEach((sec, idx) => {
    const prefix = `Section [${idx}]`;

    if (!sec || typeof sec !== "object") {
      errors.push(`${prefix}: Must be a valid section object.`);
      return;
    }

    if (typeof sec.name !== "string" || sec.name.trim().length === 0) {
      errors.push(`${prefix}: Section name must be a non-empty string.`);
    }

    if (sec.mode !== "rows" && sec.mode !== "tables") {
      errors.push(
        `${prefix}: Unsupported mode "${sec.mode}". Mode must be "rows" or "tables".`
      );
      return;
    }

    if (sec.mode === "rows") {
      if (
        typeof sec.rowCount !== "number" ||
        !Number.isInteger(sec.rowCount) ||
        sec.rowCount < 1
      ) {
        errors.push(`${prefix}: Row count must be a positive integer (received ${sec.rowCount}).`);
      }

      if (
        typeof sec.seatsPerRow !== "number" ||
        !Number.isInteger(sec.seatsPerRow) ||
        sec.seatsPerRow < 1
      ) {
        errors.push(
          `${prefix}: Seats per row must be a positive integer (received ${sec.seatsPerRow}).`
        );
      }

      if (
        sec.startRowIndex !== undefined &&
        (typeof sec.startRowIndex !== "number" ||
          !Number.isInteger(sec.startRowIndex) ||
          sec.startRowIndex < 0)
      ) {
        errors.push(`${prefix}: startRowIndex must be a non-negative integer.`);
      }

      if (
        sec.startSeatNumber !== undefined &&
        (typeof sec.startSeatNumber !== "number" ||
          !Number.isInteger(sec.startSeatNumber) ||
          sec.startSeatNumber < 1)
      ) {
        errors.push(`${prefix}: startSeatNumber must be a positive integer.`);
      }
    }

    if (sec.mode === "tables") {
      if (
        typeof sec.tableCount !== "number" ||
        !Number.isInteger(sec.tableCount) ||
        sec.tableCount < 1
      ) {
        errors.push(
          `${prefix}: Table count must be a positive integer (received ${sec.tableCount}).`
        );
      }

      if (
        typeof sec.seatsPerTable !== "number" ||
        !Number.isInteger(sec.seatsPerTable) ||
        sec.seatsPerTable < 1
      ) {
        errors.push(
          `${prefix}: Seats per table must be a positive integer (received ${sec.seatsPerTable}).`
        );
      }

      if (
        sec.tableShape !== undefined &&
        sec.tableShape !== "round" &&
        sec.tableShape !== "rect"
      ) {
        errors.push(`${prefix}: Table shape must be "round" or "rect".`);
      }

      if (
        sec.startTableNumber !== undefined &&
        (typeof sec.startTableNumber !== "number" ||
          !Number.isInteger(sec.startTableNumber) ||
          sec.startTableNumber < 1)
      ) {
        errors.push(`${prefix}: startTableNumber must be a positive integer.`);
      }
    }

    // Coordinate validations
    for (const coordKey of ["startX", "startY"] as const) {
      const val = sec[coordKey];
      if (val !== undefined && (typeof val !== "number" || !Number.isFinite(val))) {
        errors.push(`${prefix}: ${coordKey} must be a finite number.`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

export function generateCanonicalSeatingPlan(
  config: SeatingPlanConfig
): CanonicalSeatingPlanResult {
  const validation = validateSeatingPlanConfig(config);
  if (!validation.valid) {
    throw new SeatingValidationError(validation.errors);
  }

  const eventId = config.eventId || "";
  const layoutId = config.layoutId || "";
  const originX = typeof config.originX === "number" && Number.isFinite(config.originX) ? config.originX : 80;
  const originY = typeof config.originY === "number" && Number.isFinite(config.originY) ? config.originY : 150;

  const generatedSeats: CanonicalGeneratedSeat[] = [];
  const generatedObjects: VenueObject[] = [];
  const sectionDefs: SectionDefinition[] = [];

  const seenKeys = new Set<string>();
  let currentY = originY;

  // Build existing seat map for UUID preservation if provided
  const existingMap = new Map<string, string>();
  if (Array.isArray(config.existingSeats)) {
    for (const es of config.existingSeats) {
      if (es && es.section && es.row_label && typeof es.seat_number === "number") {
        const k = `${es.section}:::${es.row_label}:::${es.seat_number}`;
        if (isPersistedSeatId(es.id)) {
          existingMap.set(k, es.id);
        }
      }
    }
  }

  for (let sIdx = 0; sIdx < config.sections.length; sIdx++) {
    const sec = config.sections[sIdx];
    const secName = sec.name.trim();
    const isVip = Boolean(sec.isVip);
    const isAccessible = Boolean(sec.isAccessible);
    const defaultPrice = sec.defaultPrice ?? null;
    const ticketTypeId = sec.ticketTypeId ?? null;

    if (sec.mode === "rows") {
      const rowCount = sec.rowCount!;
      const seatsPerRow = sec.seatsPerRow!;
      const rowLabelPrefix = sec.rowLabelPrefix || "";

      let startRowIndex = sec.startRowIndex;
      if (startRowIndex === undefined) {
        if (config.existingSeats && config.existingSeats.length > 0) {
          startRowIndex = nextRowStartIndex(config.existingSeats, secName);
        } else {
          startRowIndex = 0;
        }
      }

      const startSeatNumber = sec.startSeatNumber || 1;
      const startX = sec.startX !== undefined && Number.isFinite(sec.startX) ? sec.startX : originX;

      let startY = sec.startY;
      if (startY === undefined) {
        if (config.existingSeats && config.existingSeats.length > 0) {
          const bottom = sectionBottomEdge(config.existingSeats.filter((s) => s.section === secName));
          startY = bottom !== null ? bottom + 12 : currentY;
        } else {
          startY = currentY;
        }
      }

      const rowSeats = generateSectionSeatsGrid({
        eventId,
        layoutId,
        sectionName: secName,
        rowsCount: rowCount,
        seatsPerRow,
        startX,
        startY,
        startRowIndex,
        startSeatNumber,
        rowLabelPrefix,
        isVip,
        isAccessible,
        defaultPrice,
        ticketTypeId,
      });

      let maxSeatBottom = startY;
      for (const seat of rowSeats) {
        const key = `${seat.section}:::${seat.row_label}:::${seat.seat_number}`;
        if (seenKeys.has(key)) {
          throw new SeatingValidationError([
            `Duplicate logical seat key generated: Section "${seat.section}", Row ${seat.row_label}, Seat ${seat.seat_number}.`,
          ]);
        }
        seenKeys.add(key);

        const preservedId = existingMap.get(key);
        generatedSeats.push({
          ...seat,
          id: preservedId, // undefined if not already persisted
        });

        const seatBottom = seat.y + seat.height;
        if (seatBottom > maxSeatBottom) maxSeatBottom = seatBottom;
      }

      currentY = maxSeatBottom + 40;

      sectionDefs.push({
        name: secName,
        ticket_type_id: ticketTypeId,
        default_price: defaultPrice,
        rows: rowCount,
        seatsPerRow,
        x: startX,
        y: startY,
      });
    } else if (sec.mode === "tables") {
      const tableCount = sec.tableCount!;
      const seatsPerTable = sec.seatsPerTable!;
      const tableShape = sec.tableShape || "round";
      const tableWidth = tableShape === "round" ? 100 : 130;
      const tableHeight = 100;
      const tableSpacing = sec.tableGapX !== undefined ? sec.tableGapX : 60;
      const tableFootprint = tableWidth + tableSpacing + 40;

      let startTableNum = sec.startTableNumber;
      if (startTableNum === undefined) {
        if (config.existingSeats && config.existingSeats.length > 0) {
          startTableNum = parseInt(nextTableNumber(config.existingSeats, config.existingVenueObjects || []), 10) || 1;
        } else {
          startTableNum = 1;
        }
      }

      const tableStartX = sec.startX !== undefined && Number.isFinite(sec.startX) ? sec.startX : originX;
      const tableStartY = sec.startY !== undefined && Number.isFinite(sec.startY) ? sec.startY : currentY;

      let maxTableBottom = tableStartY + tableHeight;

      for (let t = 0; t < tableCount; t++) {
        const currentTableNum = String(startTableNum + t);
        const tableName = sec.tableNamePrefix
          ? `${sec.tableNamePrefix} ${currentTableNum}`
          : `Table ${currentTableNum}`;

        const tX = tableStartX + t * tableFootprint;
        const tY = tableStartY;

        const tableSeats = generateTableSeats({
          eventId,
          layoutId,
          tableNumber: currentTableNum,
          tableName,
          tableCapacity: seatsPerTable,
          tableX: tX,
          tableY: tY,
          tableWidth,
          tableHeight,
          tableShape,
          ticketTypeId,
          priceOverride: defaultPrice,
          isVip,
        });

        for (const seat of tableSeats) {
          const key = `${seat.section}:::${seat.row_label}:::${seat.seat_number}`;
          if (seenKeys.has(key)) {
            throw new SeatingValidationError([
              `Duplicate logical seat key generated: Section "${seat.section}", Row ${seat.row_label}, Seat ${seat.seat_number}.`,
            ]);
          }
          seenKeys.add(key);

          const preservedId = existingMap.get(key);
          generatedSeats.push({
            ...seat,
            is_accessible: isAccessible,
            id: preservedId,
          });
        }

        generatedObjects.push({
          id: `table-shape-${currentTableNum}-${tX}-${tY}`,
          type: "table",
          name: tableName,
          label: tableName,
          table_number: currentTableNum,
          table_name: tableName,
          table_capacity: seatsPerTable,
          table_shape: tableShape,
          x: tX,
          y: tY,
          width: tableWidth,
          height: tableHeight,
        });

        if (tY + tableHeight + 40 > maxTableBottom) {
          maxTableBottom = tY + tableHeight + 40;
        }
      }

      currentY = maxTableBottom + 40;

      sectionDefs.push({
        name: secName,
        ticket_type_id: ticketTypeId,
        default_price: defaultPrice,
        x: tableStartX,
        y: tableStartY,
      });
    }
  }

  const vipCount = generatedSeats.filter((s) => s.is_vip).length;
  const accessibleCount = generatedSeats.filter((s) => s.is_accessible).length;

  return {
    seats: generatedSeats,
    venueObjects: generatedObjects,
    sections: sectionDefs,
    summary: {
      totalSeats: generatedSeats.length,
      vipSeats: vipCount,
      regularSeats: generatedSeats.length - vipCount,
      accessibleSeats: accessibleCount,
      sectionCount: sectionDefs.length,
      tableCount: generatedObjects.filter((o) => o.type === "table").length,
    },
  };
}

// ─── PROTECTION & COMBINATION HELPERS ───────────────────────────────────────

export function checkLayoutProtection(
  existingSeats: SeatGeometry[],
  saveMode: "append" | "replace"
): {
  canReplace: boolean;
  protectedCount: number;
  protectedSeats: SeatGeometry[];
  warningMessage?: string;
} {
  const protectedSeats = (existingSeats || []).filter(
    (s) => s.status === "sold" || Boolean(s.assigned_invitation_id)
  );
  const canReplace = saveMode !== "replace" || protectedSeats.length === 0;
  return {
    canReplace,
    protectedCount: protectedSeats.length,
    protectedSeats,
    warningMessage:
      !canReplace
        ? `Cannot replace layout: ${protectedSeats.length} seat(s) are already sold or assigned to active guests.`
        : undefined,
  };
}

export function combineSeatingForSave(params: {
  saveMode: "append" | "replace";
  existingSeats: SeatGeometry[];
  existingVenueObjects: VenueObject[];
  existingSections?: SectionDefinition[];
  generatedSeats: CanonicalGeneratedSeat[];
  generatedVenueObjects: VenueObject[];
  generatedSections: SectionDefinition[];
}): {
  seats: (SeatGeometry | CanonicalGeneratedSeat)[];
  venueObjects: VenueObject[];
  sections: SectionDefinition[];
  deleteIds: string[];
} {
  const {
    saveMode,
    existingSeats,
    existingVenueObjects,
    existingSections = [],
    generatedSeats,
    generatedVenueObjects,
    generatedSections,
  } = params;

  if (saveMode === "replace") {
    const deleteIds = (existingSeats || [])
      .map((s) => s.id)
      .filter(isPersistedSeatId);

    return {
      seats: generatedSeats,
      venueObjects: generatedVenueObjects,
      sections: generatedSections,
      deleteIds,
    };
  }

  // Append mode: retain existing layout and append newly generated elements
  const deleteIds: string[] = [];
  const finalSeatsMap = new Map<string, SeatGeometry | CanonicalGeneratedSeat>();

  for (const seat of existingSeats || []) {
    const key = `${seat.section}:::${seat.row_label}:::${seat.seat_number}`;
    finalSeatsMap.set(key, seat);
  }

  for (const seat of generatedSeats || []) {
    const key = `${seat.section}:::${seat.row_label}:::${seat.seat_number}`;
    finalSeatsMap.set(key, seat);
  }

  // Combine venue objects (avoiding duplicates by object id)
  const finalObjectsMap = new Map<string, VenueObject>();
  for (const obj of existingVenueObjects || []) {
    finalObjectsMap.set(obj.id, obj);
  }
  for (const obj of generatedVenueObjects || []) {
    finalObjectsMap.set(obj.id, obj);
  }

  // Combine sections definitions (avoiding duplicates by section name)
  const finalSectionsMap = new Map<string, SectionDefinition>();
  for (const sec of existingSections || []) {
    finalSectionsMap.set(sec.name, sec);
  }
  for (const sec of generatedSections || []) {
    finalSectionsMap.set(sec.name, sec);
  }

  return {
    seats: Array.from(finalSeatsMap.values()),
    venueObjects: Array.from(finalObjectsMap.values()),
    sections: Array.from(finalSectionsMap.values()),
    deleteIds,
  };
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
