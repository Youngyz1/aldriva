"use client";

import { useEffect, useRef } from "react";

type Props = {
  lat?: number;
  lng?: number;
  onPick: (lat: number, lng: number) => void;
};

export default function LocationPicker({ lat, lng, onPick }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      const defaultLat = lat ?? 40.0583;
      const defaultLng = lng ?? -74.4057;

      const map = L.map(mapRef.current, {
        center: [defaultLat, defaultLng],
        zoom: lat ? 13 : 8,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: "",
        html: `<div style="
          width:32px;height:40px;position:relative;
        ">
          <svg viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 24 16 24S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#f97316"/>
            <circle cx="16" cy="16" r="7" fill="white"/>
          </svg>
        </div>`,
        iconAnchor: [16, 40],
        iconSize: [32, 40],
      });

      // Place marker if lat/lng already set
      if (lat && lng) {
        markerRef.current = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
      }

      // Click to place/move marker
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;

        if (markerRef.current) {
          (markerRef.current as { setLatLng: (latlng: [number, number]) => void }).setLatLng([clickLat, clickLng]);
        } else {
          markerRef.current = L.marker([clickLat, clickLng], { icon: pinIcon }).addTo(map);
        }

        onPick(Math.round(clickLat * 1e6) / 1e6, Math.round(clickLng * 1e6) / 1e6);
      });

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mapRef}
      style={{ width: "100%", height: "340px", cursor: "crosshair" }}
    />
  );
}
