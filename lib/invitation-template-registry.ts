/**
 * Code-owned invitation page definitions.
 *
 * Keep this module data-only so picker and editor surfaces can use the
 * registry without importing page implementations or validation libraries.
 * Page-layout versioning lives in PageBlocksLayout.version; this registry's
 * `version` identifies the implementation contract for a stable template ID.
 */
import type { PageThemePreset } from "@/lib/page-composition";

export const INVITATION_BLOCK_TYPES = [
  "interactive_envelope",
  "hero",
  "romantic_hero",
  "story",
  "details",
  "countdown",
  "location_map",
  "schedule",
  "gallery",
  "music",
  "action_portal",
] as const;

export type InvitationBlockType = (typeof INVITATION_BLOCK_TYPES)[number];
export type InvitationTemplateCategory = "gala_corporate" | "wedding" | "birthday" | "universal";
export type InvitationCustomization = "palette" | "fontPack" | "textScale";
export const INVITATION_DETAILS_PRESENTATIONS = [
  "botanical",
  "editorial",
  "luxe-editorial",
  "black-tie",
  "romantic",
  "birthday",
  "cover",
] as const;
export type InvitationDetailsPresentation = (typeof INVITATION_DETAILS_PRESENTATIONS)[number];

export const INVITATION_GALLERY_PRESENTATIONS = [
  "editorial", "romantic", "botanical", "black-tie", "birthday", "cover", "accordion",
] as const;
export type InvitationGalleryPresentation = (typeof INVITATION_GALLERY_PRESENTATIONS)[number];

/** Runtime guard for organizer-selected gallery layouts stored in block content. */
export function isInvitationGalleryPresentation(value: unknown): value is InvitationGalleryPresentation {
  return typeof value === "string"
    && (INVITATION_GALLERY_PRESENTATIONS as readonly string[]).includes(value);
}

export type InvitationEffectType = "envelope-reveal" | "scroll-reveal" | "falling-petals";
export const INVITATION_EFFECT_TYPES: readonly InvitationEffectType[] = [
  "envelope-reveal", "scroll-reveal", "falling-petals",
];
export type InvitationEffectConfig =
  | { type: "envelope-reveal"; enabled: boolean; transitionDurationMs: number }
  | { type: "scroll-reveal"; enabled: boolean; durationMs: number }
  | { type: "falling-petals"; enabled: boolean; density: number };

export type CustomInvitationPageComponentId = "romantic-envelope" | "botanical-reverie" | "luxe-editorial";
export type InvitationPageRenderer =
  | { kind: "blocks" }
  | { kind: "custom"; componentId: CustomInvitationPageComponentId };

/** Returns fresh, bounded defaults for the builder when an effect is first enabled. */
export function defaultInvitationEffectConfig(type: InvitationEffectType): InvitationEffectConfig {
  switch (type) {
    case "envelope-reveal": return { type, enabled: true, transitionDurationMs: 1000 };
    case "scroll-reveal": return { type, enabled: false, durationMs: 500 };
    case "falling-petals": return { type, enabled: false, density: 6 };
  }
}

export const INVITATION_BINDING_PATHS = [
  "title", "eventDate", "timezone", "locale", "eyebrow", "hostNames", "heroImage", "heroImageFocus",
  "heroImageAlt", "scrollPrompt", "storyHeadline", "storyText", "storyImage", "venue", "address", "city",
  "endDate", "latitude", "longitude", "parkingNotes", "venues", "schedule", "gallery", "dressCode",
  "dressCodeNotes", "accommodations", "additionalNotes", "musicAudioUrl", "musicTitle", "musicLinks",
  "partner1Name", "partner2Name", "familyNote", "weddingSubtype", "colorsOfTheDay", "registryNote",
  "weddingStory", "celebrantName", "ageMilestone", "theme", "giftNote", "hashtag", "guest.name",
  "guest.title", "guest.organization", "guest.rsvpStatus", "guest.rsvpAt", "guest.isVip", "seat.label",
  "seat.tableNumber", "seat.tableName", "seat.isVip", "ticketInstance.qrCode", "ticketInstance.status",
  "ticketInstance.checkedInAt", "token",
] as const;

export type InvitationBindingPath = (typeof INVITATION_BINDING_PATHS)[number];

export interface InvitationTemplateDefinition {
  /** Stable ID stored on event_invitation_pages.template_id. */
  id: string;
  /** Bump when the implementation contract for this stable ID changes. */
  version: string;
  name: string;
  category: InvitationTemplateCategory;
  categoryLabel: string;
  description: string;
  publicationStatus: "published" | "unlisted" | "retired";
  preview: { kind: "rendered-sample"; sampleId: string };
  defaultThemePreset: PageThemePreset;
  /** Code-owned details composition; content and bindings stay in the block data. */
  detailsPresentation: InvitationDetailsPresentation;
  /** Optional image composition for the shared, data-bound gallery block. */
  galleryPresentation?: InvitationGalleryPresentation;
  composition: "standard" | "romantic-envelope" | "botanical-reverie";
  defaultBlockTypes: readonly InvitationBlockType[];
  supportedBlockTypes: readonly InvitationBlockType[];
  /** Blocks restored when a legacy/saved layout omitted a required section. */
  requiredBlockTypes: readonly InvitationBlockType[];
  supportedCustomizations: Readonly<Record<InvitationCustomization, boolean>>;
  /** Code-owned page renderer selection; persisted values never name modules. */
  pageRenderer: InvitationPageRenderer;
  supportedEffects: readonly InvitationEffectType[];
  defaultEffects: readonly InvitationEffectConfig[];
}

const STANDARD_CUSTOMIZATIONS: InvitationTemplateDefinition["supportedCustomizations"] = {
  palette: true,
  fontPack: true,
  textScale: true,
};

const STANDARD_BLOCKS = [
  "hero", "story", "details", "countdown", "location_map", "schedule", "gallery", "music", "action_portal",
] as const satisfies readonly InvitationBlockType[];

const STANDARD_BLOCKS_WITHOUT_COUNTDOWN = [
  "hero", "story", "details", "location_map", "schedule", "gallery", "music", "action_portal",
] as const satisfies readonly InvitationBlockType[];

const STANDARD_SUPPORTED_BLOCKS = [
  "hero", "story", "details", "countdown", "location_map", "schedule", "gallery", "music", "action_portal",
] as const satisfies readonly InvitationBlockType[];

const ROMANTIC_SUPPORTED_BLOCKS = [
  ...STANDARD_SUPPORTED_BLOCKS, "interactive_envelope", "romantic_hero",
] as const satisfies readonly InvitationBlockType[];

/**
 * Supported microsite templates. Visual variants reuse the shared block
 * composition; romantic-envelope opts into focused bespoke React blocks.
 */
export const INVITATION_TEMPLATE_REGISTRY = {
  "gala-editorial": {
    id: "gala-editorial", version: "1.0.0", name: "Gala Editorial", category: "gala_corporate",
    categoryLabel: "Gala & Corporate", description: "Warm ivory and deep ink light editorial design with Cormorant Garamond serif.",
    publicationStatus: "published", preview: { kind: "rendered-sample", sampleId: "gala-editorial" },
    defaultThemePreset: "gala", detailsPresentation: "editorial", galleryPresentation: "editorial", composition: "standard", pageRenderer: { kind: "blocks" }, defaultBlockTypes: STANDARD_BLOCKS,
    supportedBlockTypes: STANDARD_SUPPORTED_BLOCKS,
    requiredBlockTypes: ["countdown"], supportedCustomizations: STANDARD_CUSTOMIZATIONS,
    supportedEffects: ["scroll-reveal"], defaultEffects: [],
  },
  "black-tie": {
    id: "black-tie", version: "1.0.0", name: "Black Tie", category: "gala_corporate",
    categoryLabel: "Gala & Corporate", description: "Dramatic dark zinc & amber-gold framed luxury composition with gold accents.",
    publicationStatus: "published", preview: { kind: "rendered-sample", sampleId: "black-tie" },
    defaultThemePreset: "blackTie", detailsPresentation: "black-tie", galleryPresentation: "black-tie", composition: "standard", pageRenderer: { kind: "blocks" }, defaultBlockTypes: STANDARD_BLOCKS,
    supportedBlockTypes: STANDARD_SUPPORTED_BLOCKS,
    requiredBlockTypes: ["countdown"], supportedCustomizations: STANDARD_CUSTOMIZATIONS,
    supportedEffects: ["scroll-reveal"], defaultEffects: [],
  },
  "wedding-romantic": {
    id: "wedding-romantic", version: "1.0.0", name: "Romantic Wedding", category: "wedding",
    categoryLabel: "Wedding", description: "Soft blush and sage palette on cream with script accents, arch photo, and response card.",
    publicationStatus: "published", preview: { kind: "rendered-sample", sampleId: "wedding-romantic" },
    defaultThemePreset: "wedding", detailsPresentation: "romantic", galleryPresentation: "romantic", composition: "standard", pageRenderer: { kind: "blocks" }, defaultBlockTypes: STANDARD_BLOCKS,
    supportedBlockTypes: STANDARD_SUPPORTED_BLOCKS,
    requiredBlockTypes: ["countdown"], supportedCustomizations: STANDARD_CUSTOMIZATIONS,
    supportedEffects: ["scroll-reveal", "falling-petals"], defaultEffects: [],
  },
  "romantic-envelope": {
    id: "romantic-envelope", version: "1.0.0", name: "Romantic Envelope", category: "wedding",
    categoryLabel: "Wedding", description: "A cinematic envelope reveal followed by a full-screen wedding story and itinerary.",
    publicationStatus: "published", preview: { kind: "rendered-sample", sampleId: "romantic-envelope" },
    defaultThemePreset: "wedding", detailsPresentation: "romantic", galleryPresentation: "romantic", composition: "romantic-envelope",
    pageRenderer: { kind: "custom", componentId: "romantic-envelope" },
    defaultBlockTypes: [
      "interactive_envelope", "romantic_hero", "countdown", "story", "schedule", "location_map",
      "details", "gallery", "music", "action_portal",
    ],
    supportedBlockTypes: ROMANTIC_SUPPORTED_BLOCKS,
    requiredBlockTypes: [
      "interactive_envelope", "romantic_hero", "countdown", "story", "schedule", "location_map",
    ],
    supportedCustomizations: STANDARD_CUSTOMIZATIONS,
    supportedEffects: ["envelope-reveal", "scroll-reveal", "falling-petals"],
    defaultEffects: [
      { type: "envelope-reveal", enabled: true, transitionDurationMs: 1000 },
      { type: "scroll-reveal", enabled: false, durationMs: 500 },
      { type: "falling-petals", enabled: false, density: 6 },
    ],
  },
  "botanical-reverie": {
    id: "botanical-reverie", version: "1.0.0", name: "Botanical Reverie", category: "wedding",
    categoryLabel: "Wedding", description: "Layered garden stationery, editorial wedding details, and a tactile envelope reveal.",
    publicationStatus: "published", preview: { kind: "rendered-sample", sampleId: "botanical-reverie" },
    defaultThemePreset: "botanical", detailsPresentation: "botanical", galleryPresentation: "botanical", composition: "botanical-reverie",
    pageRenderer: { kind: "custom", componentId: "botanical-reverie" },
    defaultBlockTypes: [
      "interactive_envelope", "romantic_hero", "countdown", "story", "details", "schedule",
      "location_map", "gallery", "music", "action_portal",
    ],
    supportedBlockTypes: ROMANTIC_SUPPORTED_BLOCKS,
    requiredBlockTypes: ["interactive_envelope", "romantic_hero", "countdown", "story", "details", "schedule", "location_map"],
    supportedCustomizations: STANDARD_CUSTOMIZATIONS,
    supportedEffects: ["envelope-reveal", "scroll-reveal", "falling-petals"],
    defaultEffects: [
      { type: "envelope-reveal", enabled: true, transitionDurationMs: 900 },
      { type: "scroll-reveal", enabled: true, durationMs: 650 },
      { type: "falling-petals", enabled: true, density: 4 },
    ],
  },
  "birthday-bold": {
    id: "birthday-bold", version: "1.0.0", name: "Bold Celebration", category: "birthday",
    categoryLabel: "Birthday Celebration", description: "Joyful bright color blocks, tilted sticker frames, polaroid gallery, and chunky party cards.",
    publicationStatus: "published", preview: { kind: "rendered-sample", sampleId: "birthday-bold" },
    defaultThemePreset: "birthday", detailsPresentation: "birthday", galleryPresentation: "birthday", composition: "standard", pageRenderer: { kind: "blocks" }, defaultBlockTypes: STANDARD_BLOCKS,
    supportedBlockTypes: STANDARD_SUPPORTED_BLOCKS,
    requiredBlockTypes: ["countdown"], supportedCustomizations: STANDARD_CUSTOMIZATIONS,
    supportedEffects: ["scroll-reveal"], defaultEffects: [],
  },
  cover: {
    id: "cover", version: "1.0.0", name: "Cover Story", category: "universal",
    categoryLabel: "Cover", description: "Full-bleed event photo with live title, host, date, and venue text.",
    publicationStatus: "published", preview: { kind: "rendered-sample", sampleId: "cover" },
    defaultThemePreset: "cover", detailsPresentation: "cover", galleryPresentation: "cover", composition: "standard", pageRenderer: { kind: "blocks" }, defaultBlockTypes: STANDARD_BLOCKS_WITHOUT_COUNTDOWN,
    supportedBlockTypes: STANDARD_SUPPORTED_BLOCKS,
    requiredBlockTypes: [], supportedCustomizations: STANDARD_CUSTOMIZATIONS, supportedEffects: [], defaultEffects: [],
  },
  "luxe-editorial": {
    id: "luxe-editorial", version: "1.0.0", name: "Luxe Editorial", category: "wedding",
    categoryLabel: "Wedding", description: "A refined, photo-led wedding invitation with layered stationery and an editorial gallery.",
    publicationStatus: "published", preview: { kind: "rendered-sample", sampleId: "luxe-editorial" },
    defaultThemePreset: "luxeEditorial", detailsPresentation: "luxe-editorial", galleryPresentation: "editorial",
    composition: "standard", pageRenderer: { kind: "custom", componentId: "luxe-editorial" },
    defaultBlockTypes: STANDARD_BLOCKS,
    supportedBlockTypes: STANDARD_SUPPORTED_BLOCKS,
    requiredBlockTypes: ["hero", "details", "countdown", "location_map", "action_portal"],
    supportedCustomizations: STANDARD_CUSTOMIZATIONS,
    supportedEffects: ["scroll-reveal"], defaultEffects: [{ type: "scroll-reveal", enabled: true, durationMs: 650 }],
  },
} as const satisfies Record<string, InvitationTemplateDefinition>;

export type InvitationTemplateId = keyof typeof INVITATION_TEMPLATE_REGISTRY;

/** Exact stable-ID lookup. Unknown IDs remain distinguishable for graceful fallback. */
export function getInvitationTemplateDefinition(
  id: string | null | undefined
): InvitationTemplateDefinition | undefined {
  if (!id || !Object.prototype.hasOwnProperty.call(INVITATION_TEMPLATE_REGISTRY, id)) return undefined;
  return INVITATION_TEMPLATE_REGISTRY[id as InvitationTemplateId];
}

export const DEFAULT_INVITATION_TEMPLATE_ID: InvitationTemplateId = "gala-editorial";

export function getDefaultInvitationTemplateDefinition(): InvitationTemplateDefinition {
  return INVITATION_TEMPLATE_REGISTRY[DEFAULT_INVITATION_TEMPLATE_ID];
}
