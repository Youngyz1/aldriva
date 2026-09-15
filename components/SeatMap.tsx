"use client";

import { useState, useRef, useMemo } from "react";
import { Star, Accessibility } from "lucide-react";
import { VenueObject, TicketTypeSummary } from "@/lib/seating";

export type SeatStatus = "available" | "reserved" | "sold" | "selected" | "unavailable";

export type SeatData = {
  id: string;
  section: string;
  row_label: string;
  seat_number: number;
  status: "available" | "reserved" | "sold" | "unavailable";
  price_override?: number | null;
  effective_price?: number | null;
  table_number?: string | null;
  table_name?: string | null;
  table_capacity?: number | null;
  is_vip?: boolean;
  is_accessible?: boolean;
  ticket_type_id?: string | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  rotation?: number | null;
  object_type?: "seat" | "table_seat" | "ga_spot" | string;
};

export type SectionConfig = {
  name: string;
  rows?: number;
  seatsPerRow?: number;
  color?: string;
  default_price?: number | null;
  ticket_type_id?: string | null;
};

type Props = {
  seats: SeatData[];
  sections?: SectionConfig[];
  venueObjects?: VenueObject[];
  canvasWidth?: number;
  canvasHeight?: number;
  ticketTypes?: TicketTypeSummary[];
  basePrice?: number;
  maxSelectable?: number;
  onSelectionChange: (selected: SeatData[]) => void;
};

// Muted neutral for available seats; saturated color reserved for active/
// unavailable states so a buyer's eye is drawn to what can be selected.
const STATUS_COLORS: Record<SeatStatus, string> = {
  available: "#cbd5e1",   // slate-300 tinted neutral
  selected: "#ea580c",    // orange-600 (high contrast)
  reserved: "#f59e0b",    // amber-500
  sold: "#94a3b8",        // slate-400
  unavailable: "#ef4444", // red-500
};

const STATUS_STROKES: Record<SeatStatus, string> = {
  available: "#94a3b8",
  selected: "#c2410c",
  reserved: "#b45309",
  sold: "#64748b",
  unavailable: "#b91c1c",
};

const STATUS_LABELS: Record<SeatStatus, string> = {
  available: "Available",
  selected: "Selected",
  reserved: "Reserved",
  sold: "Sold",
  unavailable: "Unavailable",
};

export default function SeatMap({
  seats,
  sections = [],
  venueObjects = [],
  canvasWidth = 1000,
  canvasHeight = 700,
  ticketTypes = [],
  basePrice = 0,
  maxSelectable = 10,
  onSelectionChange,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hoveredSeatId, setHoveredSeatId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    seat: SeatData;
    x: number;
    y: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize seats: ensure each seat has x, y coordinates
  const processedSeats = useMemo(() => {
    let fallbackY = 120;
    const result: (SeatData & { x: number; y: number; width: number; height: number })[] = [];

    // Group by section for fallback positioning if coordinates are missing
    const sectionGroups = new Map<string, SeatData[]>();
    seats.forEach((s) => {
      const sec = s.section || "General";
      if (!sectionGroups.has(sec)) sectionGroups.set(sec, []);
      sectionGroups.get(sec)!.push(s);
    });

    // Check if any seat already has spatial coordinates
    const hasSpatial = seats.some((s) => s.x != null && s.y != null);

    if (hasSpatial) {
      seats.forEach((s) => {
        result.push({
          ...s,
          x: s.x ?? 100,
          y: s.y ?? 100,
          width: s.width ?? 26,
          height: s.height ?? 26,
        });
      });
    } else {
      // Procedural grid fallback
      sectionGroups.forEach((secSeats, secName) => {
        const rowsMap = new Map<string, SeatData[]>();
        secSeats.forEach((s) => {
          const r = s.row_label || "1";
          if (!rowsMap.has(r)) rowsMap.set(r, []);
          rowsMap.get(r)!.push(s);
        });

        let rowIdx = 0;
        rowsMap.forEach((rowSeats) => {
          rowSeats.forEach((s, seatIdx) => {
            result.push({
              ...s,
              x: 80 + seatIdx * 34,
              y: fallbackY + rowIdx * 36,
              width: 26,
              height: 26,
            });
          });
          rowIdx++;
        });

        fallbackY += rowIdx * 36 + 60;
      });
    }

    return result;
  }, [seats]);

  // Content bounding box (seats + venue objects incl. stage/tables/GA zones).
  // Rendered via SVG viewBox + preserveAspectRatio="xMidYMid meet" so the
  // browser fits the whole layout into the pane natively on every paint —
  // no JS viewport measuring (which raced the checkout modal's enter
  // animation and produced clipped or letterboxed renders). Previously the
  // canvas was drawn 1:1 into a fixed-height pane, so anything below the top
  // ~440px was unreachable unless the buyer panned; now pan/zoom are gone
  // and everything is always fully visible.
  // BADGE_MARGIN keeps VIP/accessible badges, hover rings, strokes and
  // rotated glyphs from kissing the viewport edge.
  const bounds = useMemo(() => {
    const BADGE_MARGIN = 18;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;

    const extend = (x: number, y: number, w: number, h: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
      count += 1;
    };

    processedSeats.forEach((s) => extend(s.x, s.y, s.width, s.height));
    venueObjects.forEach((o) => extend(o.x, o.y, o.width, o.height));

    if (count === 0) {
      return { minX: 0, minY: 0, width: canvasWidth, height: canvasHeight };
    }

    return {
      minX: minX - BADGE_MARGIN,
      minY: minY - BADGE_MARGIN,
      width: Math.max(maxX - minX + BADGE_MARGIN * 2, 100),
      height: Math.max(maxY - minY + BADGE_MARGIN * 2, 100),
    };
  }, [processedSeats, venueObjects, canvasWidth, canvasHeight]);

  function getSeatStatus(seat: SeatData): SeatStatus {
    if (selected.has(seat.id)) return "selected";
    if (seat.status === "sold") return "sold";
    if (seat.status === "unavailable") return "unavailable";
    if (seat.status === "reserved") return "reserved";
    return "available";
  }

  function handleSeatClick(seat: SeatData) {
    if (seat.status === "sold" || seat.status === "unavailable" || seat.status === "reserved") {
      return;
    }

    const newSelected = new Set(selected);
    if (newSelected.has(seat.id)) {
      newSelected.delete(seat.id);
    } else {
      if (newSelected.size >= maxSelectable) return;
      newSelected.add(seat.id);
    }
    setSelected(newSelected);
    onSelectionChange(seats.filter((s) => newSelected.has(s.id)));
  }

  const selectedCount = selected.size;
  const selectedSeats = seats.filter((s) => selected.has(s.id));
  const totalPrice = selectedSeats.reduce((sum, s) => {
    const price = s.effective_price ?? s.price_override ?? basePrice;
    return sum + (price > 0 ? price : 0);
  }, 0);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white p-3 text-xs font-bold text-zinc-600 shadow-xs">
        {(Object.entries(STATUS_LABELS) as [SeatStatus, string][]).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span
              className="h-3.5 w-3.5 rounded-full border border-black/10 shadow-xs"
              style={{ backgroundColor: STATUS_COLORS[status] }}
            />
            <span>{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 text-amber-600">
          <Star size={12} className="fill-amber-400" />
          <span>VIP</span>
        </div>
        <div className="flex items-center gap-1 text-blue-600">
          <Accessibility size={12} />
          <span>Accessible</span>
        </div>
      </div>

      {/* Auto-fit Interactive SVG Canvas (no zoom/pan — always fully visible) */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-inner select-none"
        style={{ height: 460 }}
        onMouseLeave={() => {
          setTooltip(null);
          setHoveredSeatId(null);
        }}
      >
        <svg
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-full w-full"
        >
          {/* 1. Render Non-Seat Venue Objects (Stages, Tables, GA Zones, Labels, Shapes) */}
          {venueObjects.map((obj) => {
            if (obj.type === "stage") {
              return (
                <g key={obj.id} transform={`rotate(${obj.rotation || 0}, ${obj.x + obj.width / 2}, ${obj.y + obj.height / 2})`}>
                  {/* Bold stage anchor: near-black body, strong border, large tracked label */}
                  <rect
                    x={obj.x}
                    y={obj.y}
                    width={obj.width}
                    height={obj.height}
                    rx={12}
                    fill="#18181b"
                    stroke="#71717a"
                    strokeWidth={3}
                  />
                  <text
                    x={obj.x + obj.width / 2}
                    y={obj.y + obj.height / 2 + 6}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={16}
                    fontWeight="bold"
                    letterSpacing="2"
                    pointerEvents="none"
                  >
                    {obj.label || obj.name || "STAGE / PERFORMANCE AREA"}
                  </text>
                </g>
              );
            }

            if (obj.type === "table") {
              const isRound = obj.table_shape !== "rect";
              const centerX = obj.x + obj.width / 2;
              const centerY = obj.y + obj.height / 2;
              const radius = Math.min(obj.width, obj.height) / 2;

              return (
                <g key={obj.id}>
                  {/* Refined table: solid neutral body, clean full-weight border */}
                  {isRound ? (
                    <circle
                      cx={centerX}
                      cy={centerY}
                      r={radius}
                      fill="#e4e4e7"
                      stroke="#a1a1aa"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <rect
                      x={obj.x}
                      y={obj.y}
                      width={obj.width}
                      height={obj.height}
                      rx={10}
                      fill="#e4e4e7"
                      stroke="#a1a1aa"
                      strokeWidth={1.5}
                    />
                  )}
                  <text
                    x={centerX}
                    y={centerY + 4}
                    textAnchor="middle"
                    fill="#3f3f46"
                    fontSize={11}
                    fontWeight="bold"
                    pointerEvents="none"
                  >
                    {obj.table_name || `Table ${obj.table_number || ""}`}
                  </text>
                </g>
              );
            }

            if (obj.type === "ga_area") {
              return (
                <g key={obj.id}>
                  <rect
                    x={obj.x}
                    y={obj.y}
                    width={obj.width}
                    height={obj.height}
                    rx={10}
                    fill="#ecfdf5"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                  />
                  <text
                    x={obj.x + 12}
                    y={obj.y + 20}
                    fill="#047857"
                    fontSize={12}
                    fontWeight="bold"
                  >
                    {obj.label || obj.name || "Standing / GA Zone"}
                  </text>
                  {obj.capacity && (
                    <text x={obj.x + 12} y={obj.y + 36} fill="#059669" fontSize={10}>
                      Capacity: {obj.capacity}
                    </text>
                  )}
                </g>
              );
            }

            if (obj.type === "label") {
              return (
                <text
                  key={obj.id}
                  x={obj.x}
                  y={obj.y}
                  fill={obj.color || "#475569"}
                  fontSize={13}
                  fontWeight="bold"
                  transform={obj.rotation ? `rotate(${obj.rotation}, ${obj.x}, ${obj.y})` : undefined}
                >
                  {obj.label || obj.name}
                </text>
              );
            }

            // Default decorative shape/aisle
            return (
              <rect
                key={obj.id}
                x={obj.x}
                y={obj.y}
                width={obj.width}
                height={obj.height}
                rx={4}
                fill="#f4f4f5"
                stroke="#d4d4d8"
                strokeWidth={1}
              />
            );
          })}

          {/* 2. Render Interactive Physical Seats */}
          {processedSeats.map((seat) => {
            const status = getSeatStatus(seat);
            const isClickable = status === "available" || status === "selected";
            const isSelected = status === "selected";
            const isSold = status === "sold";
            const isUnavailable = status === "unavailable";
            const isHovered = hoveredSeatId === seat.id;

            const radius = (seat.width || 26) / 2 - 1;
            const centerX = seat.x + radius + 1;
            const centerY = seat.y + radius + 1;
            const numberColor = status === "available" ? "#334155" : "#ffffff";
            const fill = STATUS_COLORS[status];
            const stroke = isSelected ? STATUS_STROKES.selected : STATUS_STROKES[status];
            const strokeWidth = isSelected ? 3 : 1.5;

            return (
              <g
                key={seat.id}
                data-seat-id={seat.id}
                transform={seat.rotation ? `rotate(${seat.rotation}, ${centerX}, ${centerY})` : undefined}
                className={isClickable ? "cursor-pointer" : "cursor-not-allowed"}
                onClick={() => handleSeatClick(seat)}
                onMouseEnter={(e) => {
                  setHoveredSeatId(seat.id);
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (rect) {
                    setTooltip({
                      seat,
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                    });
                  }
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Hover affordance ring for available seats */}
                {isHovered && isClickable && !isSelected && (
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={radius + 3.5}
                    fill="none"
                    stroke="#ea580c"
                    strokeWidth={2}
                    opacity={0.5}
                    pointerEvents="none"
                  />
                )}

                {/* Seat Body */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={radius}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  style={{
                    opacity: isSold ? 0.5 : isUnavailable ? 0.4 : 1,
                    transition: "fill 0.15s",
                  }}
                />

                {/* Reserved: dashed inner ring to separate it from VIP amber */}
                {status === "reserved" && (
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={radius - 3}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    opacity={0.85}
                    pointerEvents="none"
                  />
                )}

                {/* Sold: diagonal slash */}
                {isSold && (
                  <line
                    x1={centerX - radius * 0.5}
                    y1={centerY - radius * 0.5}
                    x2={centerX + radius * 0.5}
                    y2={centerY + radius * 0.5}
                    stroke="#ffffff"
                    strokeWidth={1.25}
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                )}

                {/* VIP Star badge (top-right) */}
                {seat.is_vip && !isSold && (
                  <g transform={`translate(${centerX + radius * 0.5}, ${centerY - radius * 0.55})`} pointerEvents="none">
                    <circle r={7} fill="#ffffff" stroke="#f59e0b" strokeWidth={1} />
                    <g transform="translate(-5.5, -5.5)">
                      <Star size={11} fill="#f59e0b" color="#f59e0b" strokeWidth={1} />
                    </g>
                  </g>
                )}

                {/* Accessible badge (top-left) */}
                {seat.is_accessible && !isSold && (
                  <g transform={`translate(${centerX - radius * 0.5 - 14}, ${centerY - radius * 0.55})`} pointerEvents="none">
                    <circle r={7} fill="#ffffff" stroke="#3b82f6" strokeWidth={1} />
                    <g transform="translate(-5.5, -5.5)">
                      <Accessibility size={11} color="#2563eb" strokeWidth={2.4} />
                    </g>
                  </g>
                )}

                {/* Seat Number Text */}
                <text
                  x={centerX}
                  y={centerY + 3}
                  textAnchor="middle"
                  fill={numberColor}
                  fontSize={radius > 11 ? 9 : 8}
                  fontWeight="bold"
                  pointerEvents="none"
                >
                  {seat.seat_number}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip Overlay */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none rounded-xl bg-zinc-900/95 px-3 py-2 text-xs text-white shadow-2xl backdrop-blur-xs transition-all border border-zinc-700"
            style={{
              left: tooltip.x + 12,
              top: Math.max(tooltip.y - 50, 10),
            }}
          >
            <p className="font-black">
              {tooltip.seat.table_number
                ? `Table ${tooltip.seat.table_number} · Seat ${tooltip.seat.seat_number}`
                : `${tooltip.seat.section} · Row ${tooltip.seat.row_label} · Seat ${tooltip.seat.seat_number}`}
            </p>
            {tooltip.seat.table_name && (
              <p className="text-[10px] text-zinc-400 font-semibold">{tooltip.seat.table_name}</p>
            )}
            <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
              <span className="font-bold text-zinc-300">
                {tooltip.seat.status === "sold"
                  ? "Sold Out"
                  : tooltip.seat.status === "unavailable"
                  ? "Unavailable"
                  : tooltip.seat.status === "reserved"
                  ? "Reserved"
                  : `$${(tooltip.seat.effective_price ?? tooltip.seat.price_override ?? basePrice).toFixed(2)}`}
              </span>
              {tooltip.seat.is_vip && (
                <span className="rounded-sm bg-amber-500/20 px-1 py-0.5 text-[9px] font-black text-amber-300">
                  VIP
                </span>
              )}
              {tooltip.seat.is_accessible && (
                <span className="rounded-sm bg-blue-500/20 px-1 py-0.5 text-[9px] font-black text-blue-300">
                  Accessible
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected Seats Summary Box */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
          <div>
            <p className="font-black text-orange-950">
              {selectedCount} seat{selectedCount > 1 ? "s" : ""} selected
            </p>
            <p className="text-xs font-semibold text-orange-800">
              {selectedSeats
                .map((s) =>
                  s.table_number
                    ? `Table ${s.table_number}-S${s.seat_number}`
                    : `${s.section}-${s.row_label}${s.seat_number}`
                )
                .join(", ")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-orange-700">Total Price</p>
            <p className="text-2xl font-black text-orange-600">${totalPrice.toFixed(2)}</p>
          </div>
        </div>
      )}

      {maxSelectable > 1 && (
        <p className="text-center text-xs font-semibold text-zinc-400">
          You can select up to {maxSelectable} seats per order.
        </p>
      )}
    </div>
  );
}