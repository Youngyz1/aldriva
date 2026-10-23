import type { InvitationVenueItem } from "@/types/invitation-template";

/** Uses an organizer HTTPS map URL, otherwise a URL-encoded Maps search by venue and address. */
export function evergreenMapUrl(venue: Pick<InvitationVenueItem, "name" | "address" | "mapUrl">): string | null {
  const explicit = venue.mapUrl?.trim();
  if (explicit) {
    try {
      if (new URL(explicit).protocol === "https:") return explicit;
    } catch {
      // Invalid optional URLs can still fall back to a usable address search.
    }
  }
  const address = venue.address?.trim();
  if (!address) return null;
  const query = [venue.name?.trim(), address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
