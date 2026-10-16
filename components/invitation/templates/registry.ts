/**
 * components/invitation/templates/registry.ts
 *
 * Aldriva Invitation Template Catalog
 * Data-only catalog for IDs, picker labels, categories, and descriptions.
 * Runtime page composition lives in lib/invitation-page-layout.ts and
 * InvitationBlocksLayoutClient; this catalog does not map templates to TSX.
 *
 * Supported Categories:
 *  - gala_corporate: "Gala & Corporate"
 *  - wedding: "Wedding"
 *  - birthday: "Birthday Celebration"
 */

export type TemplateCategory = "gala_corporate" | "wedding" | "birthday" | "universal";

export interface TemplateRegistryItem {
  id: string;
  name: string;
  category: TemplateCategory;
  categoryLabel: string;
  description: string;
}

export const INVITATION_CATEGORIES: Record<TemplateCategory, { label: string; description: string }> = {
  gala_corporate: {
    label: "Gala & Corporate",
    description: "Refined editorial & black-tie aesthetics for galas, fundraisers, and corporate summits.",
  },
  wedding: {
    label: "Wedding",
    description: "Soft romantic aesthetics with calligraphic accents, arch frames, and wedding details.",
  },
  birthday: {
    label: "Birthday Celebration",
    description: "Joyful, energetic modern color blocks with polaroid galleries and chunky party cards.",
  },
  universal: {
    label: "Cover",
    description: "Full-bleed photo cover with live text, for any occasion.",
  },
};

export const INVITATION_TEMPLATES: TemplateRegistryItem[] = [
  {
    id: "gala-editorial",
    name: "Gala Editorial",
    category: "gala_corporate",
    categoryLabel: "Gala & Corporate",
    description: "Warm ivory and deep ink light editorial design with Cormorant Garamond serif.",
  },
  {
    id: "black-tie",
    name: "Black Tie",
    category: "gala_corporate",
    categoryLabel: "Gala & Corporate",
    description: "Dramatic dark zinc & amber-gold framed luxury composition with gold accents.",
  },
  {
    id: "wedding-romantic",
    name: "Romantic Wedding",
    category: "wedding",
    categoryLabel: "Wedding",
    description: "Soft blush and sage palette on cream with script accents, arch photo, and response card.",
  },
  {
    id: "romantic-envelope",
    name: "Romantic Envelope",
    category: "wedding",
    categoryLabel: "Wedding",
    description: "A cinematic envelope reveal followed by a full-screen wedding story and itinerary.",
  },
  {
    id: "birthday-bold",
    name: "Bold Celebration",
    category: "birthday",
    categoryLabel: "Birthday Celebration",
    description: "Joyful bright color blocks, tilted sticker frames, polaroid gallery, and chunky party cards.",
  },
  {
    id: "cover",
    name: "Cover Story",
    category: "universal",
    categoryLabel: "Cover",
    description: "Full-bleed event photo with live title, host, date, and venue text.",
  },
];

export function getTemplateById(id: string): TemplateRegistryItem {
  const found = INVITATION_TEMPLATES.find((t) => t.id === id);
  return found || INVITATION_TEMPLATES[0];
}

export function getTemplatesByCategory(category: TemplateCategory): TemplateRegistryItem[] {
  return INVITATION_TEMPLATES.filter((t) => t.category === category);
}
