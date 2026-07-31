"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { MapPin, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import LocationAutocomplete from "@/components/shared/LocationAutocomplete";

export type WhenValue = "today" | "tomorrow" | "weekend" | "next_weekend" | "custom" | "all";

const PRESETS: { value: Exclude<WhenValue, "custom" | "all">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekend", label: "This weekend" },
  { value: "next_weekend", label: "Next weekend" },
];

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}
function buildMonthGrid(year: number, month: number): (number | null)[] {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
}
function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function formatShort(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function EventsLocationDateBar({
  initialLocation,
  initialWhen,
  initialFrom,
  initialTo,
  citySuggestions,
}: {
  initialLocation: string;
  initialWhen: WhenValue;
  initialFrom?: string;
  initialTo?: string;
  citySuggestions: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [locationOpen, setLocationOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [rangeStart, setRangeStart] = useState<string | null>(initialFrom ?? null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(initialTo ?? null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) setLocationOpen(false);
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setDateOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) =>
      value ? params.set(key, value) : params.delete(key)
    );
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  const commitLocation = (value: string) => {
    setLocationOpen(false);
    updateParams({ location: value || null });
  };

  const commitPreset = (preset: Exclude<WhenValue, "custom" | "all">) => {
    setRangeStart(null);
    setRangeEnd(null);
    setDateOpen(false);
    updateParams({ when: preset, from: null, to: null });
  };

  const commitCustomRange = () => {
    if (!rangeStart) return;
    setDateOpen(false);
    updateParams({ when: null, from: rangeStart, to: rangeEnd ?? rangeStart });
  };

  const clearDate = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setDateOpen(false);
    updateParams({ when: null, from: null, to: null });
  };

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const dateLabel = (() => {
    if (initialWhen === "custom" && initialFrom) {
      return initialTo && initialTo !== initialFrom
        ? `${formatShort(initialFrom)} – ${formatShort(initialTo)}`
        : formatShort(initialFrom);
    }
    const preset = PRESETS.find((p) => p.value === initialWhen);
    return preset ? preset.label : "All dates";
  })();
  const isDateActive = initialWhen !== "all";

  const handleDayClick = (year: number, month: number, day: number) => {
    const key = toKey(year, month, day);
    if (!rangeStart || (rangeStart && rangeEnd) || key < rangeStart) {
      setRangeStart(key);
      setRangeEnd(null);
    } else {
      setRangeEnd(key);
    }
  };

  const renderMonth = (year: number, month: number) => {
    const cells = buildMonthGrid(year, month);
    const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());
    return (
      <div className="flex-1">
        <p className="mb-3 text-center text-sm font-black text-zinc-950">{monthLabel(year, month)}</p>
        <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
          {WEEKDAY_LABELS.map((wd) => (
            <span key={wd} className="pb-1 font-bold text-zinc-400">{wd}</span>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <span key={i} />;
            const key = toKey(year, month, day);
            const isPast = key < todayKey;
            const isStart = key === rangeStart;
            const isEnd = key === rangeEnd;
            const inRange = !!(rangeStart && rangeEnd && key > rangeStart && key < rangeEnd);
            return (
              <button
                key={i}
                type="button"
                disabled={isPast}
                onClick={() => handleDayClick(year, month, day)}
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition
                  ${isPast ? "cursor-not-allowed text-zinc-300" : "text-zinc-800 hover:bg-orange-50"}
                  ${isStart || isEnd ? "bg-orange-600 text-white hover:bg-orange-600" : ""}
                  ${inRange ? "bg-orange-50 text-orange-600" : ""}`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const nextMonth = viewMonth === 11 ? { year: viewYear + 1, month: 0 } : { year: viewYear, month: viewMonth + 1 };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Location pill */}
      <div ref={locationRef} className="relative">
        <button
          type="button"
          onClick={() => setLocationOpen((o) => !o)}
          className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold transition ${
            initialLocation
              ? "border-zinc-950 bg-zinc-950 text-white"
              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
          }`}
        >
          <MapPin className="h-4 w-4" />
          {initialLocation || "Location"}
        </button>
        {locationOpen && (
          <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl">
            <LocationAutocomplete
              value={initialLocation}
              suggestions={citySuggestions}
              onCommit={commitLocation}
              autoFocus
            />
            {initialLocation && (
              <button
                type="button"
                onClick={() => commitLocation("")}
                className="mt-2 text-xs font-bold text-zinc-400 hover:text-zinc-600"
              >
                Clear location
              </button>
            )}
          </div>
        )}
      </div>

      {/* Date pill */}
      <div ref={dateRef} className="relative">
        <button
          type="button"
          onClick={() => setDateOpen((o) => !o)}
          className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold transition ${
            isDateActive
              ? "border-zinc-950 bg-zinc-950 text-white"
              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          {dateLabel}
        </button>
        {dateOpen && (
          <div className="absolute right-0 top-full z-30 mt-2 w-[min(90vw,640px)] rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => commitPreset(p.value)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                    initialWhen === p.value
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={goPrevMonth}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goNextMonth}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
              {renderMonth(viewYear, viewMonth)}
              {renderMonth(nextMonth.year, nextMonth.month)}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4">
              <button
                type="button"
                onClick={clearDate}
                className="text-xs font-bold text-zinc-400 hover:text-zinc-600"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={!rangeStart}
                onClick={commitCustomRange}
                className="rounded-full bg-orange-600 px-6 py-2 text-sm font-black text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
