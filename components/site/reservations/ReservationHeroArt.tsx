"use client";

export interface ReservationHeroArtProps {
  variant?: "table" | "navy";
}

/**
 * ReservationHeroArt — inline SVG decorative art rendered as the default
 * hero background when the site has no cover image. aria-hidden, focusable,
 * no external requests. Reused by the Service and General Booking forms.
 *
 * The "table" variant renders the table/placeholder art. The "navy" variant
 * renders a minimal service/booking motif appropriate for appointment-style
 * businesses (salons, clinics, rentals, etc.).
 */
export function ReservationHeroArt({ variant = "table" }: ReservationHeroArtProps) {
  if (variant === "navy") {
    return (
      <svg className="rsv-hero__art rsv-hero__art--navy" viewBox="0 0 680 360" aria-hidden="true" focusable="false" preserveAspectRatio="xMaxYMid slice">
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="120" cy="120" r="95" /><circle cx="120" cy="120" r="70" />
          <path d="M120 25V35M120 205V215M25 120H35M205 120H215" />
          <path d="M120 60Q145 40 170 60M170 60Q145 80 120 100M120 100Q95 120 120 140M120 140Q145 120 170 100" />
          <path d="M560 80C590 110 590 150 560 180M560 80V180" />
          <circle cx="40" cy="320" r="2" /><circle cx="640" cy="40" r="2" /><circle cx="360" cy="300" r="2" /><circle cx="220" cy="60" r="2" />
        </g>
      </svg>
    );
  }
  return (
    <svg className="rsv-hero__art" viewBox="0 0 680 360" aria-hidden="true" focusable="false" preserveAspectRatio="xMaxYMid slice">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="470" cy="200" r="120" /><circle cx="470" cy="200" r="92" /><circle cx="470" cy="200" r="84" />
        <path d="M286 70V130M298 70V130M310 70V130M322 70V130M286 130Q304 152 322 130M304 150V318" />
        <path d="M630 80C664 130 664 190 630 222V318M630 80V222" />
        <path d="M112 70C108 150 192 150 188 70M112 70H188M116 104H184M150 138V258M120 260H180" />
        <path d="M560 36V56M550 46H570M90 300V312M84 306H96M400 40V52M394 46H406" />
        <circle cx="40" cy="120" r="2" /><circle cx="640" cy="320" r="2" /><circle cx="360" cy="330" r="2" /><circle cx="220" cy="40" r="2" />
      </g>
    </svg>
  );
}
