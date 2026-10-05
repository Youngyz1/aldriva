/**
 * types/invitation-template.ts
 *
 * Typed contract for Aldriva Invitation Page Templates (Revision 2).
 * Generic across all event categories (Weddings, Galas, Birthdays, Dinners, Conferences).
 *
 * Every field is categorized into one of three tiers:
 *  1. [REQUIRED]               - The page cannot function without this field.
 *  2. [DEFAULT-WITH-OVERRIDE]  - Aldriva supplies fallback wording; host can override.
 *  3. [HIDE-IF-EMPTY]          - If omitted/empty, the section is completely removed from DOM.
 */

// ── Schedule & Program Item ──────────────────────────────────────────────────
export interface InvitationScheduleItem {
  /** [REQUIRED in item] e.g. "19:00" or "7:00 PM" */
  time: string;
  /** [REQUIRED in item] e.g. "Welcome & Champagne" or "Keynote Address" */
  title: string;
  /** [HIDE-IF-EMPTY] Optional context, e.g. "Main Garden Courtyard" */
  description?: string | null;
  /** [HIDE-IF-EMPTY] Optional category badge, e.g. "Reception" */
  badge?: string | null;
  /** [HIDE-IF-EMPTY] Optional day grouping label, e.g. "Day 1 - Friday" or "Saturday Morning" */
  day?: string | null;
}

// ── Photo Gallery Item ───────────────────────────────────────────────────────
export interface InvitationGalleryItem {
  /** [REQUIRED in item] Secure image URL */
  url: string;
  /** [HIDE-IF-EMPTY] Accessible alt text */
  alt?: string | null;
  /** [HIDE-IF-EMPTY] Optional caption shown on hover and in lightbox */
  caption?: string | null;
  /** [HIDE-IF-EMPTY] Aspect ratio hint ('square' | 'portrait' | 'landscape') */
  aspect?: "square" | "portrait" | "landscape";
  /** [HIDE-IF-EMPTY] Optional width for native image aspect ratio calculation */
  width?: number;
  /** [HIDE-IF-EMPTY] Optional height for native image aspect ratio calculation */
  height?: number;
}

// ── Accommodation / Travel Recommendation ────────────────────────────────────
export interface InvitationAccommodationItem {
  /** [REQUIRED in item] Hotel or lodging name */
  name: string;
  /** [HIDE-IF-EMPTY] Distance, booking discount code, or transit notes */
  notes?: string | null;
  /** [HIDE-IF-EMPTY] Direct booking URL */
  bookingUrl?: string | null;
}

// ── Multi-Venue Item (for events with multiple locations) ─────────────────────
export interface InvitationVenueItem {
  /** [REQUIRED in item] Short label, e.g. "Ceremony", "Reception", "After-Party" */
  label: string;
  /** [REQUIRED in item] Venue name */
  name: string;
  /** [HIDE-IF-EMPTY] Street address */
  address?: string | null;
  /** [HIDE-IF-EMPTY] Latitude for map */
  latitude?: number | null;
  /** [HIDE-IF-EMPTY] Longitude for map */
  longitude?: number | null;
}

// ── Guest Context (Personalization) ──────────────────────────────────────────
export interface InvitationGuestData {
  /** [REQUIRED] Guest full name, e.g. "Dr. Evelyn Montgomery" */
  name: string;
  /** [HIDE-IF-EMPTY] Guest title, e.g. "Senior Trustee" */
  title?: string | null;
  /** [HIDE-IF-EMPTY] Company / Organization name */
  organization?: string | null;
  /** [REQUIRED] Current RSVP status */
  rsvpStatus: "pending" | "accepted" | "declined";
  /** [HIDE-IF-EMPTY] ISO timestamp of RSVP decision */
  rsvpAt?: string | null;
  /** [HIDE-IF-EMPTY] Explicit VIP boolean flag. VIP status is NEVER inferred from title strings. */
  isVip?: boolean;
}

// ── Seating Assignment ───────────────────────────────────────────────────────
export interface InvitationSeatData {
  /** [REQUIRED in seat] Formatted seat label, e.g. "Table 4 · Seat 1" */
  label: string;
  /** [HIDE-IF-EMPTY] Table name/number */
  tableNumber?: string | null;
  tableName?: string | null;
  /** [HIDE-IF-EMPTY] Explicit VIP flag on seat */
  isVip?: boolean;
}

// ── Ticket / QR Pass Instance ────────────────────────────────────────────────
export interface InvitationTicketPassData {
  /** [REQUIRED in pass] Unique QR credential string */
  qrCode: string;
  /** [REQUIRED in pass] Lifecycle status ('valid' | 'used' | 'cancelled') */
  status: string;
  /** [HIDE-IF-EMPTY] Check-in timestamp if already checked in */
  checkedInAt?: string | null;
}

// ── Main Page Data Contract ──────────────────────────────────────────────────
export interface InvitationPageData {
  // ── [REQUIRED] Core Event Identifiers ─────────────────────────────────────
  /** Event title (e.g. "The Solstice Gala", "Elena & David's Wedding"). Rendered with balanced wrapping. */
  title: string;
  /** ISO 8601 start date & time (e.g. "2026-11-14T19:00:00Z") */
  eventDate: string;

  // ── [HIDE-IF-EMPTY] Timezone ──────────────────────────────────────────────
  /** IANA timezone identifier (e.g. "America/Los_Angeles", "Europe/London"). If omitted, local browser time is used. */
  timezone?: string | null;

  // ── [DEFAULT-WITH-OVERRIDE] Hero & Headlines ──────────────────────────────
  /** Eyebrow heading above title. Default: "You're Invited" */
  eyebrow?: string | null;
  /** Subtitle or host marquee (e.g. "Hosted by The Vanguard Foundation"). */
  hostNames?: string | null;
  /** Host-provided hero cover image URL. If omitted, a designed geometric texture is rendered (no stock fallback). */
  heroImage?: string | null;
  /** Focal point percentages {x, y} for hero crop (0-100). Default: { x: 50, y: 50 } */
  heroImageFocus?: { x: number; y: number } | null;
  /** Accessible alt text for hero image */
  heroImageAlt?: string | null;
  /** Scroll prompt text. Default: "Explore Invitation" */
  scrollPrompt?: string | null;

  // ── [DEFAULT-WITH-OVERRIDE] Welcome / Story ───────────────────────────────
  /** Story section headline. Default: "A Message from the Host" */
  storyHeadline?: string | null;
  /** Narrative text or welcome letter */
  storyText?: string | null;
  /** Optional author photo / portrait alongside story */
  storyImage?: string | null;

  // ── [HIDE-IF-EMPTY] Venue & Timing Details ────────────────────────────────
  /** Venue name (e.g. "The Glass Pavilion"). If omitted, venue and map sections are hidden. */
  venue?: string | null;
  /** Physical street address */
  address?: string | null;
  /** City name */
  city?: string | null;
  /** Optional ISO end time */
  endDate?: string | null;
  /** Latitude for map pin */
  latitude?: number | null;
  /** Longitude for map pin */
  longitude?: number | null;
  /** Parking / transit directions */
  parkingNotes?: string | null;
  /**
   * [HIDE-IF-EMPTY] Multiple venues for events with distinct locations (e.g. Ceremony + Reception).
   * When populated, renders a dedicated multi-venue section. Single-venue fields (venue/address/city/latitude/longitude)
   * still work independently — do NOT duplicate content in both.
   */
  venues?: InvitationVenueItem[] | null;

  // ── [HIDE-IF-EMPTY] Schedule / Program ─────────────────────────────────────
  /** Chronological itinerary. If empty/null, timeline section is completely omitted */
  schedule?: InvitationScheduleItem[] | null;

  // ── [HIDE-IF-EMPTY] Photo Gallery ──────────────────────────────────────────
  /** Photo stream. If empty/null, gallery section is completely omitted */
  gallery?: InvitationGalleryItem[] | null;

  // ── [HIDE-IF-EMPTY] Dress Code & Guidelines ───────────────────────────────
  /** e.g. "Black Tie & Evening Gowns" or "Smart Casual" */
  dressCode?: string | null;
  /** Detailed dress code explanation or color palette suggestions */
  dressCodeNotes?: string | null;

  // ── [HIDE-IF-EMPTY] Travel & Accommodation ─────────────────────────────────
  /** Hotel recommendations. If empty/null, accommodation list is omitted */
  accommodations?: InvitationAccommodationItem[] | null;

  // ── [HIDE-IF-EMPTY] Additional Information / FAQ / Gifts ───────────────────
  /** Gift registry note, dietary note, or special instructions */
  additionalNotes?: string | null;

  // ── [HIDE-IF-EMPTY] Background Music ──────────────────────────────────────
  /** Audio stream URL (.mp3 / .m4a). Never autoplays. If omitted, audio pill is hidden */
  musicAudioUrl?: string | null;
  /** Track title or descriptor, e.g. "Chamber Strings — Clair de Lune" */
  musicTitle?: string | null;

  // ── [HIDE-IF-EMPTY] Wedding-Specific Fields ──────────────────────────────
  /** First partner name for wedding invitations (e.g. "Elena") */
  partner1Name?: string | null;
  /** Second partner name for wedding invitations (e.g. "David") */
  partner2Name?: string | null;
  /** Family hosting line (e.g. "Together with their families") */
  familyNote?: string | null;
  /** Wedding ceremony subtype affecting default terminology & sections */
  weddingSubtype?: "traditional" | "civil" | "church" | "engagement" | "vow_renewal" | null;
  /** Wedding color palette swatches with optional names */
  colorsOfTheDay?: { name?: string; hex: string }[] | null;
  /** Gift registry link or note (e.g. "Your presence is our gift. For those who wish to contribute...") */
  registryNote?: string | null;
  /** Alternating story milestones (e.g. "How We Met", "The Proposal") */
  weddingStory?: { title?: string; text: string; image?: string | null }[] | null;

  // ── [HIDE-IF-EMPTY] Birthday-Specific Fields ─────────────────────────────
  /** Celebrant name (e.g. "Maya Rodriguez") */
  celebrantName?: string | null;
  /** Milestone celebration number or text (e.g. "30th", "Turning 40", "Sweet 16") */
  ageMilestone?: string | number | null;
  /** Party theme or vibe (e.g. "Studio 54 Disco", "Neon Tropical", "Y2K Retro") */
  theme?: string | null;
  /** Wish list or gift guidance for guests */
  giftNote?: string | null;

  // ── [HIDE-IF-EMPTY] Social / Hashtag ──────────────────────────────────────
  /** Event hashtag (e.g. "#ElenaAndDavid2026", "#MayaTurns30") */
  hashtag?: string | null;

  // ── [REQUIRED] Guest & Credential Context ─────────────────────────────────
  /** Current viewer guest record */
  guest: InvitationGuestData;
  /** Optional seating assignment */
  seat?: InvitationSeatData | null;
  /** Optional digital ticket instance with QR */
  ticketInstance?: InvitationTicketPassData | null;

  // ── [REQUIRED] Token for Actions ──────────────────────────────────────────
  /** Unique 64-char token for submitting RSVP */
  token: string;
}
