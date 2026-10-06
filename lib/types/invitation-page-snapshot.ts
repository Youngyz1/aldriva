/**
 * lib/types/invitation-page-snapshot.ts
 *
 * Types for Invitation Page Draft, Published Snapshot, and Runtime Assembly.
 *
 * Doctrine:
 * - `InvitationPageSnapshot` contains ONLY page-content fields.
 * - `events.*` fields (title, date, venue, city, lat/lon) are read live and merged at render time.
 * - Guest PII / passes (guest name, VIP, seat, token, QR) are strictly excluded from snapshot types.
 */

import type {
  InvitationScheduleItem,
  InvitationGalleryItem,
  InvitationVenueItem,
  InvitationAccommodationItem,
  InvitationPageData,
  InvitationGuestData,
  InvitationSeatData,
  InvitationTicketPassData,
} from "@/types/invitation-template";

export type InvitationLocale = "en" | "fr";
export type InvitationPageStatus = "draft" | "published";
export type WeddingSubtype = "traditional" | "civil" | "church" | "engagement" | "vow_renewal";

export interface WeddingStoryItem {
  title?: string;
  text: string;
  image?: string | null;
}

export interface ColorOfTheDayItem {
  name?: string;
  hex: string;
}

/**
 * Immutable page-content snapshot frozen at publish time.
 * Stored in `event_invitation_pages.published_snapshot` (JSONB).
 * NEVER contains guest data or events table live fields.
 */
export interface InvitationPageSnapshot {
  template_id: string;
  locale: InvitationLocale;

  // Overrides & Host Narrative
  display_title?: string | null;
  eyebrow?: string | null;
  host_names?: string | null;
  story_headline?: string | null;
  story_text?: string | null;
  story_image_url?: string | null;

  // Hero Image
  hero_image_url?: string | null;
  hero_image_alt?: string | null;
  hero_image_focus_x?: number;
  hero_image_focus_y?: number;
  scroll_prompt?: string | null;

  // Venue & Timing Overrides
  venue_name?: string | null;
  address?: string | null;
  parking_notes?: string | null;
  timezone: string; // REQUIRED in published snapshot

  // Logistics & Attire
  dress_code?: string | null;
  dress_code_notes?: string | null;
  additional_notes?: string | null;
  hashtag?: string | null;

  // Music
  music_audio_url?: string | null;
  music_title?: string | null;

  // Wedding Fields
  partner1_name?: string | null;
  partner2_name?: string | null;
  family_note?: string | null;
  wedding_subtype?: WeddingSubtype | null;
  registry_note?: string | null;

  // Birthday Fields
  celebrant_name?: string | null;
  age_milestone?: string | null;
  theme?: string | null;
  gift_note?: string | null;

  // JSONB Arrays
  schedule?: InvitationScheduleItem[] | null;
  gallery?: InvitationGalleryItem[] | null;
  venues?: InvitationVenueItem[] | null;
  accommodations?: InvitationAccommodationItem[] | null;
  colors_of_the_day?: ColorOfTheDayItem[] | null;
  wedding_story?: WeddingStoryItem[] | null;
}

/**
 * Full row shape of `event_invitation_pages`.
 */
export interface EventInvitationPageRow {
  id: string;
  event_id: string;
  template_id: string;
  locale: InvitationLocale;
  page_status: InvitationPageStatus;
  published_at: string | null;
  published_snapshot: InvitationPageSnapshot | null;

  display_title: string | null;
  eyebrow: string | null;
  host_names: string | null;
  story_headline: string | null;
  story_text: string | null;
  story_image_url: string | null;

  hero_image_url: string | null;
  hero_image_alt: string | null;
  hero_image_focus_x: number | null;
  hero_image_focus_y: number | null;
  scroll_prompt: string | null;

  venue_name: string | null;
  address: string | null;
  parking_notes: string | null;
  timezone: string | null;

  dress_code: string | null;
  dress_code_notes: string | null;
  additional_notes: string | null;
  hashtag: string | null;

  music_audio_url: string | null;
  music_title: string | null;

  partner1_name: string | null;
  partner2_name: string | null;
  family_note: string | null;
  wedding_subtype: WeddingSubtype | null;
  registry_note: string | null;

  celebrant_name: string | null;
  age_milestone: string | null;
  theme: string | null;
  gift_note: string | null;

  schedule: InvitationScheduleItem[] | null;
  gallery: InvitationGalleryItem[] | null;
  venues: InvitationVenueItem[] | null;
  accommodations: InvitationAccommodationItem[] | null;
  colors_of_the_day: ColorOfTheDayItem[] | null;
  wedding_story: WeddingStoryItem[] | null;

  created_at: string;
  updated_at: string;
}

export interface InvitationPageDraftData {
  draft: EventInvitationPageRow;
  event: EventLiveFields;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
}

/**
 * Live event fields read directly from `events` table at render time.
 */
export interface EventLiveFields {
  id: string;
  title: string;
  slug?: string | null;
  event_date: string;
  end_date?: string | null;
  venue?: string | null;
  street_address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  eventbrite_event_id?: string | null;
  category?: string | null;
}

/**
 * Live guest record.
 */
export interface GuestLiveRecord {
  id?: string;
  guest_name: string;
  guest_title?: string | null;
  organization?: string | null;
  email?: string | null;
  rsvp_status?: "pending" | "accepted" | "declined" | null;
  rsvp_at?: string | null;
  token?: string | null;
  is_vip?: boolean;
}

export interface TicketInstanceLiveRecord {
  id?: string;
  qr_code?: string | null;
  status?: string | null;
  checked_in_at?: string | null;
  seat_id?: string | null;
}

export interface SeatLiveRecord {
  id?: string;
  section?: string | null;
  row_label?: string | null;
  seat_number?: string | null;
  table_number?: string | null;
  table_name?: string | null;
  is_vip?: boolean;
}

/**
 * Assembles the full InvitationPageData contract from the snapshot and live layers.
 */
export function assembleInvitationPageData(
  snapshot: InvitationPageSnapshot,
  event: EventLiveFields,
  guest?: GuestLiveRecord | null,
  ticketInstance?: TicketInstanceLiveRecord | null,
  seat?: SeatLiveRecord | null
): InvitationPageData {
  const effectiveTitle = snapshot.display_title?.trim() || event.title;
  const effectiveVenue = snapshot.venue_name?.trim() || event.venue || "";
  const effectiveAddress = snapshot.address?.trim() || event.street_address || undefined;

  const guestData: InvitationGuestData = guest
    ? {
        name: guest.guest_name,
        title: guest.guest_title ?? undefined,
        organization: guest.organization ?? undefined,
        rsvpStatus: guest.rsvp_status ?? "pending",
        rsvpAt: guest.rsvp_at ?? undefined,
        isVip: Boolean(guest.is_vip || seat?.is_vip),
      }
    : {
        name: "Honored Guest",
        rsvpStatus: "pending",
        isVip: false,
      };

  let seatData: InvitationSeatData | undefined;
  if (seat) {
    const seatLabelParts = [
      seat.table_number || seat.table_name,
      seat.row_label ? `Row ${seat.row_label}` : null,
      seat.seat_number ? `Seat ${seat.seat_number}` : null,
    ].filter(Boolean);

    seatData = {
      label: seatLabelParts.join(" · ") || "Assigned Seating",
      tableNumber: seat.table_number ?? undefined,
      tableName: seat.table_name ?? undefined,
      isVip: seat.is_vip,
    };
  }

  let passData: InvitationTicketPassData | undefined;
  if (ticketInstance && ticketInstance.qr_code) {
    passData = {
      qrCode: ticketInstance.qr_code,
      status: ticketInstance.status || "valid",
      checkedInAt: ticketInstance.checked_in_at ?? undefined,
    };
  }

  return {
    locale: snapshot.locale || "en",
    title: effectiveTitle,
    eventDate: event.event_date,
    endDate: event.end_date ?? undefined,
    venue: effectiveVenue,
    city: event.city ?? undefined,
    address: effectiveAddress,
    latitude: event.latitude ?? undefined,
    longitude: event.longitude ?? undefined,
    timezone: snapshot.timezone || undefined,

    eyebrow: snapshot.eyebrow ?? undefined,
    hostNames: snapshot.host_names ?? undefined,
    storyHeadline: snapshot.story_headline ?? undefined,
    storyText: snapshot.story_text ?? undefined,
    storyImage: snapshot.story_image_url ?? undefined,

    heroImage: snapshot.hero_image_url ?? undefined,
    heroImageAlt: snapshot.hero_image_alt ?? undefined,
    heroImageFocus:
      typeof snapshot.hero_image_focus_x === "number" && typeof snapshot.hero_image_focus_y === "number"
        ? { x: snapshot.hero_image_focus_x, y: snapshot.hero_image_focus_y }
        : undefined,
    scrollPrompt: snapshot.scroll_prompt ?? undefined,

    parkingNotes: snapshot.parking_notes ?? undefined,
    dressCode: snapshot.dress_code ?? undefined,
    dressCodeNotes: snapshot.dress_code_notes ?? undefined,
    additionalNotes: snapshot.additional_notes ?? undefined,
    hashtag: snapshot.hashtag ?? undefined,

    musicAudioUrl: snapshot.music_audio_url ?? undefined,
    musicTitle: snapshot.music_title ?? undefined,

    partner1Name: snapshot.partner1_name ?? undefined,
    partner2Name: snapshot.partner2_name ?? undefined,
    familyNote: snapshot.family_note ?? undefined,
    weddingSubtype: snapshot.wedding_subtype ?? undefined,
    registryNote: snapshot.registry_note ?? undefined,

    celebrantName: snapshot.celebrant_name ?? undefined,
    ageMilestone: snapshot.age_milestone ?? undefined,
    theme: snapshot.theme ?? undefined,
    giftNote: snapshot.gift_note ?? undefined,

    schedule: snapshot.schedule ?? undefined,
    gallery: snapshot.gallery ?? undefined,
    venues: snapshot.venues ?? undefined,
    accommodations: snapshot.accommodations ?? undefined,
    colorsOfTheDay: snapshot.colors_of_the_day ?? undefined,
    weddingStory: snapshot.wedding_story ?? undefined,

    guest: guestData,
    seat: seatData,
    ticketInstance: passData,
    token: guest?.token || "preview-sample-token",
  };
}
