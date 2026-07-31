"use client";

import { useState, useRef, useEffect } from "react";

type SeatStatus = "available" | "reserved" | "sold" | "selected";

type SeatData = {
  id: string;
  section: string;
  row_label: string;
  seat_number: number;
  status: "available" | "reserved" | "sold";
  price_override: number | null;
};

type SectionConfig = {
  name: string;
  rows: number;
  seatsPerRow: number;
};

type Props = {
  seats: SeatData[];
  sections: SectionConfig[];
  basePrice: number;
  maxSelectable?: number;
  onSelectionChange: (selected: SeatData[]) => void;
};

const STATUS_COLORS: Record<SeatStatus, string> = {
  available: "#3b82f6",   // blue
  reserved: "#f59e0b",    // amber
  sold: "#d1d5db",        // gray
  selected: "#f97316",    // orange
};

const STATUS_LABELS: Record<SeatStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  selected: "Selected",
};

export default function SeatMap({ seats, sections, basePrice, maxSelectable = 10, onSelectionChange }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{ seat: SeatData; x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Build a map for quick status lookup
  const seatMap = new Map(seats.map((s) => [`${s.section}|${s.row_label}|${s.seat_number}`, s]));

  function getSeatStatus(section: string, row: string, num: number): SeatStatus {
    const key = `${section}|${row}|${num}`;
    const seat = seatMap.get(key);
    if (!seat) return "available";
    if (selected.has(seat.id)) return "selected";
    return seat.status;
  }

  function getSeatData(section: string, row: string, num: number): SeatData | undefined {
    return seatMap.get(`${section}|${row}|${num}`);
  }

  function handleSeatClick(seat: SeatData | undefined, section: string, row: string, num: number) {
    if (!seat) return;
    if (seat.status === "sold" || seat.status === "reserved") return;

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

  const SEAT_R = 12;
  const SEAT_GAP = 6;
  const ROW_GAP = 10;
  const SECTION_GAP = 40;
  const SECTION_LABEL_H = 32;
  const ROW_LABEL_W = 24;

  // Calculate SVG layout
  let svgWidth = ROW_LABEL_W;
  let svgHeight = 60; // stage area

  const sectionLayouts: { section: SectionConfig; x: number; y: number; width: number; height: number }[] = [];

  sections.forEach((section) => {
    const w = ROW_LABEL_W + section.seatsPerRow * (SEAT_R * 2 + SEAT_GAP);
    const h = SECTION_LABEL_H + section.rows * (SEAT_R * 2 + ROW_GAP);
    sectionLayouts.push({ section, x: 0, y: svgHeight, width: w, height: h });
    svgHeight += h + SECTION_GAP;
    svgWidth = Math.max(svgWidth, w);
  });

  svgHeight += 20;

  const rows = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setScale((s) => Math.min(2.5, Math.max(0.5, s - e.deltaY * 0.001)));
  }

  function handleMouseDown(e: React.MouseEvent) {
    if ((e.target as SVGElement).tagName === "circle") return;
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

  const selectedCount = selected.size;
  const selectedSeats = seats.filter((s) => selected.has(s.id));
  const totalPrice = selectedSeats.reduce((sum, s) => sum + (s.price_override ?? basePrice), 0);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
        {(Object.entries(STATUS_LABELS) as [SeatStatus, string][]).map(([status, label]) => (
          <div key={status} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[status] }}
            />
            <span className="text-zinc-600">{label}</span>
          </div>
        ))}
      </div>

      {/* Stage */}
      <div className="bg-zinc-900 text-white text-center py-2 rounded-xl text-sm font-black tracking-widest">
        🎭 STAGE / FLOOR
      </div>

      {/* SVG Map */}
      <div
        ref={containerRef}
        className="border border-zinc-200 rounded-2xl bg-zinc-50 overflow-hidden cursor-grab active:cursor-grabbing select-none"
        style={{ height: 380, position: "relative" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { isPanning.current = false; setTooltip(null); }}
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "top left",
            display: "block",
          }}
        >
          {sectionLayouts.map(({ section, y }) => (
            <g key={section.name}>
              {/* Section label */}
              <rect x={0} y={y} width={svgWidth} height={SECTION_LABEL_H} fill="#f1f5f9" rx={6} />
              <text
                x={svgWidth / 2}
                y={y + SECTION_LABEL_H / 2 + 5}
                textAnchor="middle"
                fontSize={13}
                fontWeight="bold"
                fill="#475569"
              >
                {section.name} Section
              </text>

              {/* Rows */}
              {Array.from({ length: section.rows }, (_, rowIdx) => {
                const rowLabel = rows[rowIdx] || String(rowIdx + 1);
                const rowY = y + SECTION_LABEL_H + rowIdx * (SEAT_R * 2 + ROW_GAP) + SEAT_R;

                return (
                  <g key={rowLabel}>
                    {/* Row label */}
                    <text
                      x={ROW_LABEL_W / 2}
                      y={rowY + 4}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight="bold"
                      fill="#94a3b8"
                    >
                      {rowLabel}
                    </text>

                    {/* Seats */}
                    {Array.from({ length: section.seatsPerRow }, (_, seatIdx) => {
                      const seatNum = seatIdx + 1;
                      const cx = ROW_LABEL_W + seatIdx * (SEAT_R * 2 + SEAT_GAP) + SEAT_R;
                      const status = getSeatStatus(section.name, rowLabel, seatNum);
                      const seatData = getSeatData(section.name, rowLabel, seatNum);
                      const isClickable = status === "available" || status === "selected";

                      return (
                        <circle
                          key={seatNum}
                          cx={cx}
                          cy={rowY}
                          r={SEAT_R - 1}
                          fill={STATUS_COLORS[status]}
                          stroke={status === "selected" ? "#ea580c" : "white"}
                          strokeWidth={status === "selected" ? 2 : 1}
                          style={{
                            cursor: isClickable ? "pointer" : "not-allowed",
                            opacity: status === "sold" ? 0.5 : 1,
                            transition: "fill 0.15s, r 0.1s",
                          }}
                          onClick={() => handleSeatClick(seatData, section.name, rowLabel, seatNum)}
                          onMouseEnter={(e) => {
                            if (seatData) {
                              const rect = containerRef.current?.getBoundingClientRect();
                              if (rect) {
                                setTooltip({
                                  seat: seatData,
                                  x: e.clientX - rect.left,
                                  y: e.clientY - rect.top,
                                });
                              }
                            }
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-20 bg-zinc-900 text-white text-xs rounded-xl px-3 py-2 pointer-events-none shadow-xl"
            style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
          >
            <p className="font-black">
              {tooltip.seat.section} · Row {tooltip.seat.row_label} · Seat {tooltip.seat.seat_number}
            </p>
            <p className="text-zinc-300">
              {tooltip.seat.status === "sold"
                ? "Sold out"
                : tooltip.seat.status === "reserved"
                ? "Reserved"
                : `$${(tooltip.seat.price_override ?? basePrice).toFixed(2)}`}
            </p>
          </div>
        )}

        {/* Zoom hint */}
        <div className="absolute bottom-3 right-3 text-xs text-zinc-400 bg-white/80 rounded-lg px-2 py-1">
          Scroll to zoom · Drag to pan
        </div>
      </div>

      {/* Selection summary */}
      {selectedCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="font-black text-orange-900">
              {selectedCount} seat{selectedCount > 1 ? "s" : ""} selected
            </p>
            <p className="text-sm text-orange-700">
              {selectedSeats.map((s) => `${s.section}-${s.row_label}${s.seat_number}`).join(", ")}
            </p>
          </div>
          <p className="text-2xl font-black text-orange-600">${totalPrice.toFixed(2)}</p>
        </div>
      )}

      {maxSelectable > 1 && (
        <p className="text-xs text-zinc-400 text-center">
          You can select up to {maxSelectable} seats
        </p>
      )}
    </div>
  );
}
