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

import {
  INVITATION_TEMPLATE_REGISTRY,
  type InvitationTemplateCategory,
} from "@/lib/invitation-template-registry";

export type TemplateCategory = InvitationTemplateCategory;

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

export const INVITATION_TEMPLATES: TemplateRegistryItem[] = Object.values(INVITATION_TEMPLATE_REGISTRY)
  .filter((template) => template.publicationStatus === "published")
  .map(({ id, name, category, categoryLabel, description }) => ({
    id,
    name,
    category,
    categoryLabel,
    description,
  }));

export function getTemplateById(id: string): TemplateRegistryItem {
  const found = INVITATION_TEMPLATES.find((t) => t.id === id);
  return found || INVITATION_TEMPLATES[0];
}

export function getTemplatesByCategory(category: TemplateCategory): TemplateRegistryItem[] {
  return INVITATION_TEMPLATES.filter((t) => t.category === category);
}
