import type { GeoCoordinate, RouteOptions, RouteProvider, RouteResult } from './types';
import { HaversineProvider } from './haversine';

const OSRM_BASE = process.env.OSRM_ROUTING_URL || 'https://router.project-osrm.org';
const DEFAULT_TIMEOUT_MS = 4000;

interface OSRMRouteResponse {
  code: string;
  routes?: Array<{
    distance: number; // meters
    duration: number; // seconds
    geometry?: {
      type: string;
      coordinates: [number, number][]; // [lon, lat]
    };
  }>;
}

export class OSRMProvider implements RouteProvider {
  name = 'osrm';
  private fallback = new HaversineProvider();

  async calculateRoute(
    origin: GeoCoordinate,
    destination: GeoCoordinate,
    options?: RouteOptions
  ): Promise<RouteResult> {
    const geometries = options?.includeGeometry ? 'geojson' : 'false';
    const overview = options?.includeGeometry ? 'full' : 'false';
    // OSRM expects coordinates formatted as: {lon1},{lat1};{lon2},{lat2}
    const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=${overview}&geometries=${geometries}`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Aldriva/1.0 (Delivery Routing)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });

      if (!response.ok) {
        return this.fallback.calculateRoute(origin, destination, options);
      }

      const data: OSRMRouteResponse = await response.json();
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        return this.fallback.calculateRoute(origin, destination, options);
      }

      const primary = data.routes[0];
      const result: RouteResult = {
        distanceMeters: Math.round(primary.distance),
        durationSeconds: Math.round(primary.duration),
        provider: 'osrm',
      };

      if (options?.includeGeometry && primary.geometry?.coordinates) {
        // Convert GeoJSON [lon, lat] to Leaflet-compatible [lat, lon]
        result.geometry = primary.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      }

      return result;
    } catch {
      // Network failure, timeout, or DNS issue -> graceful fallback
      return this.fallback.calculateRoute(origin, destination, options);
    }
  }
}
