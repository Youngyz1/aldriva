export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  geometry?: [number, number][]; // Array of [lat, lng] points for Leaflet polyline
  provider: 'osrm' | 'haversine';
}

export interface RouteOptions {
  includeGeometry?: boolean;
}

export interface RouteProvider {
  name: string;
  calculateRoute(
    origin: GeoCoordinate,
    destination: GeoCoordinate,
    options?: RouteOptions
  ): Promise<RouteResult>;
}
