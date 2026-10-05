/**
 * components/invitation/templates/invitation-sample-data.ts
 *
 * Comprehensive sample datasets for testing Aldriva Invitation Page Templates (Revision 3).
 * Supports testing:
 *  - Gala Editorial & Black Tie datasets
 *  - Wedding ("Romantic") datasets
 *  - Birthday ("Bold Celebration") datasets
 *  - Minimal Content (Hide-if-Empty)
 *  - VIP Guest View
 *  - Portrait Photo Hero
 *  - Landscape Photo Hero
 *  - Very Bright Photo (testing text contrast & legibility)
 *  - Very Dark Photo (testing low-key accents)
 *  - Low-Res / Small Photo
 *  - No Hero Image (designed geometric / botanical fallback, zero stock photos)
 *  - Long Title (80+ characters)
 *  - 1 Gallery Image
 *  - 12 Gallery Images
 *
 * IMPORTANT: All event dates are hardcoded ISO strings — never Date.now() + offset.
 */

import { InvitationPageData, InvitationGalleryItem } from "@/types/invitation-template";

// ── Gala / Corporate Full Dataset ────────────────────────────────────────────
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
    isVip: false,
  },

  seat: {
    label: "Table 4 · Seat 1",
    tableNumber: "4",
    tableName: "Founder's Circle",
    isVip: false,
  },

  ticketInstance: {
    qrCode: "INV-SOLSTICE-7849204A8F2",
    status: "valid",
    checkedInAt: null,
  },

  token: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

// ── Wedding Full Dataset ─────────────────────────────────────────────────────
export const WEDDING_INVITATION_SAMPLE_DATA: InvitationPageData = {
  title: "Elena & David — Wedding Celebration",
  partner1Name: "Elena Vance",
  partner2Name: "David Sterling",
  familyNote: "Together with their families, invite you to celebrate their union",
  weddingSubtype: "church",
  eventDate: "2026-09-19T14:30:00-07:00",
  endDate: "2026-09-19T23:30:00-07:00",
  timezone: "America/Los_Angeles",
  eyebrow: "The Holy Matrimony Of",
  hostNames: "Elena Vance & David Sterling",
  heroImage:
    "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=1200&auto=format&fit=crop",
  heroImageFocus: { x: 50, y: 30 },
  heroImageAlt: "Elena and David engagement portrait in golden hour sunlight",
  scrollPrompt: "Celebrate With Us",

  storyHeadline: "Our Journey Together",
  storyText:
    "What started over a shared pot of pour-over coffee in Seattle grew into countless trail miles, shared laughter, and a love we are overjoyed to seal forever.\n\nWe would be honored by your presence as we make our vows before our dearest family and friends.",
  storyImage:
    "https://images.unsplash.com/photo-1583939003579-730e3918a45a?q=80&w=800&auto=format&fit=crop",

  weddingStory: [
    {
      title: "How We Met",
      text: "A rainy Tuesday afternoon at a quiet coffee house in Pike Place Market where a conversation about architecture lasted four hours.",
      image: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=600&auto=format&fit=crop",
    },
    {
      title: "The Proposal",
      text: "At twilight overlooking the Pacific bluffs in Big Sur, surrounded by coastal fog and our favorite music.",
      image: "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?q=80&w=600&auto=format&fit=crop",
    },
  ],

  venues: [
    {
      label: "The Ceremony",
      name: "St. Ignatius Cathedral",
      address: "650 Parker Avenue, San Francisco, CA",
      latitude: 37.7766,
      longitude: -122.4532,
    },
    {
      label: "The Reception",
      name: "The Conservatory of Flowers Terrace",
      address: "100 John F Kennedy Drive, San Francisco, CA",
      latitude: 37.7726,
      longitude: -122.4602,
    },
  ],
  venue: "St. Ignatius Cathedral",
  address: "650 Parker Avenue",
  city: "San Francisco, CA",
  latitude: 37.7766,
  longitude: -122.4532,
  parkingNotes:
    "Shuttle service will be provided from St. Ignatius Cathedral to the Conservatory terrace following the ceremony.",

  colorsOfTheDay: [
    { name: "Dusty Rose", hex: "#D4A59A" },
    { name: "Muted Sage", hex: "#8A9A86" },
    { name: "Champagne", hex: "#EADCC9" },
    { name: "Warm Espresso", hex: "#3A2E2B" },
  ],
  dressCode: "Formal Garden Attire",
  dressCodeNotes:
    "Midi or floor-length dresses in pastel/earth tones, tailored suits in neutral tones. The reception is on a terrace lawn; block heels are recommended.",

  registryNote:
    "Your presence at our wedding is the greatest gift of all. If you would like to contribute to our honeymoon adventures in Japan and Amalfi, our registry is available below.",

  schedule: [
    {
      time: "2:30 PM",
      title: "Ceremony & Nuptial Blessing",
      description: "St. Ignatius Cathedral Sanctuary. Please be seated by 2:15 PM.",
      badge: "Ceremony",
      day: "Saturday, September 19",
    },
    {
      time: "4:30 PM",
      title: "Garden Cocktail Hour",
      description: "Botanical terrace cocktails, string quartet, and passed hors d'oeuvres.",
      badge: "Cocktails",
      day: "Saturday, September 19",
    },
    {
      time: "6:00 PM",
      title: "Dinner & First Dances",
      description: "Three-course seated dinner, toasts, and cake cutting under the glass pavilion.",
      badge: "Reception",
      day: "Saturday, September 19",
    },
    {
      time: "9:00 PM",
      title: "Dancing & Sparkler Farewell",
      description: "Live band celebration followed by a sparkler send-off.",
      badge: "Send-Off",
      day: "Saturday, September 19",
    },
  ],

  gallery: [
    {
      url: "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=800&auto=format&fit=crop",
      caption: "Elena and David in Big Sur",
      aspect: "portrait",
    },
    {
      url: "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?q=80&w=800&auto=format&fit=crop",
      caption: "Sunset along the coastal ridge",
      aspect: "landscape",
    },
    {
      url: "https://images.unsplash.com/photo-1520854221256-17451cc331bf?q=80&w=800&auto=format&fit=crop",
      caption: "Floral tasting preview",
      aspect: "square",
    },
  ],

  accommodations: [
    {
      name: "The Palace Hotel San Francisco",
      notes: "Wedding block rate available with code STERLING2026.",
      bookingUrl: "https://www.marriott.com",
    },
  ],

  hashtag: "#ElenaAndDavid2026",
  musicAudioUrl:
    "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=piano-moment-9835.mp3",
  musicTitle: "Canon in D — Acoustic Strings",

  guest: {
    name: "Catherine & Robert Hayes",
    title: "Family Friends",
    organization: null,
    rsvpStatus: "pending",
    rsvpAt: null,
    isVip: false,
  },

  seat: {
    label: "Table 2 · Magnolia Table",
    tableNumber: "2",
    tableName: "Magnolia Table",
    isVip: false,
  },

  ticketInstance: {
    qrCode: "INV-WED-ELENADAVID-9024",
    status: "valid",
    checkedInAt: null,
  },

  token: "weddingtoken0123456789abcdef0123456789abcdef0123456789abcdef012345",
};

// ── Birthday Full Dataset ───────────────────────────────────────────────────
export const BIRTHDAY_INVITATION_SAMPLE_DATA: InvitationPageData = {
  title: "Maya's 30th Birthday Bash!",
  celebrantName: "Maya Rodriguez",
  ageMilestone: "30th",
  theme: "Studio 54 Disco Glitz",
  eventDate: "2026-10-24T20:00:00-07:00",
  endDate: "2026-10-25T02:00:00-07:00",
  timezone: "America/Los_Angeles",
  eyebrow: "Let's Celebrate Maya!",
  hostNames: "Hosted by Maya, Sam & The Crew",
  heroImage:
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1200&auto=format&fit=crop",
  heroImageFocus: { x: 50, y: 50 },
  heroImageAlt: "Maya disco party lights and celebration setup",
  scrollPrompt: "Party Lineup & RSVP",

  storyHeadline: "Leaving My 20s in the Dust!",
  storyText:
    "30 years of chaos, love, adventures, and bad karaoke choices! Come help me celebrate entering my favorite decade yet with disco beats, signature cocktails, and late-night tacos.\n\nNo gifts necessary — your energy on the dance floor is all I want!",
  storyImage:
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop",

  venue: "The Electric Palm Lounge & Rooftop",
  address: "420 Mission Boulevard",
  city: "San Diego, CA",
  latitude: 32.7157,
  longitude: -117.1611,
  parkingNotes:
    "Rideshare highly recommended! Valet available at Mission Blvd entrance. Designated Uber/Lyft pickup on 4th Ave.",

  dressCode: "Disco Chic & Metallic Glitz",
  dressCodeNotes:
    "Sequins, velvet, platform shoes, bold colors, or anything that sparkles under a disco ball!",

  giftNote:
    "Truly, your presence is the best gift! If you wish to gift something, a contribution toward Maya's surf expedition to Costa Rica is warmly appreciated.",

  schedule: [
    {
      time: "8:00 PM",
      title: "Welcome Cocktails & Glitter Station",
      description: "Signature disco martinis, polaroid wall, and biodegradable glitter bar.",
      badge: "Arrival",
      day: "Saturday Night",
    },
    {
      time: "9:30 PM",
      title: "Roast & Toast + Birthday Cake",
      description: "Short and sweet toasts, cake blowout, and champagne fountain.",
      badge: "Cake",
      day: "Saturday Night",
    },
    {
      time: "10:30 PM",
      title: "DJ Vinyl Set & Dance Floor Takeover",
      description: "70s/80s disco funk into 2000s bangers until late!",
      badge: "Dance",
      day: "Saturday Night",
    },
    {
      time: "12:30 AM",
      title: "Midnight Taco Truck Arrival",
      description: "Late night street tacos and churros on the patio.",
      badge: "Eats",
      day: "Saturday Night",
    },
  ],

  gallery: [
    {
      url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=800&auto=format&fit=crop",
      caption: "Disco lights ready",
      aspect: "square",
    },
    {
      url: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=800&auto=format&fit=crop",
      caption: "Party vibes with the squad",
      aspect: "portrait",
    },
    {
      url: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?q=80&w=800&auto=format&fit=crop",
      caption: "Dancing under the lights",
      aspect: "landscape",
    },
  ],

  hashtag: "#MayaTurns30",
  musicAudioUrl:
    "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=piano-moment-9835.mp3",
  musicTitle: "Studio Disco Funk — Groovy Beats",

  guest: {
    name: "Alex Rivera",
    title: "Best Friend & Co-DJ",
    organization: null,
    rsvpStatus: "pending",
    rsvpAt: null,
    isVip: false,
  },

  seat: {
    label: "VIP Booth 1",
    tableNumber: "1",
    tableName: "Glitter Booth",
    isVip: false,
  },

  ticketInstance: {
    qrCode: "BDAY-MAYA30-ALEXRIVERA-88",
    status: "valid",
    checkedInAt: null,
  },

  token: "birthdaytoken0123456789abcdef0123456789abcdef0123456789abcdef0123",
};

// ── Minimal Hide-If-Empty Dataset ───────────────────────────────────────────
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
  partner1Name: null,
  partner2Name: null,
  familyNote: null,
  weddingSubtype: null,
  colorsOfTheDay: null,
  registryNote: null,
  weddingStory: null,
  celebrantName: null,
  ageMilestone: null,
  theme: null,
  giftNote: null,
  hashtag: null,

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

// ── VIP Dataset ─────────────────────────────────────────────────────────────
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
