"use client";

export interface PartySizeSelectProps {
  id: string;
  label: string;
  value: number;
  options: number[];
  onChange: (n: number) => void;
  error?: string | null;
  className?: string;
}

/**
 * PartySizeSelect — styled party size select, full width on mobile and half
 * width from md. Reused by the Service and General Booking forms.
 */
export function PartySizeSelect({ id, label, value, options, onChange, error, className }: PartySizeSelectProps) {
  return (
    <div className={`rsv-party ${className ?? ""}`}>
      <label htmlFor={id} className="rsv-label">
        {label} <span className="rsv-required" aria-hidden="true">*</span>
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rsv-select"
        aria-invalid={error ? "true" : undefined}
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      {error && (
        <p className="rsv-error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
