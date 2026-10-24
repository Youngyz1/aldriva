export type CourierGeolocationStatus =
  | "idle"
  | "requesting_permission"
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "acquiring_location"
  | "tracking"
  | "temporarily_disconnected"
  | "stopped"
  | "unsupported_environment";

export function geolocationStatusFromErrorCode(code: number): CourierGeolocationStatus {
  if (code === 1) return "permission_denied";
  if (code === 3) return "timeout";
  if (code === 2) return "position_unavailable";
  return "position_unavailable";
}

export function isCourierLocationTrackableStatus(status: string): boolean {
  return ["accepted", "preparing", "ready", "picked_up", "out_for_delivery"].includes(status);
}

export interface LocationPoint {
  latitude: number;
  longitude: number;
}

export function shouldUploadCourierLocation(
  now: number,
  lastSentAt: number,
  next: LocationPoint,
  previous: LocationPoint | null,
  intervalMs = 12_000,
  distanceThresholdMeters = 25
): boolean {
  if (lastSentAt === 0 || now - lastSentAt >= intervalMs) return true;
  if (!previous) return false;

  const latitudeDelta = ((next.latitude - previous.latitude) * Math.PI) / 180;
  const longitudeDelta = ((next.longitude - previous.longitude) * Math.PI) / 180;
  const latitude1 = (previous.latitude * Math.PI) / 180;
  const latitude2 = (next.latitude * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  const distance = 2 * 6_371_000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return distance >= distanceThresholdMeters;
}
