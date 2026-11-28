"use client";

import { useCallback, useEffect, useRef } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

export interface SlotPickerDateChip {
  ymd: string;
  weekday: string;
  date: string;
  count: number;
}

export interface SlotPickerProps {
  dateYmd: string;
  min: string;
  max: string;
  onDateChange: (ymd: string) => void;
  quickDates: SlotPickerDateChip[];
  slots: string[];
  selectedSlot: string | null;
  onSlotChange: (slot: string) => void;
  disabledSlots?: Set<string>;
  labels: {
    chooseDate: string;
    chooseTime: string;
    closedThatDay: string;
  };
}

/**
 * SlotPicker — date strip (scrollable two-line chips with side arrow buttons
 * + native date input) and time slot pills (default, selected aria-pressed,
 * disabled). Styling is scoped under .rsv-form in reservations.css.
 */
export function SlotPicker({
  dateYmd,
  min,
  max,
  onDateChange,
  quickDates,
  slots,
  selectedSlot,
  onSlotChange,
  disabledSlots,
  labels,
}: SlotPickerProps) {
  const disabled = disabledSlots ?? new Set<string>();
  const stripRef = useRef<HTMLDivElement>(null);

  const scrollBy = useCallback((delta: number) => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  // Scroll the selected date chip into view on mount and whenever the
  // selected date changes.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const selected = strip.querySelector<HTMLElement>('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [dateYmd]);

  return (
    <div className="rsv-slot-picker space-y-[var(--ps-space-3)]">
      <div>
        <label htmlFor="reservation-date" className="rsv-label">
          {labels.chooseDate} <span className="rsv-required" aria-hidden="true">*</span>
        </label>
        <div className="rsv-date-strip-wrapper">
          <button
            type="button"
            aria-label="Previous dates"
            onClick={() => scrollBy(-140)}
            className="rsv-date-strip__arrow rsv-date-strip__arrow--left"
          >
            <IconChevronLeft size={16} stroke={1.5} />
          </button>
          <div
            ref={stripRef}
            className="rsv-date-strip overflow-x-auto px-[var(--ps-space-1)] -mx-[var(--ps-space-1)]"
          >
            {quickDates.map((d) => {
              const selected = dateYmd === d.ymd;
              return (
                <button
                  key={d.ymd}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-selected={selected}
                  onClick={() => onDateChange(d.ymd)}
                  className="rsv-date-strip__chip"
                >
                  <span className="rsv-date-chip__weekday">{d.weekday}</span>
                  <span className="rsv-date-chip__date">{d.date}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label="Next dates"
            onClick={() => scrollBy(140)}
            className="rsv-date-strip__arrow rsv-date-strip__arrow--right"
          >
            <IconChevronRight size={16} stroke={1.5} />
          </button>
        </div>
        <input
          id="reservation-date"
          type="date"
          required
          min={min}
          max={max}
          value={dateYmd}
          onChange={(e) => {
            if (e.target.value) onDateChange(e.target.value);
          }}
          className="rsv-input"
          aria-invalid={!dateYmd ? "true" : undefined}
        />
      </div>

      <div>
        <label htmlFor="reservation-time" className="rsv-label">
          {labels.chooseTime} <span className="rsv-required" aria-hidden="true">*</span>
        </label>
        {slots.length === 0 ? (
          <p id="reservation-time-hint" className="rsv-closed-hint">
            {labels.closedThatDay}
          </p>
        ) : (
          <div className="rsv-slot-grid">
            {slots.map((s) => {
              const selected = selectedSlot === s;
              const unavail = disabled.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={unavail}
                  data-selected={selected}
                  disabled={unavail}
                  onClick={() => !unavail && onSlotChange(s)}
                  className="rsv-slot"
                >
                  {s}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
