"use client";

import { ReservationHeroArt } from "./ReservationHeroArt";

export interface ReservationHeaderProps {
  businessName?: string;
  title: string;
  coverImageUrl: string | null;
  heroVariant?: "table" | "navy";
}

/**
 * ReservationHeader — full-bleed hero band above the reservation form.
 * Escapes the .rsv-inner width constraint via margin-inline: calc(50% - 50vw)
 * (defined in reservations.css) so the band spans the full viewport width.
 *
 * Content is bottom-left aligned within the form container's padding via
 * .rsv-inner. When coverImageUrl exists, shows the image covering the band
 * with a dark linear-gradient overlay (0.25 top to 0.75 bottom) so white text
 * is readable on any photo. When no image, shows ReservationHeroArt on the
 * right side over the gradient base.
 *
 * Renders eyebrow (business name) and title only — the subtitle/tagline is
 * intentionally omitted from the hero. Nothing business-specific is
 * hardcoded. Reused by the Service and General Booking forms.
 */
export function ReservationHeader({ businessName, title, coverImageUrl, heroVariant = "table" }: ReservationHeaderProps) {
  return (
    <div className="rsv-hero relative w-full">
      {/* Gradient base — always present */}
      <div className="rsv-hero__band absolute inset-0" />

      {coverImageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverImageUrl} alt="" className="rsv-hero__image absolute inset-0 w-full h-full object-cover" />
          <div className="rsv-hero__overlay absolute inset-0" />
        </>
      ) : (
        <ReservationHeroArt variant={heroVariant} />
      )}

      <div className="rsv-hero__content rsv-inner">
        {businessName && (
          <p className="rsv-hero__eyebrow">{businessName}</p>
        )}
        <h1 className="rsv-hero__title">{title}</h1>
      </div>
    </div>
  );
}
