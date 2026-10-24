"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Circle, Map as LeafletMap, Marker, Polyline, TileLayer } from "leaflet";

type MapLocation = {
  latitude: number;
  longitude: number;
  label?: string;
};

export interface DeliveryMapProps {
  courierLocation?: (MapLocation & {
    heading?: number | null;
    accuracy?: number | null;
    isStale?: boolean;
  }) | null;
  destinationLocation?: MapLocation | null;
  pickupLocation?: MapLocation | null;
  routeGeometry?: [number, number][];
  height?: string;
  interactive?: boolean;
  className?: string;
  showFollowControls?: boolean;
  language?: "en" | "fr";
  journeyStage?: "pickup" | "delivery";
}

type MapState = "loading" | "ready" | "unavailable";
type LatLng = [number, number];

function isValidLocation(location: MapLocation | null | undefined): location is MapLocation {
  return Boolean(
    location &&
      Number.isFinite(location.latitude) &&
      location.latitude >= -90 &&
      location.latitude <= 90 &&
      Number.isFinite(location.longitude) &&
      location.longitude >= -180 &&
      location.longitude <= 180
  );
}

function isValidLatLng(point: LatLng): boolean {
  return (
    Number.isFinite(point[0]) &&
    point[0] >= -90 &&
    point[0] <= 90 &&
    Number.isFinite(point[1]) &&
    point[1] >= -180 &&
    point[1] <= 180
  );
}

function mapLabelElement(label: string): HTMLElement {
  const element = document.createElement("span");
  element.textContent = label;
  return element;
}

const COPY = {
  en: {
    mapLabel: "Delivery map",
    loading: "Loading map tiles…",
    unavailable: "TomTom map tiles could not load. Check the key's Map Display API access, domain restrictions, network, and usage limits. The rider marker still shows the latest shared position.",
    missingMapKey: "TomTom map tiles are not configured. Set NEXT_PUBLIC_TOMTOM_API_KEY for this environment and rebuild.",
    mapError: "The map could not be initialized. The rider marker is unavailable on this map.",
    noCoordinates: "A map cannot be shown because no valid location coordinates are available yet.",
    missingStop: "The active pickup/delivery stop has no saved coordinates, so its pin is not shown.",
    retry: "Retry map",
    follow: "Follow rider",
    stopFollowing: "Stop following",
    recenter: "Recenter on rider",
  },
  fr: {
    mapLabel: "Carte de livraison",
    loading: "Chargement des tuiles…",
    unavailable: "Les tuiles TomTom ne se sont pas chargées. Vérifiez l’accès Map Display API de la clé, ses restrictions de domaine, le réseau et les limites d’utilisation. Le repère indique toujours la dernière position partagée.",
    missingMapKey: "Les tuiles TomTom ne sont pas configurées. Définissez NEXT_PUBLIC_TOMTOM_API_KEY pour cet environnement puis reconstruisez l’application.",
    mapError: "La carte n’a pas pu être initialisée. Le repère du livreur n’est pas disponible sur cette carte.",
    noCoordinates: "La carte ne peut pas s’afficher car aucune coordonnée valide n’est disponible.",
    missingStop: "L’étape active n’a pas de coordonnées enregistrées ; son repère n’est pas affiché.",
    retry: "Réessayer la carte",
    follow: "Suivre le livreur",
    stopFollowing: "Arrêter le suivi",
    recenter: "Recentrer sur le livreur",
  },
} as const;

export default function DeliveryMap({
  courierLocation,
  destinationLocation,
  pickupLocation,
  routeGeometry,
  height = "clamp(200px, 34vh, 380px)",
  interactive = true,
  className = "",
  showFollowControls = false,
  language = "en",
  journeyStage = "delivery",
}: DeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileLayerRef = useRef<TileLayer | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const courierMarkerRef = useRef<Marker | null>(null);
  const accuracyCircleRef = useRef<Circle | null>(null);
  const destinationMarkerRef = useRef<Marker | null>(null);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const polylineRef = useRef<Polyline | null>(null);
  const initialCenterRef = useRef<LatLng | null>(null);
  const initialViewSetRef = useRef(false);
  const lastCourierPositionRef = useRef<LatLng | null>(null);
  const currentCourierPositionRef = useRef<LatLng | null>(null);
  const followingRef = useRef(showFollowControls);
  const resetTileCountsRef = useRef<(() => void) | null>(null);

  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [mapState, setMapState] = useState<MapState>("loading");
  const [mapFailure, setMapFailure] = useState<"tiles" | "initialization" | "configuration">("tiles");
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const [isFollowing, setIsFollowing] = useState(showFollowControls);
  const copy = COPY[language];
  const tomtomApiKey = process.env.NEXT_PUBLIC_TOMTOM_API_KEY?.trim();

  const validCourier = isValidLocation(courierLocation) ? courierLocation : null;
  const validDestination = isValidLocation(destinationLocation) ? destinationLocation : null;
  const validPickup = isValidLocation(pickupLocation) ? pickupLocation : null;
  const activeStop = journeyStage === "pickup" ? validPickup : validDestination;
  const validRoute = useMemo(() => (routeGeometry ?? []).filter(isValidLatLng), [routeGeometry]);
  const hasMapPoint = Boolean(validCourier || activeStop || validRoute.length);

  useEffect(() => {
    currentCourierPositionRef.current = validCourier
      ? [validCourier.latitude, validCourier.longitude]
      : null;
    if (!mapRef.current) {
      const initialLocation = validCourier ?? activeStop;
      initialCenterRef.current = initialLocation
        ? [initialLocation.latitude, initialLocation.longitude]
        : validRoute[0] ?? null;
    }
  }, [
    validCourier,
    activeStop,
    validRoute,
  ]);

  const setFollowMode = useCallback((following: boolean) => {
    followingRef.current = following;
    setIsFollowing(following);
  }, []);

  const recenterOnCourier = useCallback(() => {
    const position = currentCourierPositionRef.current;
    const map = mapRef.current;
    if (!position || !map) return;

    setFollowMode(true);
    map.setView(position, Math.max(map.getZoom(), 15), { animate: true });
  }, [setFollowMode]);

  const retryMap = useCallback(() => {
    setMapFailure("tiles");
    if (tileLayerRef.current) {
      resetTileCountsRef.current?.();
      setMapState("loading");
      tileLayerRef.current.redraw();
      return;
    }

    setMapState("loading");
    setInitializationAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!hasMapPoint || !container || mapRef.current) return;

    let cancelled = false;
    let createdMap: LeafletMap | null = null;
    let tileLayer: TileLayer | null = null;
    let loadTimer: number | null = null;
    let resizeFrame: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let removeResizeListeners: (() => void) | null = null;
    let removeTileListeners: (() => void) | null = null;

    setMapState("loading");

    void import("leaflet")
      .then((L) => {
        const center = currentCourierPositionRef.current ?? initialCenterRef.current;
        if (cancelled || !container || !center) return;

        const map = L.map(container, {
          center,
          zoom: 15,
          zoomControl: interactive,
          dragging: interactive,
          touchZoom: interactive,
          scrollWheelZoom: false,
          attributionControl: true,
        });
        createdMap = map;
        mapRef.current = map;
        mapInstanceRef.current = map;

        let successfullyLoadedTiles = 0;
        let failedTiles = 0;
        const clearLoadTimer = () => {
          if (loadTimer !== null) {
            window.clearTimeout(loadTimer);
            loadTimer = null;
          }
        };
        const onTileLoad = () => {
          successfullyLoadedTiles += 1;
          clearLoadTimer();
          setMapState("ready");
        };
        const onTileError = () => {
          failedTiles += 1;
        };
        const onTileBatchLoad = () => {
          clearLoadTimer();
          if (successfullyLoadedTiles === 0 && failedTiles > 0) {
            setMapFailure("tiles");
            setMapState("unavailable");
          }
        };

        if (tomtomApiKey) {
          const tiles = L.tileLayer(
            `https://api.tomtom.com/maps/orbis/display/raster/tile/{z}/{x}/{y}?apiVersion=2&style=street-light&tileSize=256&key=${encodeURIComponent(tomtomApiKey)}`,
            {
              attribution:
                '© <a href="https://www.tomtom.com/legal/en_gb/product-attributions/">TomTom</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
              minZoom: 0,
              maxZoom: 22,
              tileSize: 256,
            }
          );
          tileLayer = tiles;
          tileLayerRef.current = tiles;
          tiles.on("tileload", onTileLoad);
          tiles.on("tileerror", onTileError);
          tiles.on("load", onTileBatchLoad);
          tiles.addTo(map);
          removeTileListeners = () => {
            tiles.off("tileload", onTileLoad);
            tiles.off("tileerror", onTileError);
            tiles.off("load", onTileBatchLoad);
          };

          resetTileCountsRef.current = () => {
            successfullyLoadedTiles = 0;
            failedTiles = 0;
          };
          loadTimer = window.setTimeout(() => {
            if (successfullyLoadedTiles === 0) {
              setMapFailure("tiles");
              setMapState("unavailable");
            }
          }, 12000);
        } else {
          setMapFailure("configuration");
          setMapState("unavailable");
        }

        const onMapDragStart = () => setFollowMode(false);
        map.on("dragstart", onMapDragStart);

        const invalidateSize = () => {
          if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
          resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = null;
            if (!cancelled && mapRef.current === map) map.invalidateSize({ pan: false });
          });
        };
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(invalidateSize);
          resizeObserver.observe(container);
          if (container.parentElement) resizeObserver.observe(container.parentElement);
        }
        window.addEventListener("resize", invalidateSize);
        window.addEventListener("orientationchange", invalidateSize);
        removeResizeListeners = () => {
          window.removeEventListener("resize", invalidateSize);
          window.removeEventListener("orientationchange", invalidateSize);
          resizeObserver?.disconnect();
          if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
        };

        setMapInstance(map);
        invalidateSize();
      })
      .catch(() => {
        if (!cancelled) {
          setMapFailure("initialization");
          setMapState("unavailable");
        }
      });

    return () => {
      cancelled = true;
      if (loadTimer !== null) window.clearTimeout(loadTimer);
      removeTileListeners?.();
      removeResizeListeners?.();
      if (createdMap) {
        createdMap.off("dragstart");
        createdMap.remove();
        if (mapRef.current === createdMap) mapRef.current = null;
        if (mapInstanceRef.current === createdMap) mapInstanceRef.current = null;
      }
      if (tileLayerRef.current === tileLayer) tileLayerRef.current = null;
      resetTileCountsRef.current = null;
      initialViewSetRef.current = false;
      lastCourierPositionRef.current = null;
    };
  }, [hasMapPoint, initializationAttempt, interactive, setFollowMode, tomtomApiKey]);

  useEffect(() => {
    const map = mapInstance;
    if (!map || mapInstanceRef.current !== map) return;
    let cancelled = false;

    void import("leaflet").then((L) => {
      if (cancelled || mapInstanceRef.current !== map) return;

      const courierPoint: LatLng | null = validCourier
        ? [validCourier.latitude, validCourier.longitude]
        : null;
      const destinationPoint: LatLng | null = journeyStage === "delivery" && validDestination
        ? [validDestination.latitude, validDestination.longitude]
        : null;
      const pickupPoint: LatLng | null = journeyStage === "pickup" && validPickup
        ? [validPickup.latitude, validPickup.longitude]
        : null;

      if (destinationPoint) {
        if (!destinationMarkerRef.current) {
          const icon = L.divIcon({
            className: "aldriva-dest-icon",
            html: '<span aria-hidden="true" style="display:block;width:30px;height:30px;border:3px solid white;border-radius:50%;background:#18181b;box-shadow:0 2px 8px #0006"></span>',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
          destinationMarkerRef.current = L.marker(destinationPoint, { icon }).addTo(map);
        } else {
          destinationMarkerRef.current.setLatLng(destinationPoint);
        }
        if (validDestination?.label) destinationMarkerRef.current.bindPopup(mapLabelElement(validDestination.label));
        else destinationMarkerRef.current.unbindPopup();
      } else if (destinationMarkerRef.current) {
        destinationMarkerRef.current.remove();
        destinationMarkerRef.current = null;
      }

      if (pickupPoint) {
        if (!pickupMarkerRef.current) {
          const icon = L.divIcon({
            className: "aldriva-pickup-icon",
            html: '<span aria-hidden="true" style="display:block;width:28px;height:28px;border:3px solid white;border-radius:50%;background:#52525b;box-shadow:0 2px 8px #0005"></span>',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          pickupMarkerRef.current = L.marker(pickupPoint, { icon }).addTo(map);
        } else {
          pickupMarkerRef.current.setLatLng(pickupPoint);
        }
        if (validPickup?.label) pickupMarkerRef.current.bindPopup(mapLabelElement(validPickup.label));
        else pickupMarkerRef.current.unbindPopup();
      } else if (pickupMarkerRef.current) {
        pickupMarkerRef.current.remove();
        pickupMarkerRef.current = null;
      }

      if (courierPoint && validCourier) {
        const heading = Number.isFinite(validCourier.heading) ? validCourier.heading ?? 0 : 0;
        const stale = validCourier.isStale ?? false;
        const color = stale ? "#71717a" : "#c2410c";
        const icon = L.divIcon({
          className: "aldriva-courier-icon",
          html: `<span aria-hidden="true" style="display:block;width:36px;height:36px;border:3px solid white;border-radius:50%;background:${color};box-shadow:0 2px 10px ${stale ? "#71717a66" : "#c2410c77"};transform:rotate(${heading}deg)"><svg style="display:block;margin:7px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19 7-7-7-7-7 7 7 7Z"/><path d="M12 12V2"/></svg></span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        if (!courierMarkerRef.current) {
          courierMarkerRef.current = L.marker(courierPoint, { icon }).addTo(map);
        } else {
          courierMarkerRef.current.setLatLng(courierPoint);
          courierMarkerRef.current.setIcon(icon);
        }
        if (validCourier.label) {
          courierMarkerRef.current.unbindTooltip();
          courierMarkerRef.current.bindTooltip(mapLabelElement(validCourier.label), {
            permanent: true,
            direction: "top",
            offset: [0, -18],
            className: "aldriva-map-pill",
          });
        }

        const accuracy = validCourier.accuracy;
        if (typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > 0 && accuracy <= 300) {
          if (!accuracyCircleRef.current) {
            accuracyCircleRef.current = L.circle(courierPoint, {
              radius: accuracy,
              color,
              fillColor: color,
              fillOpacity: 0.1,
              weight: 1,
            }).addTo(map);
          } else {
            accuracyCircleRef.current.setLatLng(courierPoint);
            accuracyCircleRef.current.setRadius(accuracy);
          }
        } else if (accuracyCircleRef.current) {
          accuracyCircleRef.current.remove();
          accuracyCircleRef.current = null;
        }

        const previous = lastCourierPositionRef.current;
        const moved = !previous || previous[0] !== courierPoint[0] || previous[1] !== courierPoint[1];
        if (moved && followingRef.current) {
          map.panTo(courierPoint, { animate: true, duration: 0.35 });
        }
        lastCourierPositionRef.current = courierPoint;
      } else {
        lastCourierPositionRef.current = null;
        if (courierMarkerRef.current) {
          courierMarkerRef.current.remove();
          courierMarkerRef.current = null;
        }
        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.remove();
          accuracyCircleRef.current = null;
        }
      }

      const validRoutePoints = validRoute;
      if (validRoutePoints.length > 1) {
        if (!polylineRef.current) {
          polylineRef.current = L.polyline(validRoutePoints, {
            color: "#c2410c",
            weight: 4,
            opacity: 0.85,
          }).addTo(map);
        } else {
          polylineRef.current.setLatLngs(validRoutePoints);
        }
      } else if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }

      if (!initialViewSetRef.current) {
        const points = [courierPoint, pickupPoint, destinationPoint].filter(
          (point): point is LatLng => point !== null
        );
        if (points.length > 1) {
          map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 16 });
        } else if (points.length === 1) {
          map.setView(points[0], 15);
        } else if (validRoutePoints.length) {
          map.fitBounds(L.latLngBounds(validRoutePoints), { padding: [36, 36], maxZoom: 16 });
        }
        initialViewSetRef.current = true;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mapInstance, validCourier, validDestination, validPickup, validRoute, isFollowing, journeyStage]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  const toggleFollowMode = () => {
    const next = !followingRef.current;
    setFollowMode(next);
    if (next) recenterOnCourier();
  };

  return (
    <div
      className={`relative w-full min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
      style={{ height, minHeight: "160px" }}
      role="region"
      aria-label={copy.mapLabel}
    >
      {hasMapPoint ? (
        <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-zinc-700 dark:text-zinc-300">
          <p role="status">{copy.noCoordinates}</p>
        </div>
      )}

      {hasMapPoint && mapState !== "ready" && (
        <div
          className={`absolute inset-x-3 top-3 z-[1200] flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs shadow-xs ${
            mapState === "unavailable"
              ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
              : "border-zinc-200 bg-white/95 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200"
          }`}
          role={mapState === "unavailable" ? "alert" : "status"}
          aria-live="polite"
        >
          <span>
            {mapState === "unavailable"
              ? mapFailure === "initialization"
                ? copy.mapError
                : mapFailure === "configuration"
                  ? copy.missingMapKey
                  : copy.unavailable
              : copy.loading}
          </span>
          {mapState === "unavailable" && mapFailure !== "configuration" && (
            <button
              type="button"
              onClick={retryMap}
              className="shrink-0 rounded-md border border-current px-2.5 py-1 font-semibold hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 dark:hover:bg-white/10"
            >
              {copy.retry}
            </button>
          )}
        </div>
      )}

      {hasMapPoint && showFollowControls && validCourier && (
        <div className="absolute bottom-8 right-3 z-[1100] flex flex-col gap-2">
          <button
            type="button"
            onClick={toggleFollowMode}
            aria-pressed={isFollowing}
            className="rounded-lg border border-zinc-300 bg-white/95 px-3 py-2 text-xs font-semibold text-zinc-900 shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100"
          >
            {isFollowing ? copy.stopFollowing : copy.follow}
          </button>
          <button
            type="button"
            onClick={recenterOnCourier}
            className="rounded-lg border border-zinc-300 bg-white/95 px-3 py-2 text-xs font-semibold text-zinc-900 shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100"
          >
            {copy.recenter}
          </button>
        </div>
      )}

      {hasMapPoint && validCourier && !activeStop && (
        <p
          className="absolute bottom-8 left-3 z-[1100] max-w-[min(70%,28rem)] rounded-md border border-zinc-200 bg-white/95 px-2.5 py-1.5 text-[10px] leading-4 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200"
          role="status"
        >
          {copy.missingStop}
        </p>
      )}
    </div>
  );
}
