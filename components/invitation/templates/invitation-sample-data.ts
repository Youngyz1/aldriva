/**
 * components/invitation/templates/invitation-sample-data.ts
 *
 * Comprehensive sample datasets for testing Invitation Template 1.
 * Supports testing:
 *  - Full Content
 *  - Minimal Content (Hide-if-Empty)
 *  - VIP Guest View
 *  - Portrait Photo Hero
 *  - Landscape Photo Hero
 *  - Very Bright Photo (testing text contrast & readability)
 *  - Very Dark Photo (testing borders and low-key accents)
 *  - Low-Res / Small Photo
 *  - No Hero Image (designed geometric & ornamental fallback, zero stock photos)
 *  - Long Title (80+ characters)
 *  - 1 Gallery Image
 *  - 12 Gallery Images
 *
 * IMPORTANT: All event dates are hardcoded ISO strings — never Date.now() + offset.
 * This prevents countdown timers from showing different values on each reload.
 */

import { InvitationPageData, InvitationGalleryItem } from "@/types/invitation-template";

export const FULL_INVITATION_SAMPLE_DATA: InvitationPageData = {
  title: "The Solstice Gala & Charity Soirée",
  eventDate: "2026-12-06T19:00:00-08:00",
  endDate: "2026-12-07T01:00:00-08:00",
  timezone: "America/Los_Angeles",
  eyebrow: "An Exclusive Evening Celebration",
  hostNames: "Hosted by The Vanguard Foundation & Cultural Arts Guild",
  heroImage:
    "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=1200&auto=format&fit=crop",
  heroImageFocus: { x: 50, y: 40 },
  heroImageAlt: "Evening gala pavilion terrace floral arrangement",
  scrollPrompt: "Explore Invitation",

  storyHeadline: "Celebrating A Decade of Visionary Arts",
  storyText:
    "We cordially invite you to join us for an extraordinary evening of music, contemporary arts, and philanthropy. Set within the iconic Glass Pavilion, this year's gala marks ten years of supporting emerging multidisciplinary artists.\n\nWe look forward to sharing this unforgettable milestone with our closest patrons and friends.",
  storyImage:
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop",

  venue: "The Glass Pavilion at Skyline Gardens",
  address: "742 Evergreen Promenade, Suite 1200",
  city: "San Francisco, CA",
  latitude: 37.7749,
  longitude: -122.4194,
  parkingNotes:
    "Complimentary valet parking is provided at the main pavilion entrance on Evergreen Promenade. Rideshare drop-off is located at Gate 3.",

  schedule: [
    {
      time: "6:00 PM",
      title: "Champagne Reception & Red Carpet",
      description: "Live acoustic quartet, hors d'oeuvres, and private preview of the silent auction.",
      badge: "Arrival",
      day: "Main Gala Night",
    },
    {
      time: "7:30 PM",
      title: "Opening Keynote & Gala Dinner",
      description: "Four-course seasonal tasting menu by Executive Chef Marcus Lin with curated wine pairings.",
      badge: "Dinner",
      day: "Main Gala Night",
    },
    {
      time: "9:00 PM",
      title: "Live Philanthropic Auction",
      description: "Bidding on curated original artworks and patron experiences.",
      badge: "Auction",
      day: "Main Gala Night",
    },
    {
      time: "10:00 PM",
      title: "Midnight Symphony & After-Party",
      description: "Special musical guest performance and dancing in the Crystal Conservatory.",
      badge: "Celebration",
      day: "Main Gala Night",
    },
  ],

  gallery: [
    {
      url: "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=800&auto=format&fit=crop",
      caption: "The Grand Conservatory Dining Hall",
      aspect: "landscape",
    },
    {
      url: "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?q=80&w=800&auto=format&fit=crop",
      caption: "Evening ambiance and cocktail terrace",
      aspect: "portrait",
    },
    {
      url: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?q=80&w=800&auto=format&fit=crop",
      caption: "The illuminated glass walkway at night",
      aspect: "landscape",
    },
    {
      url: "https://images.unsplash.com/photo-1520854221256-17451cc331bf?q=80&w=800&auto=format&fit=crop",
      caption: "Patron tables overlooking the city skyline",
      aspect: "square",
    },
    {
      url: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=800&auto=format&fit=crop",
      caption: "Live acoustic performances throughout the evening",
      aspect: "square",
    },
  ],

  dressCode: "Black Tie & Evening Elegance",
  dressCodeNotes:
    "Floor-length gowns, tuxedos, or formal cultural attire. Midnight blue, jewel tones, and classic black tie are warmly encouraged.",

  accommodations: [
    {
      name: "The Ritz-Carlton San Francisco",
      notes: "Preferred gala rate (\$340/night). Use booking code VANGUARD2026.",
      bookingUrl: "https://www.ritzcarlton.com",
    },
    {
      name: "Four Seasons Hotel at Embarcadero",
      notes: "0.8 miles from venue. Shuttle service departs hourly.",
      bookingUrl: "https://www.fourseasons.com",
    },
  ],

  additionalNotes:
    "Kindly RSVP by November 1st to ensure dietary accommodations. For patrons with specific accessibility requirements, our concierge team is available at concierge@vanguardarts.org.",

  musicAudioUrl:
    "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=piano-moment-9835.mp3",
  musicTitle: "Chamber Strings — Clair de Lune",

  guest: {
    name: "Dr. Evelyn Montgomery",
    title: "Senior Trustee",
    organization: "Montgomery Endowment for the Arts",
    rsvpStatus: "pending",
    rsvpAt: null,
    isVip: true,
  },

  seat: {
    label: "Table 4 · Seat 1",
    tableNumber: "4",
    tableName: "Founder's Circle",
    isVip: true,
  },

  ticketInstance: {
    qrCode: "INV-SOLSTICE-7849204A8F2",
    status: "valid",
    checkedInAt: null,
  },

  token: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

export const MINIMAL_INVITATION_SAMPLE_DATA: InvitationPageData = {
  title: "A Private Dinner in the Vineyard",
  eventDate: "2026-11-22T19:00:00-08:00",
  timezone: "America/Los_Angeles",
  eyebrow: "You're Invited",
  heroImage:
    "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?q=80&w=1200&auto=format&fit=crop",

  storyHeadline: "Harvest Gathering Welcome",
  storyText:
    "Join us for an intimate autumn dinner celebrating the year's harvest with seasonal culinary pairings and good company.",

  venue: "Oakridge Estate Cellars",
  address: "1840 Valley Road",
  city: "Napa Valley, CA",

  // All HIDE-IF-EMPTY fields omitted or set to null:
  hostNames: null,
  endDate: null,
  latitude: null,
  longitude: null,
  parkingNotes: null,
  schedule: null,
  gallery: null,
  dressCode: null,
  dressCodeNotes: null,
  accommodations: null,
  additionalNotes: null,
  musicAudioUrl: null,
  musicTitle: null,
  seat: null,
  venues: null,

  guest: {
    name: "Julian Rivera",
    title: null,
    organization: null,
    rsvpStatus: "pending",
    rsvpAt: null,
    isVip: false,
  },

  ticketInstance: {
    qrCode: "INV-OAKRIDGE-99238120",
    status: "valid",
    checkedInAt: null,
  },

  token: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
};

export const VIP_INVITATION_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  guest: {
    name: "Ambassador Claire Sterling",
    title: "Keynote Benefactor",
    organization: "Global Heritage Council",
    rsvpStatus: "accepted",
    rsvpAt: "2026-10-01T14:22:00Z",
    isVip: true,
  },
  seat: {
    label: "Honorary Dais · Seat 1",
    tableNumber: "1",
    tableName: "Presidential Dais",
    isVip: true,
  },
};

export const PORTRAIT_HERO_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  title: "Elena & Marcus — Wedding Celebration",
  heroImage:
    "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=800&auto=format&fit=crop",
  heroImageFocus: { x: 50, y: 25 },
};

export const LANDSCAPE_HERO_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  title: "Sunset Terrace Dedication",
  heroImage:
    "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?q=80&w=1600&auto=format&fit=crop",
  heroImageFocus: { x: 50, y: 60 },
};

export const BRIGHT_PHOTO_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  title: "Midsummer White Party & Luncheon",
  heroImage:
    "https://images.unsplash.com/photo-1519225421980-715cb0215aed?q=80&w=1200&auto=format&fit=crop",
  heroImageFocus: { x: 50, y: 50 },
};

export const DARK_PHOTO_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  title: "Midnight Noir Philanthropy Gala",
  heroImage:
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1200&auto=format&fit=crop",
  heroImageFocus: { x: 50, y: 50 },
};

export const LOWRES_PHOTO_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  title: "Intimate Fireside Dinner",
  heroImage:
    "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=40&w=300&auto=format&fit=crop",
};

export const NO_HERO_IMAGE_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  title: "The Presidential Anniversary Colloquium",
  heroImage: null,
};

export const LONG_TITLE_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  title:
    "The Annual Solstice Gala for Emerging Multidisciplinary Contemporary Arts & Philanthropic Guild Celebration",
};

export const ONE_GALLERY_IMAGE_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  gallery: [
    {
      url: "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=1200&auto=format&fit=crop",
      caption: "The Grand Conservatory at Twilight",
      aspect: "landscape",
    },
  ],
};

const TWELVE_IMAGES: InvitationGalleryItem[] = [
  { url: "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=800&auto=format&fit=crop", caption: "The Grand Conservatory", aspect: "landscape" },
  { url: "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?q=80&w=800&auto=format&fit=crop", caption: "Cocktail Terrace", aspect: "portrait" },
  { url: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?q=80&w=800&auto=format&fit=crop", caption: "Glass Walkway", aspect: "landscape" },
  { url: "https://images.unsplash.com/photo-1520854221256-17451cc331bf?q=80&w=800&auto=format&fit=crop", caption: "Patron Tables", aspect: "square" },
  { url: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=800&auto=format&fit=crop", caption: "Live Acoustic Performance", aspect: "square" },
  { url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=800&auto=format&fit=crop", caption: "Floral Installations", aspect: "portrait" },
  { url: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?q=80&w=800&auto=format&fit=crop", caption: "Evening Guests", aspect: "landscape" },
  { url: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=800&auto=format&fit=crop", caption: "Crystal Chandelier", aspect: "portrait" },
  { url: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?q=80&w=800&auto=format&fit=crop", caption: "Vineyard Setting", aspect: "landscape" },
  { url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=800&auto=format&fit=crop", caption: "Midnight Lighting", aspect: "square" },
  { url: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?q=80&w=800&auto=format&fit=crop", caption: "Daylight Reception", aspect: "portrait" },
  { url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=800&auto=format&fit=crop", caption: "Grand Finale", aspect: "landscape" },
];

export const TWELVE_GALLERY_IMAGES_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  gallery: TWELVE_IMAGES,
};
