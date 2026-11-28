/**
 * lib/invitation-template-registry.ts
 *
 * Code-owned invitation page definition registry.
 *
 * Kept as an empty minimal module so new templates can plug in by adding
 * entries to INVITATION_TEMPLATE_REGISTRY. All template definitions were
 * removed (fresh start); saved template_id values on events/pages now
 * resolve to undefined and render through the neutral fallback path.
 */
import type { PageThemePreset } from "@/lib/page-composition";

export const INVITATION_BLOCK_TYPES = [
  "hero", "story", "details", "countdown", "location_map", "schedule", "gallery", "music", "action_portal",
  "interactive_envelope", "romantic_envelope_gate", "romantic_hero",
] as const;
export type InvitationBlockType = (typeof INVITATION_BLOCK_TYPES)[number];

export type InvitationTemplateCategory = "gala_corporate" | "wedding" | "birthday" | "universal";
export type InvitationCustomization = "palette" | "fontPack" | "textScale";

export const INVITATION_DETAILS_PRESENTATIONS = [
  "editorial", "romantic", "botanical", "luxe-editorial", "black-tie", "birthday", "cover",
] as const;
export type InvitationDetailsPresentation = (typeof INVITATION_DETAILS_PRESENTATIONS)[number];

export const INVITATION_GALLERY_PRESENTATIONS = [
  "editorial", "romantic", "botanical", "black-tie", "birthday", "cover", "boho-coveflow", "accordion",
] as const;
export type InvitationGalleryPresentation = (typeof INVITATION_GALLERY_PRESENTATIONS)[number];

export type CustomInvitationPageComponentId = "minimalism-dark-blue" | "burgundy-gold";
export type InvitationPageRenderer =
  | { kind: "blocks" }
  | { kind: "custom"; componentId: CustomInvitationPageComponentId };

export function isInvitationGalleryPresentation(value: unknown): value is InvitationGalleryPresentation {
  return typeof value === "string" && (INVITATION_GALLERY_PRESENTATIONS as readonly string[]).includes(value);
}

export type InvitationEffectType = "envelope-reveal" | "scroll-reveal" | "falling-petals";
export const INVITATION_EFFECT_TYPES: readonly InvitationEffectType[] = [
  "envelope-reveal", "scroll-reveal", "falling-petals",
];
export type InvitationEffectConfig =
  | { type: "envelope-reveal"; enabled: boolean; transitionDurationMs: number }
  | { type: "scroll-reveal"; enabled: boolean; durationMs: number }
  | { type: "falling-petals"; enabled: boolean; density: number };

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
  "parents_line", "dress_code_swatches", "adults_only_note", "monogram_initials", "album_url",
  "show_wishing_well", "show_adults_only", "envelope_photo_url", "envelope_photo_two_url", "cover_photo_url",
  "polaroid_photo_one_url", "polaroid_photo_two_url", "story_photo_one_url", "story_photo_two_url",
  "closing_photo_url", "rsvp_photo_url", "photo_focal_points",
] as const;

export type InvitationBindingPath = (typeof INVITATION_BINDING_PATHS)[number];

export interface InvitationTemplateDefinition {
  id: string;
  version: string;
  name: string;
  category: InvitationTemplateCategory;
  categoryLabel: string;
  description: string;
  publicationStatus: "published" | "unlisted" | "retired";
  preview: { kind: "rendered-sample"; sampleId: string };
  defaultThemePreset: PageThemePreset;
  detailsPresentation: InvitationDetailsPresentation;
  galleryPresentation?: InvitationGalleryPresentation;
  composition: "standard" | "romantic-envelope" | "botanical-reverie" | "evergreen-envelope" | "minimalism-dark-blue" | "burgundy-gold";
  defaultBlockTypes: readonly InvitationBlockType[];
  supportedBlockTypes: readonly InvitationBlockType[];
  requiredBlockTypes: readonly InvitationBlockType[];
  supportedCustomizations: Readonly<Record<InvitationCustomization, boolean>>;
  pageRenderer: InvitationPageRenderer;
  supportedEffects: readonly InvitationEffectType[];
  defaultEffects: readonly InvitationEffectConfig[];
}

export function defaultInvitationEffectConfig(type: InvitationEffectType): InvitationEffectConfig {
  switch (type) {
    case "envelope-reveal": return { type, enabled: true, transitionDurationMs: 1000 };
    case "scroll-reveal": return { type, enabled: false, durationMs: 500 };
    case "falling-petals": return { type, enabled: false, density: 6 };
  }
}

export const INVITATION_BINDING_PATH_SET = new Set<string>(INVITATION_BINDING_PATHS);

/** Empty registry — no templates ship with the platform. New templates plug in here. */
export const INVITATION_TEMPLATE_REGISTRY: Record<string, InvitationTemplateDefinition> = {
  "minimalism-dark-blue": {
    id: "minimalism-dark-blue", version: "1.0.0", name: "Minimalism Dark Blue", category: "wedding",
    categoryLabel: "Wedding", description: "Navy card panels, dusty-blue hydrangea illustrations, and a tap-to-open cover gate.",
    publicationStatus: "published", preview: { kind: "rendered-sample", sampleId: "minimalism-dark-blue" },
    defaultThemePreset: "minimalismDarkBlue", detailsPresentation: "editorial", galleryPresentation: "boho-coveflow",
    composition: "minimalism-dark-blue",
    pageRenderer: { kind: "custom", componentId: "minimalism-dark-blue" },
    defaultBlockTypes: ["interactive_envelope", "romantic_hero", "details", "countdown", "schedule", "location_map", "gallery", "music", "action_portal"],
    supportedBlockTypes: ["interactive_envelope", "romantic_hero", "hero", "story", "details", "countdown", "location_map", "schedule", "gallery", "music", "action_portal"],
    requiredBlockTypes: ["interactive_envelope", "romantic_hero", "details", "countdown", "schedule", "location_map"],
    supportedCustomizations: { palette: true, fontPack: true, textScale: true },
    supportedEffects: ["envelope-reveal", "scroll-reveal"],
    defaultEffects: [
      { type: "envelope-reveal", enabled: true, transitionDurationMs: 900 },
      { type: "scroll-reveal", enabled: false, durationMs: 650 },
    ],
  },
  "burgundy-gold": {
    id: "burgundy-gold", version: "1.0.0", name: "Burgundy Gold", category: "wedding",
    categoryLabel: "Wedding", description: "Deep burgundy panels with gold ornaments and an animated gift box.",
    publicationStatus: "published", preview: { kind: "rendered-sample", sampleId: "burgundy-gold" },
    defaultThemePreset: "burgundyGold", detailsPresentation: "editorial", galleryPresentation: "boho-coveflow",
    composition: "burgundy-gold",
    pageRenderer: { kind: "custom", componentId: "burgundy-gold" },
    // action_portal carries the RSVP block rendered inside the "Confirm presence" dialog.
    defaultBlockTypes: ["details", "action_portal"],
    supportedBlockTypes: ["hero", "story", "details", "countdown", "location_map", "schedule", "gallery", "music", "action_portal"],
    requiredBlockTypes: ["details"],
    supportedCustomizations: { palette: true, fontPack: true, textScale: true },
    supportedEffects: ["scroll-reveal"],
    defaultEffects: [{ type: "scroll-reveal", enabled: false, durationMs: 650 }],
  },
};

export type InvitationTemplateId = string;

export function getInvitationTemplateDefinition(id: string | null | undefined): InvitationTemplateDefinition | undefined {
  if (!id) return undefined;
  return INVITATION_TEMPLATE_REGISTRY[id];
}

export const DEFAULT_INVITATION_TEMPLATE_ID: InvitationTemplateId = "minimalism-dark-blue";

export function resolveInvitationTemplateId(id: string | null | undefined): InvitationTemplateId {
  const definition = getInvitationTemplateDefinition(id);
  return definition ? (definition.id as InvitationTemplateId) : DEFAULT_INVITATION_TEMPLATE_ID;
}

export function isValidInvitationBindingPath(value: string): value is InvitationBindingPath {
  return INVITATION_BINDING_PATH_SET.has(value);
}
