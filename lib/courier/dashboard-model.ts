export const COURIER_FEED_POLL_MS = 15_000;

export type CourierDerivedState = "Offline" | "Available" | "On delivery" | "Offline, delivery in progress";

export function deriveCourierState(isAvailable: boolean, hasActiveOrder: boolean): CourierDerivedState {
  if (hasActiveOrder) return isAvailable ? "On delivery" : "Offline, delivery in progress";
  return isAvailable ? "Available" : "Offline";
}

export function courierNavigationUrls(address: string) {
  const query = encodeURIComponent(address);
  return {
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${query}`,
    waze: `https://waze.com/ul?q=${query}&navigate=yes`,
  };
}

export function formatCourierItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") return String(item);
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "Order item";
    const quantity = typeof row.quantity === "number" && row.quantity > 0 ? row.quantity : 1;
    return `${quantity} × ${name}`;
  });
}
