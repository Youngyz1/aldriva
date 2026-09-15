"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

type Props = {
  lat?: number | null;
  lng?: number | null;
  title?: string | null;
  venue?: string | null;
  city?: string | null;
  address?: string | null;
};

export default function VenueMap({ lat, lng, venue, city, address }: Props) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Build the most accurate location query for Google Maps
  const queryParts = [venue, address, city].filter(Boolean);
  const locationQuery =
    queryParts.length > 0
      ? queryParts.join(", ")
      : lat && lng
      ? `${lat},${lng}`
      : "";

  if (!locationQuery) return null;

  const encodedQuery = encodeURIComponent(locationQuery);
  const embedUrl = `https://maps.google.com/maps?q=${encodedQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
  const externalMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-sm transition">
      {/* Loading placeholder spinner */}
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-100/90 backdrop-blur-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            Loading Google Maps...
          </div>
        </div>
      )}

      {/* Google Maps Iframe */}
      <iframe
        title="Event Location Map"
        src={embedUrl}
        width="100%"
        height="280"
        style={{ border: 0, display: "block" }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={() => setIsLoaded(true)}
        className="w-full"
      />

      {/* Direct Open in Google Maps Fallback Button */}
      <a
        href={externalMapsUrl}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white/95 px-3 py-1.5 text-xs font-bold text-zinc-800 shadow-md backdrop-blur-xs transition hover:bg-orange-50 hover:text-orange-600"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open in Google Maps
      </a>
    </div>
  );
}
