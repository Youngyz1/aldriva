/**
 * Pure utility functions for invitation card rendering.
 * This file has NO "use client" directive so it can be safely imported
 * from both server-side Route Handlers (card.png) and client components.
 */

/**
 * Format an ISO date string for display on the invitation card.
 */
export function formatEventDateTime(eventDateStr?: string | null): string {
  if (!eventDateStr) return "Date & Time Announced Soon";
  try {
    const d = new Date(eventDateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return eventDateStr;
  }
}

/**
 * Format venue + city into a single display string.
 */
export function formatEventLocation(venue?: string | null, city?: string | null): string {
  return [venue, city].filter(Boolean).join(" · ") || "Venue TBA";
}

/**
 * Build the guest display name including optional title and organisation.
 */
export function formatGuestDisplayName(
  guestName: string,
  guestTitle?: string | null,
  org?: string | null
): string {
  let name = guestTitle ? `${guestTitle} ${guestName}` : guestName;
  if (org) {
    name += ` (${org})`;
  }
  return name;
}

/**
 * Scale down the font size for long strings to prevent overflow.
 * Safe to use in both Satori (route.tsx) and regular React DOM (InvitationCardRenderer).
 */
export function getAdaptiveFontSize(text?: string | null, baseSize: number = 26): number {
  if (!text) return baseSize;
  const len = text.length;
  if (len <= 26) return baseSize;
  if (len <= 38) return Math.max(18, Math.round(baseSize * 0.82));
  if (len <= 52) return Math.max(16, Math.round(baseSize * 0.7));
  return Math.max(14, Math.round(baseSize * 0.6));
}

/**
 * Truncate text to maxChars, appending an ellipsis if needed.
 * Used in Satori (route.tsx) where overflow/maxHeight CSS is NOT supported.
 */
export function truncateText(text?: string | null, maxChars = 80): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1).trim() + "\u2026";
}
