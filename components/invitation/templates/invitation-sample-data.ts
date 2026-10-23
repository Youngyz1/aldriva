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
import { INVITATION_SAMPLE_MEDIA } from "@/components/invitation/templates/invitation-sample-media";

// ── Gala / Corporate Full Dataset ────────────────────────────────────────────
export const FULL_INVITATION_SAMPLE_DATA: InvitationPageData = {
  title: "The Solstice Gala & Charity Soirée",
  eventDate: "2026-12-06T19:00:00-08:00",
  endDate: "2026-12-07T01:00:00-08:00",
  timezone: "America/Los_Angeles",
  eyebrow: "An Exclusive Evening Celebration",
  hostNames: "Hosted by The Vanguard Foundation & Cultural Arts Guild",
  heroImage:
    INVITATION_SAMPLE_MEDIA.photo1511795409834,
  heroImageFocus: { x: 50, y: 40 },
  heroImageAlt: "Evening gala pavilion terrace floral arrangement",
  scrollPrompt: "Explore Invitation",

  storyHeadline: "Celebrating A Decade of Visionary Arts",
  storyText:
    "We cordially invite you to join us for an extraordinary evening of music, contemporary arts, and philanthropy. Set within the iconic Glass Pavilion, this year's gala marks ten years of supporting emerging multidisciplinary artists.\n\nWe look forward to sharing this unforgettable milestone with our closest patrons and friends.",
  storyImage:
    INVITATION_SAMPLE_MEDIA.photo1534528741775,

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
      url: INVITATION_SAMPLE_MEDIA.photo1519741497674,
      caption: "The Grand Conservatory Dining Hall",
      aspect: "landscape",
    },
    {
      url: INVITATION_SAMPLE_MEDIA.photo1469371670807,
      caption: "Evening ambiance and cocktail terrace",
      aspect: "portrait",
    },
    {
      url: INVITATION_SAMPLE_MEDIA.photo1464366400600,
      caption: "The illuminated glass walkway at night",
      aspect: "landscape",
    },
    {
      url: INVITATION_SAMPLE_MEDIA.photo1520854221256,
      caption: "Patron tables overlooking the city skyline",
      aspect: "square",
    },
    {
      url: INVITATION_SAMPLE_MEDIA.photo1533174072545,
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
    INVITATION_SAMPLE_MEDIA.photo1519741497674,
  heroImageFocus: { x: 50, y: 30 },
  heroImageAlt: "Elena and David engagement portrait in golden hour sunlight",
  scrollPrompt: "Celebrate With Us",

  storyHeadline: "Our Journey Together",
  storyText:
    "What started over a shared pot of pour-over coffee in Seattle grew into countless trail miles, shared laughter, and a love we are overjoyed to seal forever.\n\nWe would be honored by your presence as we make our vows before our dearest family and friends.",
  storyImage:
    INVITATION_SAMPLE_MEDIA.photo1583939003579,

  weddingStory: [
    {
      title: "How We Met",
      text: "A rainy Tuesday afternoon at a quiet coffee house in Pike Place Market where a conversation about architecture lasted four hours.",
      image: INVITATION_SAMPLE_MEDIA.photo1511285560929,
    },
    {
      title: "The Proposal",
      text: "At twilight overlooking the Pacific bluffs in Big Sur, surrounded by coastal fog and our favorite music.",
      image: INVITATION_SAMPLE_MEDIA.photo1469371670807,
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
      url: INVITATION_SAMPLE_MEDIA.photo1519741497674,
      caption: "Elena and David in Big Sur",
      aspect: "portrait",
    },
    {
      url: INVITATION_SAMPLE_MEDIA.photo1469371670807,
      caption: "Sunset along the coastal ridge",
      aspect: "landscape",
    },
    {
      url: INVITATION_SAMPLE_MEDIA.photo1520854221256,
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

const EVERGREEN_SAMPLE_GUEST = {
  name: "Honored Guest",
  rsvpStatus: "pending" as const,
  isVip: false,
};

const EVERGREEN_SAMPLE_PHOTO = "/images/invitations/evergreen-envelope/photo-placeholder.svg";
const EVERGREEN_PHOTOS = {
  envelopePhoto: EVERGREEN_SAMPLE_PHOTO,
  coverPhoto: EVERGREEN_SAMPLE_PHOTO,
  polaroidPhotoOne: EVERGREEN_SAMPLE_PHOTO,
  polaroidPhotoTwo: EVERGREEN_SAMPLE_PHOTO,
  storyPhotoOne: EVERGREEN_SAMPLE_PHOTO,
  storyPhotoTwo: EVERGREEN_SAMPLE_PHOTO,
  closingPhoto: EVERGREEN_SAMPLE_PHOTO,
  rsvpPhoto: EVERGREEN_SAMPLE_PHOTO,
};

/** Sample-only English data for Evergreen Envelope. Never used for published guest data. */
export const EVERGREEN_ENVELOPE_SAMPLE_DATA: InvitationPageData = {
  ...WEDDING_INVITATION_SAMPLE_DATA,
  ...EVERGREEN_PHOTOS,
  heroImage: EVERGREEN_SAMPLE_PHOTO,
  storyImage: EVERGREEN_SAMPLE_PHOTO,
  gallery: [{ url: EVERGREEN_SAMPLE_PHOTO, alt: "Sample photo placeholder" }],
  musicAudioUrl: null,
  musicTitle: null,
  musicLinks: [],
  title: "A Wedding in the Garden",
  partner1Name: "Mira Okafor",
  partner2Name: "Tunde Adeyemi",
  familyNote: "Together with their families",
  parentsLine: "The Okafor and Adeyemi families",
  eyebrow: "Our Wedding",
  hostNames: "Mira Okafor & Tunde Adeyemi",
  eventDate: "2027-02-20T14:00:00+01:00",
  endDate: "2027-02-20T22:00:00+01:00",
  timezone: "Africa/Lagos",
  venue: "The Palm Courtyard",
  address: "18 Oniru Road",
  city: "Lagos, Nigeria",
  latitude: undefined,
  longitude: undefined,
  venues: [
    { label: "Ceremony", name: "The Palm Courtyard", address: "18 Oniru Road, Lagos, Nigeria", time: "2:00 PM" },
    { label: "Reception", name: "Palm Courtyard Garden", address: "18 Oniru Road, Lagos, Nigeria", time: "4:00 PM" },
  ],
  dressCode: "Garden formal",
  dressCodeNotes: "Soft natural tones are welcome.",
  dressCodeSwatches: [
    { name: "Sage", hex: "#879276" },
    { name: "Ivory", hex: "#f3eddc" },
    { name: "Olive", hex: "#667146" },
  ],
  schedule: [
    { time: "2:00 PM", title: "Dinner", icon: "dining" },
    { time: "3:00 PM", title: "Toast", icon: "champagne" },
    { time: "4:00 PM", title: "Cake cutting", icon: "cake" },
    { time: "5:00 PM", title: "Dancing", icon: "dancing" },
    { time: "6:00 PM", title: "Thanks for coming!", icon: "hand" },
  ],
  storyHeadline: "Love wrote our story, and we’ll celebrate its most beautiful chapter in:",
  storyText: "We met through friends, kept finding reasons to meet again, and are grateful to celebrate this next chapter with you.",
  adultsOnlyNote: "We love your little ones, but this celebration is for adults.",
  wishingWellNote: "Your presence is the greatest gift. If you wish, you may share a gift with us.",
  storyForeverWord: "forever",
  closingCaption: "We cannot wait to celebrate with you.",
  rsvpIntro: "We are so excited to celebrate one of the most important days of our lives with you.",
  rsvpDeadline: "February 1, 2027",
  monogramInitials: "M & T",
  albumUrl: "https://example.com/mira-and-tunde-album",
  showWishingWell: true,
  showAdultsOnly: true,
  weddingStory: [
    { title: "The beginning", text: "A conversation that turned into a friendship, then into home.", image: EVERGREEN_SAMPLE_PHOTO },
    { title: "The question", text: "A quiet evening became a promise for every season ahead.", image: EVERGREEN_SAMPLE_PHOTO },
  ],
  guest: EVERGREEN_SAMPLE_GUEST,
  token: "preview-sample-token",
};

/** French sample content for the same layout and photo frames. */
export const EVERGREEN_ENVELOPE_SAMPLE_DATA_FR: InvitationPageData = {
  ...EVERGREEN_ENVELOPE_SAMPLE_DATA,
  locale: "fr",
  title: "Un mariage au jardin",
  eyebrow: "Le cœur rempli de joie",
  hostNames: "Mira Okafor et Tunde Adeyemi",
  familyNote: "Entourés de leurs familles",
  parentsLine: "Avec l’amour et la bénédiction de nos familles",
  dressCode: "Tenue élégante de jardin",
  dressCodeNotes: "Les tons naturels et doux sont les bienvenus.",
  dressCodeSwatches: [
    { name: "Sauge", hex: "#879276" },
    { name: "Ivoire", hex: "#f3eddc" },
    { name: "Olive", hex: "#667146" },
  ],
  schedule: [
    { time: "14 h 00", title: "Dîner", icon: "dining" },
    { time: "15 h 00", title: "Toast", icon: "champagne" },
    { time: "16 h 00", title: "Découpe du gâteau", icon: "cake" },
    { time: "17 h 00", title: "Danse", icon: "dancing" },
    { time: "18 h 00", title: "Merci d’être venus !", icon: "gift" },
  ],
  storyHeadline: "Notre histoire nous a menés à ce beau chapitre à célébrer ensemble :",
  storyText: "Une rencontre par des amis, puis mille raisons de se revoir. Nous avons hâte de célébrer ce nouveau chapitre avec vous.",
  adultsOnlyNote: "Nous aimons vos enfants, mais cette célébration est réservée aux adultes.",
  wishingWellNote: "Votre présence est le plus beau des cadeaux. Si vous le souhaitez, vous pouvez nous offrir un cadeau.",
  storyForeverWord: "pour toujours",
  closingCaption: "Nous avons hâte de célébrer avec vous.",
  rsvpIntro: "Nous sommes ravis de célébrer avec vous. Merci de répondre avant le 1er février 2027.",
  albumUrl: "https://example.com/mira-and-tunde-album",
  weddingStory: [
    { title: "Le début", text: "Une conversation devenue amitié, puis un foyer.", image: EVERGREEN_PHOTOS.storyPhotoOne },
    { title: "La demande", text: "Une soirée paisible devenue une promesse pour toutes les saisons.", image: EVERGREEN_PHOTOS.storyPhotoTwo },
  ],
};

/** Local-art preview fixture for Botanical Reverie; no remote stock assets. */
export const BOTANICAL_REVERIE_SAMPLE_DATA: InvitationPageData = {
  ...WEDDING_INVITATION_SAMPLE_DATA,
  eyebrow: "Together with their families",
  heroImage: "/images/invitations/botanical/garden-arch.svg",
  heroImageAlt: "Locally illustrated botanical garden arch in sage and dusty rose",
  storyImage: "/images/invitations/botanical/corner-sprig.svg",
  weddingStory: [
    { title: "How We Met", text: "A chance meeting grew into a life full of small adventures and shared dreams." },
    { title: "The Proposal", text: "A quiet garden evening, surrounded by the people and places we love." },
  ],
  gallery: [
    { url: "/images/invitations/botanical/garden-arch.svg", alt: "Botanical stationery illustration", caption: "A garden celebration" },
    { url: "/images/invitations/botanical/corner-sprig.svg", alt: "Sage and dusty rose botanical sprig", caption: "Our chosen palette" },
  ],
  musicAudioUrl: null,
  musicTitle: null,
  musicLinks: [],
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
    INVITATION_SAMPLE_MEDIA.photo1514525253161,
  heroImageFocus: { x: 50, y: 50 },
  heroImageAlt: "Maya disco party lights and celebration setup",
  scrollPrompt: "Party Lineup & RSVP",

  storyHeadline: "Leaving My 20s in the Dust!",
  storyText:
    "30 years of chaos, love, adventures, and bad karaoke choices! Come help me celebrate entering my favorite decade yet with disco beats, signature cocktails, and late-night tacos.\n\nNo gifts necessary — your energy on the dance floor is all I want!",
  storyImage:
    INVITATION_SAMPLE_MEDIA.photo1534528741775,

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
      url: INVITATION_SAMPLE_MEDIA.photo1514525253161,
      caption: "Disco lights ready",
      aspect: "square",
    },
    {
      url: INVITATION_SAMPLE_MEDIA.photo1533174072545,
      caption: "Party vibes with the squad",
      aspect: "portrait",
    },
    {
      url: INVITATION_SAMPLE_MEDIA.photo1519671482749,
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
    INVITATION_SAMPLE_MEDIA.photo1506377247377,

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
    INVITATION_SAMPLE_MEDIA.photo1519741497674,
  heroImageFocus: { x: 50, y: 25 },
};

export const LANDSCAPE_HERO_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  title: "Sunset Terrace Dedication",
  heroImage:
    INVITATION_SAMPLE_MEDIA.photo1506377247377,
  heroImageFocus: { x: 50, y: 60 },
};

export const BRIGHT_PHOTO_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  title: "Midsummer White Party & Luncheon",
  heroImage:
    INVITATION_SAMPLE_MEDIA.photo1519225421980,
  heroImageFocus: { x: 50, y: 50 },
};

export const DARK_PHOTO_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  title: "Midnight Noir Philanthropy Gala",
  heroImage:
    INVITATION_SAMPLE_MEDIA.photo1514525253161,
  heroImageFocus: { x: 50, y: 50 },
};

export const LOWRES_PHOTO_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  title: "Intimate Fireside Dinner",
  heroImage:
    INVITATION_SAMPLE_MEDIA.photo1511285560929,
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
      url: INVITATION_SAMPLE_MEDIA.photo1519741497674,
      caption: "The Grand Conservatory at Twilight",
      aspect: "landscape",
    },
  ],
};

const TWELVE_IMAGES: InvitationGalleryItem[] = [
  { url: INVITATION_SAMPLE_MEDIA.photo1519741497674, caption: "The Grand Conservatory", aspect: "landscape" },
  { url: INVITATION_SAMPLE_MEDIA.photo1469371670807, caption: "Cocktail Terrace", aspect: "portrait" },
  { url: INVITATION_SAMPLE_MEDIA.photo1464366400600, caption: "Glass Walkway", aspect: "landscape" },
  { url: INVITATION_SAMPLE_MEDIA.photo1520854221256, caption: "Patron Tables", aspect: "square" },
  { url: INVITATION_SAMPLE_MEDIA.photo1533174072545, caption: "Live Acoustic Performance", aspect: "square" },
  { url: INVITATION_SAMPLE_MEDIA.photo1511795409834, caption: "Floral Installations", aspect: "portrait" },
  { url: INVITATION_SAMPLE_MEDIA.photo1519671482749, caption: "Evening Guests", aspect: "landscape" },
  { url: INVITATION_SAMPLE_MEDIA.photo1511285560929, caption: "Crystal Chandelier", aspect: "portrait" },
  { url: INVITATION_SAMPLE_MEDIA.photo1506377247377, caption: "Vineyard Setting", aspect: "landscape" },
  { url: INVITATION_SAMPLE_MEDIA.photo1514525253161, caption: "Midnight Lighting", aspect: "square" },
  { url: INVITATION_SAMPLE_MEDIA.photo1519225421980, caption: "Daylight Reception", aspect: "portrait" },
  { url: INVITATION_SAMPLE_MEDIA.photo1470225620780, caption: "Grand Finale", aspect: "landscape" },
];

export const TWELVE_GALLERY_IMAGES_SAMPLE_DATA: InvitationPageData = {
  ...FULL_INVITATION_SAMPLE_DATA,
  gallery: TWELVE_IMAGES,
};
