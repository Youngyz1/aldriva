"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  lat: number;
  lng: number;
  title: string;
  venue?: string | null;
  city?: string | null;
};

export default function VenueMap({ lat, lng, title, venue, city }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: "",
        html: `<div style="
          width:40px;height:48px;position:relative;filter:drop-shadow(0 4px 8px rgba(249,115,22,0.5));
        ">
          <svg viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 0C8.954 0 0 8.954 0 20c0 15 20 28 20 28S40 35 40 20C40 8.954 31.046 0 20 0z" fill="#f97316"/>
            <circle cx="20" cy="20" r="8" fill="white"/>
            <text x="20" y="24" text-anchor="middle" font-size="10" fill="#f97316">🎭</text>
          </svg>
        </div>`,
        iconAnchor: [20, 48],
        iconSize: [40, 48],
      });

      L.marker([lat, lng], { icon: pinIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:system-ui;padding:4px;">
            <p style="font-weight:900;font-size:14px;margin:0 0 4px;color:#0f172a;">${title}</p>
            ${venue ? `<p style="font-size:12px;color:#64748b;margin:0;">${venue}${city ? `, ${city}` : ""}</p>` : ""}
            <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}" 
               target="_blank" rel="noreferrer"
               style="display:inline-block;margin-top:8px;font-size:11px;color:#f97316;font-weight:700;">
              Open in Maps ↗
            </a>
          </div>
        `, { maxWidth: 240 })
        .openPopup();

      if (cancelled) {
        map.remove();
        return;
      }

      mapInstanceRef.current = map;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, [lat, lng, title, venue, city]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-zinc-200 shadow-sm" style={{ height: "280px" }}>
      {!mapReady && (
        <div className="absolute inset-0 bg-zinc-100 flex items-center justify-center z-10">
          <div className="w-6 h-6 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      {/* Directions CTA */}
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-3 right-3 z-[999] bg-white shadow-lg border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 hover:bg-orange-50 hover:text-orange-600 transition flex items-center gap-1"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        Get Directions
      </a>
    </div>
  );
}
