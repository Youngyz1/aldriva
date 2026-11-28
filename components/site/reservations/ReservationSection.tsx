"use client";

export interface ReservationSectionProps {
  heading: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * ReservationSection — one form section: heading + optional description +
 * controls. The heading uses the scoped .rsv-section-heading look (20px,
 * uppercase, letter-spaced, with a thin divider below). Reused by the Service
 * and General Booking forms.
 */
export function ReservationSection({ heading, description, className, children }: ReservationSectionProps) {
  return (
    <section className={className}>
      {heading && <h2 className="rsv-section-heading">{heading}</h2>}
      {description && (
        <p className="rsv-section-description">{description}</p>
      )}
      <div className="rsv-section-body">{children}</div>
    </section>
  );
}
