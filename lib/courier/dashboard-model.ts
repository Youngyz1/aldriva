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

export type GreetingTimeOfDay = "morning" | "afternoon" | "evening";

/**
 * Returns "morning", "afternoon", or "evening" based on local time.
 * - morning: 00:00 - 11:59 (hour < 12)
 * - afternoon: 12:00 - 16:59 (hour >= 12 && hour < 17)
 * - evening: 17:00 - 23:59 (hour >= 17)
 */
export function getGreetingTimeOfDay(date: Date = new Date()): GreetingTimeOfDay {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export type CourierWorkerIdentity =
  | {
      preferred_name?: string | null;
      preferredName?: string | null;
      display_name?: string | null;
      displayName?: string | null;
      full_name?: string | null;
      fullName?: string | null;
    }
  | string
  | null
  | undefined;

/**
 * Extracts the authoritative name for the courier.
 * Respects preferred_name / display_name if present; otherwise uses existing full_name.
 */
export function extractCourierName(worker: CourierWorkerIdentity): string | null {
  if (!worker) return null;
  if (typeof worker === "string") {
    const trimmed = worker.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const candidate =
    worker.preferred_name ||
    worker.preferredName ||
    worker.display_name ||
    worker.displayName ||
    worker.full_name ||
    worker.fullName;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

/**
 * Generates personalized time-based greeting for courier:
 * e.g. "Good morning, Ahmed!", "Good afternoon, Maria!", "Good evening, David!"
 * If courier's name is unavailable, falls back gracefully to "Good morning!" etc.
 */
export function formatCourierGreeting(
  courier: CourierWorkerIdentity,
  date: Date = new Date(),
  locale: "en" | "fr" = "en"
): string {
  const time = getGreetingTimeOfDay(date);
  const name = extractCourierName(courier);

  if (locale === "fr") {
    const salutation = time === "evening" ? "Bonsoir" : "Bonjour";
    return name ? `${salutation}, ${name} !` : `${salutation} !`;
  }

  const salutation =
    time === "morning"
      ? "Good morning"
      : time === "afternoon"
      ? "Good afternoon"
      : "Good evening";

  return name ? `${salutation}, ${name}!` : `${salutation}!`;
}

/**
 * Formats business branding for the courier dashboard.
 * - Displays the business name (e.g. "Churchill Grill Delivery").
 * - Does not use the platform name ("Aldriva") as the business name.
 * - If unavailable or platform name passed, falls back to "Your Business".
 */
export function formatCourierBusinessName(
  businessName?: string | null,
  locale: "en" | "fr" = "en"
): string {
  const clean = businessName?.trim();
  if (!clean || /^(aldriva|aldriva delivery|aldriva courier)$/i.test(clean)) {
    return locale === "fr" ? "Votre établissement" : "Your Business";
  }
  if (/delivery$/i.test(clean) || /livraison$/i.test(clean)) {
    return clean;
  }
  return locale === "fr" ? `Livraison ${clean}` : `${clean} Delivery`;
}

