/**
 * components/invitation/templates/registry.ts
 *
 * Aldriva Invitation Page Template Registry
 * Maps category -> templates.
 *
 * Supported Categories:
 *  - gala_corporate: "Gala & Corporate"
 *  - wedding: "Wedding"
 *  - birthday: "Birthday Celebration"
 */

import React from "react";
import { InvitationPageData } from "@/types/invitation-template";
import { InvitationTemplate1 as GalaEditorialTemplate } from "./InvitationTemplate1";
import { InvitationTemplateBlackTie } from "./InvitationTemplateBlackTie";
import { InvitationTemplateWedding } from "./InvitationTemplateWedding";
import { InvitationTemplateBirthday } from "./InvitationTemplateBirthday";
import { InvitationTemplateCover } from "./InvitationTemplateCover";

export type TemplateCategory = "gala_corporate" | "wedding" | "birthday" | "universal";

export interface TemplateRegistryItem {
  id: string;
  name: string;
  category: TemplateCategory;
  categoryLabel: string;
  description: string;
  component: React.ComponentType<{
    data: InvitationPageData;
    onRsvp?: (response: "accepted" | "declined") => Promise<void>;
    className?: string;
    /**
     * General share-link mode: guest-only blocks (personal greeting,
     * RSVP, entry pass) render as a neutral note instead. No guest data.
     */
    shared?: boolean;
  }>;
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
    component: GalaEditorialTemplate,
  },
  {
    id: "black-tie",
    name: "Black Tie",
    category: "gala_corporate",
    categoryLabel: "Gala & Corporate",
    description: "Dramatic dark zinc & amber-gold framed luxury composition with gold accents.",
    component: InvitationTemplateBlackTie,
  },
  {
    id: "wedding-romantic",
    name: "Romantic Wedding",
    category: "wedding",
    categoryLabel: "Wedding",
    description: "Soft blush and sage palette on cream with script accents, arch photo, and response card.",
    component: InvitationTemplateWedding,
  },
  {
    id: "birthday-bold",
    name: "Bold Celebration",
    category: "birthday",
    categoryLabel: "Birthday Celebration",
    description: "Joyful bright color blocks, tilted sticker frames, polaroid gallery, and chunky party cards.",
    component: InvitationTemplateBirthday,
  },
  {
    id: "cover",
    name: "Cover Story",
    category: "universal",
    categoryLabel: "Cover",
    description: "Full-bleed event photo with live title, host, date, and venue text.",
    component: InvitationTemplateCover,
  },
];

export function getTemplateById(id: string): TemplateRegistryItem {
  const found = INVITATION_TEMPLATES.find((t) => t.id === id);
  return found || INVITATION_TEMPLATES[0];
}

export function getTemplatesByCategory(category: TemplateCategory): TemplateRegistryItem[] {
  return INVITATION_TEMPLATES.filter((t) => t.category === category);
}
