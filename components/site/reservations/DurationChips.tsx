"use client";

import { formatDurationOptionLabel } from "@/lib/reservation-slots";

export interface DurationChipsProps {
  options: number[];
  value: number;
  onChange: (minutes: number) => void;
  label: string;
  error?: string | null;
}

/**
 * DurationChips — segmented duration chips on their own row below the time
 * slots. Selected chip is filled with the accent color. Reused by the Service
 * and General Booking forms.
 */
export function DurationChips({ options, value, onChange, label, error }: DurationChipsProps) {
  return (
    <div className="rsv-duration">
      <label className="rsv-label">
        {label} <span className="rsv-required" aria-hidden="true">*</span>
      </label>
      <div className="rsv-duration-segmented">
        {options.map((d) => {
          const selected = value === d;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={selected}
              data-selected={selected}
              onClick={() => onChange(d)}
              className="rsv-duration-chip"
            >
              {formatDurationOptionLabel(d)}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="rsv-error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
