/**
 * components/invitation/templates/invitation-sample-data.ts
 *
 * Minimalism Dark Blue-only sample dataset for the builder live preview and
 * demo route. Ported deliberately narrower than the upstream feature branch:
 * that branch's file also carried sample data for templates (evergreen,
 * botanical, boho, luxe, romantic, gala/black-tie/cover) that do not exist
 * on this tree, plus a photo library (`invitation-sample-media.ts`) whose
 * referenced files were removed upstream. Rather than restore all of it,
 * only the fields MinimalismDarkBluePageTemplate.tsx actually reads are
 * reproduced here, inlined and self-contained — no spread from a larger
 * multi-template dataset, no dependency on a shared photo library.
 *
 * IMPORTANT: All event dates are hardcoded ISO strings — never Date.now() + offset.
 */

import type { InvitationPageData, InvitationGalleryItem } from "@/types/invitation-template";

const MINIMALISM_DEMO_BASE = "/images/invitations/minimalism-dark-blue/demo";

const MINIMALISM_GALLERY: InvitationGalleryItem[] = Array.from({ length: 8 }, (_, index) => ({
  url: `${MINIMALISM_DEMO_BASE}/gallery-${String(index + 1).padStart(2, "0")}.jpg`,
  alt: "Sample engagement photo",
}));

const MINIMALISM_SAMPLE_GUEST = {
  name: "Honored Guest",
  rsvpStatus: "pending" as const,
  isVip: false,
  isPlaceholder: true,
  isSample: true,
};

/** Sample-only English data for Minimalism Dark Blue. Never used for published guest data; see public/images/invitations/minimalism-dark-blue/demo/CREDITS.md. */
export const MINIMALISM_DARK_BLUE_SAMPLE_DATA: InvitationPageData = {
  locale: "en",
  title: "Our Wedding",
  eyebrow: "Our Wedding",
  hostNames: "Nora Hale & Theo Reyes",
  eventDate: "2027-06-12T19:00:00-04:00",
  timezone: "America/Toronto",
  heroImageFocus: { x: 50, y: 30 },

  envelopePhoto: `${MINIMALISM_DEMO_BASE}/envelope-photo-one.jpg`,
  envelopePhotoTwo: `${MINIMALISM_DEMO_BASE}/envelope-photo-two.jpg`,
  gallery: MINIMALISM_GALLERY,

  partner1Name: "Nora Hale",
  partner2Name: "Theo Reyes",
  familyNote: "Together with their families",

  venue: "Saint-Roch Catholic Church",
  address: "555 Rue Saint-Francois E",
  city: "Quebec City, Canada",
  venues: [
    { label: "Ceremony", name: "Saint-Roch Catholic Church", time: "7:00 PM" },
    { label: "Reception", name: "Espace Saint-Roch", time: "8:30 PM" },
  ],

  parentOneLabel: "Mr. and Mrs.",
  parentOneNameOne: "Gabriel Hale",
  parentOneNameTwo: "Noemi Hale",
  parentTwoLabel: "Mr. and Mrs.",
  parentTwoNameOne: "Felix Reyes",
  parentTwoNameTwo: "Camille Reyes",

  dressCode: "Evening wear",
  dressCodeNotes:
    "Midi or floor-length dresses in pastel/earth tones, tailored suits in neutral tones. The reception is on a terrace lawn; block heels are recommended.",
  dressCodeSwatches: [
    { name: "Midnight", hex: "#14305a" },
    { name: "Dusty Blue", hex: "#5b7da6" },
    { name: "Ivory", hex: "#f3efe4" },
  ],

  schedule: [
    { time: "19:00", title: "Ceremony", icon: "ceremony" },
    { time: "20:00", title: "Cocktail", icon: "cocktail" },
    { time: "21:30", title: "Supper", icon: "cake" },
    { time: "23:30", title: "First dance", icon: "dancing" },
    { time: "01:30", title: "Late-night buffet", icon: "dining" },
  ],

  musicAudioUrl: null,
  musicTitle: null,
  musicLinks: [],

  guest: MINIMALISM_SAMPLE_GUEST,
  token: "preview-sample-token",
};

/** French sample content for the same layout and photo frames. */
export const MINIMALISM_DARK_BLUE_SAMPLE_DATA_FR: InvitationPageData = {
  ...MINIMALISM_DARK_BLUE_SAMPLE_DATA,
  locale: "fr",
  title: "Notre mariage",
  eyebrow: "Notre mariage",
  hostNames: "Nora Hale et Theo Reyes",
  familyNote: "Avec leurs familles",
  venues: [
    { label: "Ceremony", name: "Église Saint-Roch", time: "19 h 00" },
    { label: "Reception", name: "Espace Saint-Roch", time: "20 h 30" },
  ],
  parentOneLabel: "M. et Mme",
  parentTwoLabel: "M. et Mme",
  dressCode: "Tenue de soiree",
  schedule: [
    { time: "19:00", title: "Ceremonie", icon: "ceremony" },
    { time: "20:00", title: "Cocktail", icon: "cocktail" },
    { time: "21:30", title: "Souper", icon: "cake" },
    { time: "23:30", title: "Premiere danse", icon: "dancing" },
    { time: "01:30", title: "Buffet de fin de soiree", icon: "dining" },
  ],
};

const BURGUNDY_DEMO_BASE = "/images/invitations/burgundy-gold/demo";

// Placeholder gallery tiles for the demo/preview only — the shared minimalism
// sample photo library, already shipped in this repository. No new image files.
const BURGUNDY_GALLERY: InvitationGalleryItem[] = Array.from({ length: 6 }, (_, index) => ({
  url: `/images/invitations/minimalism-dark-blue/demo/gallery-${String(index + 1).padStart(2, "0")}.jpg`,
  alt: "Sample wedding photo (placeholder)",
}));

const BURGUNDY_GOLD_SAMPLE_GUEST = {
  name: "Honored Guest",
  rsvpStatus: "pending" as const,
  isVip: false,
  isPlaceholder: true,
  isSample: true,
};

export const BURGUNDY_GOLD_SAMPLE_DATA: InvitationPageData = {
  locale: "en",
  title: "Our Wedding",
  eyebrow: "Our Wedding",
  hostNames: "Modou Gueye & Ndeye Sarr",
  eventDate: "2027-10-16T18:00:00Z",
  timezone: "Africa/Dakar",
  heroImageFocus: { x: 50, y: 30 },
  invitationLine: "Together with their families, invite you to celebrate their marriage.",
  openingPhoto: `${BURGUNDY_DEMO_BASE}/opening-photo.jpg`,
  openingMessage: "We are delighted to welcome you to the celebration of our marriage.",
  parentOneLabel: "Mr. and Mrs.",
  parentOneNameOne: "Abdoulaye Gueye",
  parentOneNameTwo: "Fatou Gueye",
  parentTwoLabel: "Mr. and Mrs.",
  parentTwoNameOne: "Ousmane Sarr",
  parentTwoNameTwo: "Aminata Sarr",
  heroImage: null,
  storyImage: null,
  envelopePhoto: null,
  envelopePhotoTwo: null,
  coverPhoto: null,
  partner1Name: "Modou Gueye",
  partner2Name: "Ndeye Sarr",
  familyNote: "Together with their families",
  gallery: BURGUNDY_GALLERY,
  venue: "Cathedrale du Souvenir Africain",
  address: "Dakar",
  city: "Dakar",
  // The guest welcome is a programme moment (17:00), not a venue: venues[0] is
  // the ceremony, so no venue can be labelled "Guest welcome".
  venues: [
    { label: "Ceremony", name: "Cathedrale du Souvenir Africain", time: "18:00" },
    { label: "Reception", name: "Espace Point E", time: "19:30" },
  ],
  dressCode: "Black tie with burgundy and gold accents",
  dressCodeNotes: "Floor-length gowns and dark suits; the reception is indoors with a garden terrace.",
  dressCodeSwatches: [
    { name: "Burgundy", hex: "#4a0d1c" },
    { name: "Gold", hex: "#cdb073" },
    { name: "Cream", hex: "#f6ead0" },
  ],
  schedule: [
    { time: "17:00", title: "Guest welcome", icon: "cocktail" },
    { time: "18:00", title: "Ceremony", icon: "ceremony" },
    { time: "19:30", title: "Reception", icon: "dining" },
    { time: "21:00", title: "First dance", icon: "dancing" },
    { time: "23:00", title: "Late buffet", icon: "dining" },
  ],
  // Placeholder demo track: the existing minimalism demo audio already shipped
  // in this repository (see public/images/invitations/burgundy-gold/SOURCES.md).
  // Scoped to the burgundy-gold sample data only.
  musicAudioUrl: "/audio/invitations/minimalism-dark-blue/demo.mp3",
  musicTitle: "Wedding instrumental (placeholder)",
  musicLinks: [],
  guest: BURGUNDY_GOLD_SAMPLE_GUEST,
  token: "preview-sample-token",
};

export const BURGUNDY_GOLD_SAMPLE_DATA_FR: InvitationPageData = {
  ...BURGUNDY_GOLD_SAMPLE_DATA,
  locale: "fr",
  title: "Notre mariage",
  eyebrow: "Le mariage de",
  hostNames: "Modou Gueye et Ndeye Sarr",
  familyNote: "Avec leurs familles",
  invitationLine: "Avec leurs familles, ils vous invitent à célébrer leur mariage.",
  openingMessage: "Nous sommes heureux de vous accueillir pour célébrer notre mariage.",
  parentOneLabel: "M. et Mme",
  parentOneNameOne: "Abdoulaye Guèye",
  parentOneNameTwo: "Fatou Guèye",
  parentTwoLabel: "M. et Mme",
  parentTwoNameOne: "Ousmane Sarr",
  parentTwoNameTwo: "Aminata Sarr",
  eventDate: "2027-10-16T18:00:00Z",
  timezone: "Africa/Dakar",
  venue: "Cathédrale du Souvenir Africain",
  city: "Dakar",
  venues: [
    { label: "Cérémonie", name: "Cathédrale du Souvenir Africain", time: "18:00" },
    { label: "Réception", name: "Espace Point E", time: "19:30" },
  ],
  dressCode: "Tenue de soirée, accents bordeaux et or",
  dressCodeNotes: "Robes longues et costumes sombres ; la réception se tient à l'intérieur avec une terrasse.",
  dressCodeSwatches: [
    { name: "Bordeaux", hex: "#4a0d1c" },
    { name: "Or", hex: "#cdb073" },
    { name: "Crème", hex: "#f6ead0" },
  ],
  schedule: [
    { time: "17:00", title: "Accueil des invités", icon: "cocktail" },
    { time: "18:00", title: "Cérémonie", icon: "ceremony" },
    { time: "19:30", title: "Réception", icon: "dining" },
    { time: "21:00", title: "Première danse", icon: "dancing" },
    { time: "23:00", title: "Buffet tardif", icon: "dining" },
  ],
};
