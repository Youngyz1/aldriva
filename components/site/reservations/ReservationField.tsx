"use client";

export interface ReservationFieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}

/**
 * ReservationField — label + control + inline error tied to the field through
 * aria-describedby / aria-invalid. Reused by the Service and General Booking
 * forms. Styling is scoped under .rsv-form in reservations.css.
 */
export function ReservationField({ id, label, required, error, children }: ReservationFieldProps) {
  return (
    <div className="rsv-field">
      <label htmlFor={id} className="rsv-label">
        {label}
        {required && <span className="rsv-required" aria-hidden="true">*</span>}
      </label>
      <div className="relative">{children}</div>
      {error && (
        <p id={`${id}-error`} className="rsv-error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
