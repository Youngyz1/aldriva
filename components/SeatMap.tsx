"use client";

import { useState, useRef, useMemo } from "react";
import { Star, Accessibility, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
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

const STATUS_COLORS: Record<SeatStatus, string> = {
  available: "#6366f1", // indigo
  selected: "#ea580c",  // orange
  reserved: "#f59e0b",  // amber
  sold: "#9ca3af",      // gray
  unavailable: "#ef4444", // red
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
  const [tooltip, setTooltip] = useState<{
    seat: SeatData;
    x: number;
    y: number;
  } | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
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

  // Zoom & Pan controls
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setScale((s) => Math.min(2.5, Math.max(0.4, s - e.deltaY * 0.001)));
  }

  function handleMouseDown(e: React.MouseEvent) {
    if ((e.target as SVGElement).tagName === "circle" || (e.target as SVGElement).tagName === "rect") {
      const isSeat = (e.target as SVGElement).getAttribute("data-seat-id");
      if (isSeat) return;
    }
    isPanning.current = true;
    lastPan.current = { x: e.clientX, y: e.clientY };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isPanning.current) return;
    setPan((p) => ({
      x: p.x + (e.clientX - lastPan.current.x),
      y: p.y + (e.clientY - lastPan.current.y),
    }));
    lastPan.current = { x: e.clientX, y: e.clientY };
  }

  function handleMouseUp() {
    isPanning.current = false;
  }

  function resetView() {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }

  const selectedCount = selected.size;
  const selectedSeats = seats.filter((s) => selected.has(s.id));
  const totalPrice = selectedSeats.reduce((sum, s) => {
    const price = s.effective_price ?? s.price_override ?? basePrice;
    return sum + (price > 0 ? price : 0);
  }, 0);

  // Dynamic canvas bounds
  const effectiveWidth = Math.max(canvasWidth, 900);
  const effectiveHeight = Math.max(canvasHeight, 600);

  return (
    <div className="space-y-4">
      {/* Legend & Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-zinc-600">
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

        {/* Zoom & Reset buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
            aria-label="Zoom In"
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 text-zinc-600 hover:bg-zinc-100"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.4, s - 0.2))}
            aria-label="Zoom Out"
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 text-zinc-600 hover:bg-zinc-100"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={resetView}
            aria-label="Reset View"
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 text-zinc-600 hover:bg-zinc-100"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Interactive SVG Canvas */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-inner cursor-grab active:cursor-grabbing select-none"
        style={{ height: 440 }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          isPanning.current = false;
          setTooltip(null);
        }}
      >
        <svg
          width={effectiveWidth}
          height={effectiveHeight}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "top left",
            display: "block",
          }}
        >
          {/* Subtle Canvas Grid Pattern */}
          <defs>
            <pattern id="customer-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#f1f5f9" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={effectiveWidth} height={effectiveHeight} fill="url(#customer-grid)" />

          {/* 1. Render Non-Seat Venue Objects (Stages, Tables, GA Zones, Labels, Shapes) */}
          {venueObjects.map((obj) => {
            if (obj.type === "stage") {
              return (
                <g key={obj.id} transform={`rotate(${obj.rotation || 0}, ${obj.x + obj.width / 2}, ${obj.y + obj.height / 2})`}>
                  <rect
                    x={obj.x}
                    y={obj.y}
                    width={obj.width}
                    height={obj.height}
                    rx={12}
                    fill="#18181b"
                    stroke="#27272a"
                    strokeWidth={2}
                  />
                  <text
                    x={obj.x + obj.width / 2}
                    y={obj.y + obj.height / 2 + 5}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={14}
                    fontWeight="bold"
                    letterSpacing="1.5"
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
                  {isRound ? (
                    <circle
                      cx={centerX}
                      cy={centerY}
                      r={radius}
                      fill="#e0e7ff"
                      stroke="#818cf8"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                    />
                  ) : (
                    <rect
                      x={obj.x}
                      y={obj.y}
                      width={obj.width}
                      height={obj.height}
                      rx={8}
                      fill="#e0e7ff"
                      stroke="#818cf8"
                      strokeWidth={2}
                    />
                  )}
                  <text
                    x={centerX}
                    y={centerY + 4}
                    textAnchor="middle"
                    fill="#4338ca"
                    fontSize={11}
                    fontWeight="bold"
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
                    <text
                      x={obj.x + 12}
                      y={obj.y + 36}
                      fill="#059669"
                      fontSize={10}
                    >
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
                fill="#f1f5f9"
                stroke="#cbd5e1"
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

            const radius = (seat.width || 26) / 2 - 1;
            const centerX = seat.x + radius + 1;
            const centerY = seat.y + radius + 1;

            return (
              <g
                key={seat.id}
                data-seat-id={seat.id}
                transform={seat.rotation ? `rotate(${seat.rotation}, ${centerX}, ${centerY})` : undefined}
                className={isClickable ? "cursor-pointer" : "cursor-not-allowed"}
                onClick={() => handleSeatClick(seat)}
                onMouseEnter={(e) => {
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
                {/* Seat Body Circle */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={radius}
                  fill={STATUS_COLORS[status]}
                  stroke={isSelected ? "#ea580c" : "#ffffff"}
                  strokeWidth={isSelected ? 3 : 1.5}
                  style={{
                    opacity: isSold ? 0.45 : isUnavailable ? 0.35 : 1,
                    transition: "fill 0.15s, transform 0.15s",
                  }}
                />

                {/* VIP Star Icon overlay */}
                {seat.is_vip && !isSold && (
                  <circle
                    cx={centerX + radius * 0.55}
                    cy={centerY - radius * 0.55}
                    r={4.5}
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                )}

                {/* Accessible Icon overlay */}
                {seat.is_accessible && !isSold && (
                  <circle
                    cx={centerX - radius * 0.55}
                    cy={centerY - radius * 0.55}
                    r={4.5}
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                )}

                {/* Seat Number Text */}
                <text
                  x={centerX}
                  y={centerY + 3}
                  textAnchor="middle"
                  fill="#ffffff"
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

        {/* Help hint */}
        <div className="absolute bottom-3 right-3 rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-zinc-500 shadow-xs backdrop-blur-xs border border-zinc-200/60">
          Scroll to zoom · Drag to move around
        </div>
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
