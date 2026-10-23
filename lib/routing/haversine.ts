import type { GeoCoordinate, RouteOptions, RouteProvider, RouteResult } from './types';

const EARTH_RADIUS_METERS = 6371000;
// Average urban speed ~ 25 km/h ≈ 6.94 m/s.
// Urban winding/circuitry factor ~ 1.35x straight-line distance.
const URBAN_WINDING_FACTOR = 1.35;
const URBAN_SPEED_MPS = 6.94;

export function haversineDistanceMeters(a: GeoCoordinate, b: GeoCoordinate): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLon = ((b.longitude - a.longitude) * Math.PI) / 180;

  const sinDeltaLat = Math.sin(deltaLat / 2);
  const sinDeltaLon = Math.sin(deltaLon / 2);

  const inner =
    sinDeltaLat * sinDeltaLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDeltaLon * sinDeltaLon;

  const c = 2 * Math.atan2(Math.sqrt(inner), Math.sqrt(1 - inner));
  return Math.round(EARTH_RADIUS_METERS * c);
}

export class HaversineProvider implements RouteProvider {
  name = 'haversine';

  async calculateRoute(
    origin: GeoCoordinate,
    destination: GeoCoordinate,
    options?: RouteOptions
  ): Promise<RouteResult> {
    const straightDistance = haversineDistanceMeters(origin, destination);
    const estimatedDistance = Math.round(straightDistance * URBAN_WINDING_FACTOR);
    const durationSeconds = Math.max(60, Math.round(estimatedDistance / URBAN_SPEED_MPS));

    const result: RouteResult = {
      distanceMeters: estimatedDistance,
      durationSeconds,
      provider: 'haversine',
    };

    if (options?.includeGeometry) {
      result.geometry = [
        [origin.latitude, origin.longitude],
        [destination.latitude, destination.longitude],
      ];
    }

    return result;
  }
}
