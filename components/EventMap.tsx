"use client";

import { useEffect, useRef, useState } from "react";

type EventPin = {
  id: string;
  slug: string;
  title: string;
  latitude: number | null;
  longitude: number | null;
  event_date: string | null;
  city: string | null;
  banner: string | null;
  category: string | null;
};

type Props = {
  events: EventPin[];
  userLat?: number | null;
  userLng?: number | null;
  height?: string;
};

export default function EventMap({ events, userLat, userLng, height = "420px" }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeEvent, setActiveEvent] = useState<EventPin | null>(null);
  const mapInstanceRef = useRef<unknown>(null);

  const mappableEvents = events.filter((e) => e.latitude && e.longitude);

  useEffect(() => {
    let cancelled = false;

    if (!mapRef.current || mapInstanceRef.current) return;

    // Dynamically import Leaflet (client-side only, CSS loaded via globals.css)
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      // Default center: New Jersey if no user location
      const defaultLat = userLat ?? 40.0583;
      const defaultLng = userLng ?? -74.4057;
      const zoom = userLat ? 11 : 8;

      const map = L.map(mapRef.current, {
        center: [defaultLat, defaultLng],
        zoom,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      // User location marker
      if (userLat && userLng) {
        const userIcon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(59,130,246,0.3);"></div>`,
          iconAnchor: [8, 8],
        });
        L.marker([userLat, userLng], { icon: userIcon })
          .addTo(map)
          .bindPopup("📍 You are here");
      }

      // Event markers
      mappableEvents.forEach((event) => {
        if (!event.latitude || !event.longitude) return;

        const eventIcon = L.divIcon({
          className: "",
          html: `<div style="
            width:36px;height:36px;
            background:linear-gradient(135deg,#f97316,#ea580c);
            border:3px solid white;
            border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            box-shadow:0 4px 12px rgba(249,115,22,0.5);
            cursor:pointer;
          "><div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:14px;">🎭</div></div>`,
          iconAnchor: [18, 36],
          iconSize: [36, 36],
        });

        const marker = L.marker([event.latitude, event.longitude], { icon: eventIcon });
        marker.addTo(map);

        marker.on("click", () => {
          if (cancelled) return;
          setActiveEvent(event);
        });

        const formattedDate = event.event_date
          ? new Date(event.event_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "Date TBA";

        marker.bindPopup(`
          <div style="font-family:system-ui;min-width:200px;">
            ${event.banner ? `<img src="${event.banner}" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-bottom:8px;" />` : ""}
            <p style="font-size:10px;color:#f97316;font-weight:700;text-transform:uppercase;margin:0 0 2px;">${event.category || "Event"} · ${formattedDate}</p>
            <p style="font-size:14px;font-weight:900;margin:0 0 6px;color:#0f172a;">${event.title}</p>
            <p style="font-size:12px;color:#64748b;margin:0 0 8px;">${event.city || ""}</p>
            <a href="/events/${event.slug}" style="display:block;background:#f97316;color:white;text-align:center;padding:6px;border-radius:8px;font-weight:700;font-size:12px;text-decoration:none;">View Event →</a>
          </div>
        `);
      });

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
  }, [userLat, userLng, mappableEvents.length]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-zinc-200 shadow-sm" style={{ height }}>
      {/* Loading state */}
      {!mapReady && (
        <div className="absolute inset-0 bg-zinc-100 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-500 text-sm font-semibold">Loading map...</p>
          </div>
        </div>
      )}

      {/* Map container */}
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

      {/* Active event card */}
      {activeEvent && (
        <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-2xl p-4 z-[999] flex gap-3">
          {activeEvent.banner && (
            <img
              src={activeEvent.banner}
              alt={activeEvent.title}
              className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-orange-500 font-bold uppercase">{activeEvent.category}</p>
            <h3 className="font-black text-zinc-900 truncate">{activeEvent.title}</h3>
            <p className="text-xs text-zinc-500">{activeEvent.city}</p>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <a
              href={`/events/${activeEvent.slug}`}
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
            >
              View
            </a>
            <button
              onClick={() => setActiveEvent(null)}
              className="text-zinc-400 hover:text-zinc-600 text-xs text-center"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* No events with location message */}
      {mapReady && mappableEvents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-6 py-4 text-center shadow-lg">
            <p className="text-2xl mb-2">🗺️</p>
            <p className="font-bold text-zinc-700">No events pinned on the map yet</p>
            <p className="text-sm text-zinc-500 mt-1">Events appear here once organizers add their venue location</p>
          </div>
        </div>
      )}
    </div>
  );
}
