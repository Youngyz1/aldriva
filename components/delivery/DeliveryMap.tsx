"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Circle, Polyline } from "leaflet";

export interface DeliveryMapProps {
  courierLocation?: {
    latitude: number;
    longitude: number;
    heading?: number | null;
    accuracy?: number | null;
    isStale?: boolean;
    label?: string;
  } | null;
  destinationLocation?: {
    latitude: number;
    longitude: number;
    label?: string;
  } | null;
  pickupLocation?: {
    latitude: number;
    longitude: number;
    label?: string;
  } | null;
  routeGeometry?: [number, number][];
  height?: string;
  interactive?: boolean;
  className?: string;
}

export default function DeliveryMap({
  courierLocation,
  destinationLocation,
  pickupLocation,
  routeGeometry,
  height = "320px",
  interactive = true,
  className = "",
}: DeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const courierMarkerRef = useRef<Marker | null>(null);
  const accuracyCircleRef = useRef<Circle | null>(null);
  const destinationMarkerRef = useRef<Marker | null>(null);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const polylineRef = useRef<Polyline | null>(null);

  const [isClientReady, setIsClientReady] = useState(false);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    if (!isClientReady || !mapContainerRef.current) return;
    let cancelled = false;

    // Dynamically import Leaflet
    import("leaflet").then((L) => {
      if (cancelled || !mapContainerRef.current) return;

      if (!mapRef.current) {
        // Initial center fallback
        const initialLat =
          courierLocation?.latitude ??
          destinationLocation?.latitude ??
          pickupLocation?.latitude ??
          40.0583;
        const initialLng =
          courierLocation?.longitude ??
          destinationLocation?.longitude ??
          pickupLocation?.longitude ??
          -74.4057;

        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLng],
          zoom: 14,
          zoomControl: interactive,
          dragging: interactive,
          touchZoom: interactive,
          scrollWheelZoom: false,
          attributionControl: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        mapRef.current = map;
      }

      const map = mapRef.current;

      // 1. Destination Marker (Customer)
      if (destinationLocation) {
        const destPos: [number, number] = [
          destinationLocation.latitude,
          destinationLocation.longitude,
        ];
        if (!destinationMarkerRef.current) {
          const destIcon = L.divIcon({
            className: "aldriva-dest-icon",
            html: `
              <div style="
                width: 32px; height: 32px;
                background: #0f172a;
                border: 2.5px solid white;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 4px 10px rgba(15,23,42,0.35);
              ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          destinationMarkerRef.current = L.marker(destPos, { icon: destIcon }).addTo(map);
          if (destinationLocation.label) {
            destinationMarkerRef.current.bindPopup(destinationLocation.label);
          }
        } else {
          destinationMarkerRef.current.setLatLng(destPos);
        }
      } else if (destinationMarkerRef.current) {
        destinationMarkerRef.current.remove();
        destinationMarkerRef.current = null;
      }

      // 2. Pickup Marker (Restaurant)
      if (pickupLocation) {
        const pickupPos: [number, number] = [pickupLocation.latitude, pickupLocation.longitude];
        if (!pickupMarkerRef.current) {
          const pickupIcon = L.divIcon({
            className: "aldriva-pickup-icon",
            html: `
              <div style="
                width: 30px; height: 30px;
                background: #475569;
                border: 2.5px solid white;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 4px 10px rgba(71,85,105,0.3);
              ">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
                  <path d="M3 6h18"></path>
                  <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>
              </div>
            `,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
          pickupMarkerRef.current = L.marker(pickupPos, { icon: pickupIcon }).addTo(map);
          if (pickupLocation.label) {
            pickupMarkerRef.current.bindPopup(pickupLocation.label);
          }
        } else {
          pickupMarkerRef.current.setLatLng(pickupPos);
        }
      } else if (pickupMarkerRef.current) {
        pickupMarkerRef.current.remove();
        pickupMarkerRef.current = null;
      }

      // 3. Courier Marker
      if (courierLocation) {
        const courierPos: [number, number] = [
          courierLocation.latitude,
          courierLocation.longitude,
        ];
        const headingDeg = courierLocation.heading ?? 0;
        const isStale = courierLocation.isStale ?? false;
        const color = isStale ? "#94a3b8" : "#c2410c"; // Brand orange or slate if stale

        const courierIcon = L.divIcon({
          className: "aldriva-courier-icon",
          html: `
            <div style="
              width: 38px; height: 38px;
              background: ${color};
              border: 3px solid white;
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              box-shadow: 0 4px 14px ${isStale ? "rgba(148,163,184,0.4)" : "rgba(194,65,12,0.45)"};
              transition: transform 0.3s ease;
            ">
              <div style="transform: rotate(${headingDeg}deg); display: flex; align-items: center; justify-content: center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="18.5" cy="17.5" r="3.5"></circle>
                  <circle cx="5.5" cy="17.5" r="3.5"></circle>
                  <circle cx="15" cy="5" r="1"></circle>
                  <path d="M12 17.5V14l-3-3 4-3 2 3h2"></path>
                </svg>
              </div>
            </div>
          `,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });

        if (!courierMarkerRef.current) {
          courierMarkerRef.current = L.marker(courierPos, { icon: courierIcon }).addTo(map);
        } else {
          courierMarkerRef.current.setLatLng(courierPos);
          courierMarkerRef.current.setIcon(courierIcon);
        }

        if (courierLocation.label) {
          courierMarkerRef.current.unbindTooltip();
          courierMarkerRef.current.bindTooltip(courierLocation.label, {
            permanent: true,
            direction: "top",
            offset: [0, -20],
            className: "aldriva-map-pill",
          });
        }

        // Accuracy radius
        if (
          courierLocation.accuracy &&
          courierLocation.accuracy > 0 &&
          courierLocation.accuracy <= 300
        ) {
          if (!accuracyCircleRef.current) {
            accuracyCircleRef.current = L.circle(courierPos, {
              radius: courierLocation.accuracy,
              color: isStale ? "#94a3b8" : "#c2410c",
              fillColor: isStale ? "#94a3b8" : "#c2410c",
              fillOpacity: 0.1,
              weight: 1,
            }).addTo(map);
          } else {
            accuracyCircleRef.current.setLatLng(courierPos);
            accuracyCircleRef.current.setRadius(courierLocation.accuracy);
          }
        } else if (accuracyCircleRef.current) {
          accuracyCircleRef.current.remove();
          accuracyCircleRef.current = null;
        }
      } else {
        if (courierMarkerRef.current) {
          courierMarkerRef.current.remove();
          courierMarkerRef.current = null;
        }
        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.remove();
          accuracyCircleRef.current = null;
        }
      }

      // 4. Polyline Route
      if (routeGeometry && routeGeometry.length > 1) {
        if (!polylineRef.current) {
          polylineRef.current = L.polyline(routeGeometry, {
            color: "#c2410c",
            weight: 4,
            opacity: 0.8,
            dashArray: undefined,
          }).addTo(map);
        } else {
          polylineRef.current.setLatLngs(routeGeometry);
        }
      } else if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }

      // 5. Fit bounds
      const points: [number, number][] = [];
      if (courierLocation) points.push([courierLocation.latitude, courierLocation.longitude]);
      if (destinationLocation)
        points.push([destinationLocation.latitude, destinationLocation.longitude]);
      if (pickupLocation && points.length === 0)
        points.push([pickupLocation.latitude, pickupLocation.longitude]);

      if (points.length >= 2) {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } else if (points.length === 1) {
        map.setView(points[0], 15);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    isClientReady,
    courierLocation,
    destinationLocation,
    pickupLocation,
    routeGeometry,
    interactive,
  ]);

  // Cleanup map instance on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className={`relative w-full rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 ${className}`}
      style={{ height }}
    >
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
