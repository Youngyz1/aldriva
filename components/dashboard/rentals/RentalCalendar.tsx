"use client";

/**
 * components/dashboard/rentals/RentalCalendar.tsx
 *
 * Vehicle availability calendar for the Rentals page's "Calendar" tab.
 * Vehicles as rows (grouped by category, unassigned bookings in their own
 * row at the top), days as columns. All data is fetched organizer-scoped
 * server-side in app/dashboard/org/[id]/rentals/page.tsx and handed down
 * as props — this component only lays it out and handles navigation
 * (prev/next/today, the 14/30-day toggle) and click targets.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  IconChevronLeft as ChevronLeft,
  IconChevronRight as ChevronRight,
  IconCar as Car,
} from "@tabler/icons-react";
import { vehicleLabel } from "@/lib/vehicle-label";

export type CalendarBookingStatus = "pending" | "awaiting_payment" | "confirmed" | "active";

export interface CalendarVehicle {
  id: string;
  make: string;
  model: string;
  licensePlate: string;
  categoryId: string;
  categoryName: string;
  photoUrl: string | null;
}

export interface CalendarBooking {
  id: string;
  bookingNumber: string;
  customerName: string;
  startsAt: string;
  endsAt: string;
  status: CalendarBookingStatus;
  vehicleId: string | null;
}

export interface CalendarBlock {
  id: string;
  vehicleId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}

export interface RentalCalendarProps {
  organizerId: string;
  vehicles: CalendarVehicle[];
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
  onOpenNewBooking: (vehicleId: string, dateStr: string) => void;
  canManage: boolean;
}

const DAY_WIDTH_DESKTOP = 96;
const DAY_WIDTH_MOBILE = 56;
const VEHICLE_COL_WIDTH_DESKTOP = 216;
const VEHICLE_COL_WIDTH_MOBILE = 96;
const ROW_HEIGHT = 56;
const DEFAULT_WINDOW_DAYS = 14;
/** Tailwind's `sm` breakpoint (640px) — below it is "mobile" for this grid. */
const MOBILE_BREAKPOINT_QUERY = "(max-width: 639px)";

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

type BarKind = "confirmed" | "active" | "pending" | "block";

const BAR_STYLE: Record<BarKind, { bg: string; label: string }> = {
  confirmed: { bg: "bg-blue-500", label: "Confirmed" },
  active: { bg: "bg-green-500", label: "Active (out on rental)" },
  pending: { bg: "bg-amber-500", label: "Pending / awaiting payment" },
  block: { bg: "bg-zinc-500", label: "Maintenance / blocked" },
};

function bookingKind(status: CalendarBookingStatus): BarKind {
  if (status === "active") return "active";
  if (status === "confirmed") return "confirmed";
  return "pending";
}

interface Bar {
  key: string;
  kind: BarKind;
  startIdx: number;
  endIdxExclusive: number;
  title: string;
  href: string | null;
}

/** Clamp a date into [0, totalDays] day-index space relative to windowStart. */
function dayIndexClamped(iso: string, windowStart: Date, totalDays: number): number {
  const diff = Math.round((startOfDay(new Date(iso)).getTime() - windowStart.getTime()) / 86_400_000);
  return Math.max(0, Math.min(totalDays, diff));
}

function buildBars(
  organizerId: string,
  windowStart: Date,
  totalDays: number,
  bookingsForRow: CalendarBooking[],
  blocksForRow: CalendarBlock[]
): Bar[] {
  const bars: Bar[] = [];
  for (const b of bookingsForRow) {
    const startIdx = dayIndexClamped(b.startsAt, windowStart, totalDays);
    const endIdxExclusive = dayIndexClamped(b.endsAt, windowStart, totalDays) + 1;
    if (startIdx >= endIdxExclusive || startIdx >= totalDays || endIdxExclusive <= 0) continue;
    const kind = bookingKind(b.status);
    bars.push({
      key: `booking-${b.id}`,
      kind,
      startIdx,
      endIdxExclusive: Math.min(endIdxExclusive, totalDays),
      title: `${b.bookingNumber} — ${b.customerName} (${BAR_STYLE[kind].label})`,
      href: `/dashboard/org/${organizerId}/rentals/${b.id}`,
    });
  }
  for (const blk of blocksForRow) {
    const startIdx = dayIndexClamped(blk.startsAt, windowStart, totalDays);
    const endIdxExclusive = dayIndexClamped(blk.endsAt, windowStart, totalDays) + 1;
    if (startIdx >= endIdxExclusive || startIdx >= totalDays || endIdxExclusive <= 0) continue;
    bars.push({
      key: `block-${blk.id}`,
      kind: "block",
      startIdx,
      endIdxExclusive: Math.min(endIdxExclusive, totalDays),
      title: `${blk.reason || "Maintenance"} (${BAR_STYLE.block.label})`,
      href: null,
    });
  }
  return bars;
}

function CalendarBar({ bar, dayWidth }: { bar: Bar; dayWidth: number }) {
  const left = bar.startIdx * dayWidth;
  const width = (bar.endIdxExclusive - bar.startIdx) * dayWidth - 4;
  const style = { left, width, top: 6, height: ROW_HEIGHT - 12 };
  const content = (
    <span className="truncate px-1.5 text-[11px] font-bold text-white leading-none">
      {bar.title}
    </span>
  );
  const className = `absolute flex items-center overflow-hidden rounded-md shadow-sm ${BAR_STYLE[bar.kind].bg}`;

  if (bar.href) {
    return (
      <Link href={bar.href} title={bar.title} style={style} className={`${className} z-10 hover:brightness-95`}>
        {content}
      </Link>
    );
  }
  return (
    <div title={bar.title} style={style} className={`${className} z-10 cursor-default`}>
      {content}
    </div>
  );
}

function VehicleThumb({ vehicle }: { vehicle: CalendarVehicle | null }) {
  if (!vehicle) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
        <Car className="h-4 w-4 text-zinc-300" />
      </div>
    );
  }
  if (vehicle.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={vehicle.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />;
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
      <Car className="h-4 w-4 text-zinc-300" />
    </div>
  );
}

export function RentalCalendar({
  organizerId,
  vehicles,
  bookings,
  blocks,
  onOpenNewBooking,
  canManage,
}: RentalCalendarProps) {
  const [windowStart, setWindowStart] = useState(() => startOfDay(new Date()));
  const [windowDays, setWindowDays] = useState<14 | 30>(DEFAULT_WINDOW_DAYS);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const DAY_WIDTH = isMobile ? DAY_WIDTH_MOBILE : DAY_WIDTH_DESKTOP;
  const VEHICLE_COL_WIDTH = isMobile ? VEHICLE_COL_WIDTH_MOBILE : VEHICLE_COL_WIDTH_DESKTOP;

  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(
    () => Array.from({ length: windowDays }, (_, i) => addDays(windowStart, i)),
    [windowStart, windowDays]
  );

  const bookingsByVehicle = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const b of bookings) {
      const key = b.vehicleId ?? "__unassigned__";
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return map;
  }, [bookings]);

  const blocksByVehicle = useMemo(() => {
    const map = new Map<string, CalendarBlock[]>();
    for (const blk of blocks) {
      const list = map.get(blk.vehicleId) ?? [];
      list.push(blk);
      map.set(blk.vehicleId, list);
    }
    return map;
  }, [blocks]);

  const categoryGroups = useMemo(() => {
    const groups = new Map<string, { categoryId: string; categoryName: string; vehicles: CalendarVehicle[] }>();
    for (const v of vehicles) {
      const g = groups.get(v.categoryId) ?? { categoryId: v.categoryId, categoryName: v.categoryName || "Uncategorized", vehicles: [] };
      g.vehicles.push(v);
      groups.set(v.categoryId, g);
    }
    return Array.from(groups.values());
  }, [vehicles]);

  const unassignedBookings = bookingsByVehicle.get("__unassigned__") ?? [];
  const totalWidth = VEHICLE_COL_WIDTH + windowDays * DAY_WIDTH;

  function handlePrev() {
    setWindowStart((prev) => addDays(prev, -windowDays));
  }
  function handleNext() {
    setWindowStart((prev) => addDays(prev, windowDays));
  }
  function handleToday() {
    setWindowStart(startOfDay(new Date()));
  }

  function DayHeaderCell({ day }: { day: Date }) {
    const isToday = isSameDay(day, today);
    const weekend = isWeekend(day);
    return (
      <div
        style={{ width: DAY_WIDTH }}
        className={`flex shrink-0 flex-col items-center justify-center border-l border-zinc-100 py-1.5 text-center ${
          isToday ? "bg-brand-50" : weekend ? "bg-zinc-50" : "bg-white"
        }`}
      >
        <span className={`text-[10px] font-bold tracking-wider ${isToday ? "text-brand-700" : "text-zinc-400"}`}>
          {day.toLocaleDateString("en-GB", { weekday: "short" })}
        </span>
        <span className={`text-xs font-bold ${isToday ? "text-brand-700" : "text-zinc-700"}`}>
          {day.getDate()}
        </span>
      </div>
    );
  }

  function RowBackground({
    vehicleId,
    interactive,
  }: {
    vehicleId: string | null;
    interactive: boolean;
  }) {
    return (
      <div className="absolute inset-0 flex">
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const weekend = isWeekend(day);
          const bg = isToday ? "bg-brand-50/60" : weekend ? "bg-zinc-50" : "bg-white";
          if (!interactive || !vehicleId) {
            return <div key={i} style={{ width: DAY_WIDTH }} className={`shrink-0 border-l border-zinc-100 ${bg}`} />;
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => onOpenNewBooking(vehicleId, dateKey(day))}
              aria-label={`New booking on ${dateKey(day)}`}
              style={{ width: DAY_WIDTH }}
              className={`shrink-0 border-l border-zinc-100 ${bg} transition hover:bg-brand-50`}
            />
          );
        })}
      </div>
    );
  }

  function Row({
    vehicle,
    label,
    plate,
    bars,
  }: {
    vehicle: CalendarVehicle | null;
    label: string;
    plate: string | null;
    bars: Bar[];
  }) {
    return (
      <div className="flex border-b border-zinc-100" style={{ height: ROW_HEIGHT }}>
        <div
          className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-zinc-100 bg-white px-2 sm:px-3"
          style={{ width: VEHICLE_COL_WIDTH }}
        >
          <VehicleThumb vehicle={vehicle} />
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-zinc-900">{label}</p>
            {!isMobile && plate && (
              <p className="truncate text-[11px] font-mono text-zinc-500">{plate}</p>
            )}
          </div>
        </div>
        <div className="relative" style={{ width: windowDays * DAY_WIDTH, height: ROW_HEIGHT }}>
          <RowBackground vehicleId={vehicle?.id ?? null} interactive={Boolean(vehicle) && canManage} />
          {bars.map((bar) => (
            <CalendarBar key={bar.key} bar={bar} dayWidth={DAY_WIDTH} />
          ))}
        </div>
      </div>
    );
  }

  function CategoryHeaderRow({ label, count }: { label: string; count: number }) {
    return (
      <div className="flex bg-zinc-50 border-b border-zinc-100" style={{ minHeight: 32 }}>
        <div
          className="sticky left-0 z-20 flex shrink-0 items-center bg-zinc-50 px-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500"
          style={{ width: VEHICLE_COL_WIDTH }}
        >
          {label} ({count})
        </div>
        <div style={{ width: windowDays * DAY_WIDTH }} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous period"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleToday}
            className="h-8 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next period"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-xs font-semibold text-zinc-500">
            {days[0]?.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            {" – "}
            {days[days.length - 1]?.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden items-center gap-3 sm:flex">
            {(Object.keys(BAR_STYLE) as BarKind[]).map((k) => (
              <span key={k} className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
                <span className={`h-2.5 w-2.5 rounded-full ${BAR_STYLE[k].bg}`} />
                {BAR_STYLE[k].label.split(" (")[0]}
              </span>
            ))}
          </div>

          <div className="flex rounded-lg border border-zinc-200 p-0.5">
            <button
              type="button"
              onClick={() => setWindowDays(14)}
              className={`h-7 rounded-md px-2.5 text-xs font-bold transition ${
                windowDays === 14 ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              14d
            </button>
            <button
              type="button"
              onClick={() => setWindowDays(30)}
              className={`h-7 rounded-md px-2.5 text-xs font-bold transition ${
                windowDays === 30 ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              30d
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      {vehicles.length === 0 ? (
        <div className="p-8 text-center">
          <Car className="mx-auto h-8 w-8 text-zinc-200" />
          <p className="mt-2 text-sm font-semibold text-zinc-500">No vehicles to show on the calendar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: totalWidth }}>
            {/* Day header */}
            <div className="flex border-b border-zinc-200">
              <div
                className="sticky left-0 z-20 flex shrink-0 items-center bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500"
                style={{ width: VEHICLE_COL_WIDTH }}
              >
                Vehicle
              </div>
              <div className="flex">
                {days.map((day, i) => (
                  <DayHeaderCell key={i} day={day} />
                ))}
              </div>
            </div>

            {/* Unassigned row */}
            {unassignedBookings.length > 0 && (
              <>
                <CategoryHeaderRow label="Unassigned" count={unassignedBookings.length} />
                <Row
                  vehicle={null}
                  label="Unassigned bookings"
                  plate={null}
                  bars={buildBars(organizerId, windowStart, windowDays, unassignedBookings, [])}
                />
              </>
            )}

            {/* Category groups */}
            {categoryGroups.map((group) => (
              <div key={group.categoryId}>
                <CategoryHeaderRow label={group.categoryName} count={group.vehicles.length} />
                {group.vehicles.map((v) => (
                  <Row
                    key={v.id}
                    vehicle={v}
                    label={`${vehicleLabel(v.make, v.model)}`}
                    plate={v.licensePlate}
                    bars={buildBars(
                      organizerId,
                      windowStart,
                      windowDays,
                      bookingsByVehicle.get(v.id) ?? [],
                      blocksByVehicle.get(v.id) ?? []
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
