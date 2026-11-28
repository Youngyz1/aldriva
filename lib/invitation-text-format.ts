/**
 * lib/invitation-text-format.ts
 *
 * Helpers for formatting text, dates, times, and location labels across
 * invitation templates.
 */

/**
 * Normalizes time strings (e.g. "12", "16:00", "12:51 PM", "12:51 PM GMT", ISO strings)
 * into a single consistent, locale-appropriate representation.
 * - French: 24-hour format (e.g. "12:00", "16:00", "12:51")
 * - English: 12-hour format with AM/PM (e.g. "12:00 PM", "4:00 PM", "12:51 PM")
 */
export function formatInvitationTime(
  timeStr: string | null | undefined,
  locale: "en" | "fr" = "en"
): string | null {
  if (!timeStr) return null;
  const trimmed = timeStr.trim();
  if (!trimmed) return null;

  // 1. ISO timestamp or date-time string (e.g. 2027-10-16T18:00:00Z)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }

  // 2. Hour-only numeric (e.g. "12", "16", "9")
  const hourOnlyMatch = trimmed.match(/^(\d{1,2})$/);
  if (hourOnlyMatch) {
    const hour = parseInt(hourOnlyMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      if (locale === "fr") {
        return `${String(hour).padStart(2, "0")}:00`;
      }
      const period = hour >= 12 ? "PM" : "AM";
      const h12 = hour % 12 || 12;
      return `${h12}:00 ${period}`;
    }
  }

  // 3. "HH:MM" (24h or 12h without AM/PM)
  const hmMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    const hour = parseInt(hmMatch[1], 10);
    const minute = hmMatch[2];
    if (hour >= 0 && hour <= 23) {
      if (locale === "fr") {
        return `${String(hour).padStart(2, "0")}:${minute}`;
      }
      const period = hour >= 12 ? "PM" : "AM";
      const h12 = hour % 12 || 12;
      return `${h12}:${minute} ${period}`;
    }
  }

  // 4. Time with AM/PM (e.g. "12:51 PM", "2:00 pm", "12:51 PM GMT")
  const ampmMatch = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s+([A-Za-z]+))?$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = ampmMatch[2] || "00";
    const isPm = ampmMatch[3].toLowerCase() === "pm";
    const tzSuffix = ampmMatch[4] ? ` ${ampmMatch[4]}` : "";
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;

    if (locale === "fr") {
      return `${String(hour).padStart(2, "0")}:${minute}${tzSuffix}`;
    }
    const h12 = hour % 12 || 12;
    const period = hour >= 12 ? "PM" : "AM";
    return `${h12}:${minute} ${period}${tzSuffix}`;
  }

  // 5. French "HHh" or "HHhMM" (e.g. "16h", "16h00")
  const frMatch = trimmed.match(/^(\d{1,2})h(\d{2})?$/i);
  if (frMatch) {
    const hour = parseInt(frMatch[1], 10);
    const minute = frMatch[2] || "00";
    if (hour >= 0 && hour <= 23) {
      if (locale === "fr") {
        return `${String(hour).padStart(2, "0")}:${minute}`;
      }
      const period = hour >= 12 ? "PM" : "AM";
      const h12 = hour % 12 || 12;
      return `${h12}:${minute} ${period}`;
    }
  }

  // Fallback
  return trimmed;
}

/**
 * Returns true if a string looks like an address that should not be printed as text,
 * such as a URL (Google Maps, etc.) or a raw coordinate.
 */
export function isMapUrlOrCoordinate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.includes("maps.google.com") ||
    trimmed.includes("google.com/maps") ||
    /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(trimmed)
  );
}

/**
 * Builds a Google Maps search URL from a venue address, name, or coordinates.
 * Returns null if no address or coordinates exist, so the venue name is rendered
 * as plain text without a dead link.
 */
export function buildVenueMapUrl(
  address: string | null | undefined,
  name?: string | null | undefined,
  coords?: { lat?: number | null; lng?: number | null } | null
): string | null {
  const trimmedAddress = address?.trim() || "";
  const trimmedName = name?.trim() || "";
  const lat = coords?.lat;
  const lng = coords?.lng;

  // 1. If address is already a map or http(s) URL
  if (/^https?:\/\//i.test(trimmedAddress)) {
    return trimmedAddress;
  }

  // 2. If valid coordinates are provided
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  // 3. If plain text address exists
  if (trimmedAddress) {
    const query = trimmedName && !trimmedAddress.toLowerCase().includes(trimmedName.toLowerCase())
      ? `${trimmedName}, ${trimmedAddress}`
      : trimmedAddress;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  return null;
}

