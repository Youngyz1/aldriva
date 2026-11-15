/**
 * Public-safe view of the code-owned invitation template registry.
 *
 * Reads directly from INVITATION_TEMPLATE_REGISTRY — no second data source.
 * Exposes only fields safe for an unauthenticated browsing surface (stable
 * id, display copy, category, supported features, sample-preview
 * reference). Never includes user data, event data, ownership fields, or
 * internal implementation details (e.g. which React component renders a
 * "custom" template).
 */
import {
  INVITATION_TEMPLATE_REGISTRY,
  type InvitationTemplateId,
  type InvitationTemplateCategory,
  type InvitationBlockType,
  type InvitationEffectType,
  type InvitationCustomization,
} from "@/lib/invitation-template-registry";

export interface PublicTemplateFeatures {
  blockTypes: readonly InvitationBlockType[];
  effects: readonly InvitationEffectType[];
  customizations: Readonly<Record<InvitationCustomization, boolean>>;
}

export interface PublicTemplateSummary {
  id: InvitationTemplateId;
  name: string;
  description: string;
  category: InvitationTemplateCategory;
  categoryLabel: string;
  features: PublicTemplateFeatures;
  preview: { kind: "rendered-sample"; sampleId: string };
}

function toPublicSummary(id: InvitationTemplateId): PublicTemplateSummary {
  const definition = INVITATION_TEMPLATE_REGISTRY[id];
  return {
    id,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    categoryLabel: definition.categoryLabel,
    features: {
      blockTypes: definition.supportedBlockTypes,
      effects: definition.supportedEffects,
      customizations: definition.supportedCustomizations,
    },
    preview: definition.preview,
  };
}

/** All publicly browsable templates (publicationStatus "published" only). */
export function getPublicTemplateCatalog(): PublicTemplateSummary[] {
  return (Object.keys(INVITATION_TEMPLATE_REGISTRY) as InvitationTemplateId[])
    .filter((id) => (INVITATION_TEMPLATE_REGISTRY[id].publicationStatus as string) === "published")
    .map(toPublicSummary);
}

/** Single public-safe summary by stable id. Undefined for unknown or non-published ids. */
export function getPublicTemplateSummary(id: string | null | undefined): PublicTemplateSummary | undefined {
  if (!id || !Object.prototype.hasOwnProperty.call(INVITATION_TEMPLATE_REGISTRY, id)) return undefined;
  const templateId = id as InvitationTemplateId;
  if ((INVITATION_TEMPLATE_REGISTRY[templateId].publicationStatus as string) !== "published") return undefined;
  return toPublicSummary(templateId);
}

/**
 * Demo-route-only summary by stable id. Unlike getPublicTemplateSummary, this
 * also resolves "unlisted" templates (built but not yet in the public
 * gallery) so their showcase demo page stays reachable by direct link.
 * Still undefined for "retired" or unknown ids. Do not use this for the
 * gallery, template details page, or anonymous event creation — those must
 * stay "published" only.
 */
export function getDemoTemplateSummary(id: string | null | undefined): PublicTemplateSummary | undefined {
  if (!id || !Object.prototype.hasOwnProperty.call(INVITATION_TEMPLATE_REGISTRY, id)) return undefined;
  const templateId = id as InvitationTemplateId;
  const status = INVITATION_TEMPLATE_REGISTRY[templateId].publicationStatus as string;
  if (status !== "published" && status !== "unlisted") return undefined;
  return toPublicSummary(templateId);
}

/** Categories present among published templates, de-duplicated in registry order. */
export function getPublicTemplateCategories(): InvitationTemplateCategory[] {
  const seen = new Set<InvitationTemplateCategory>();
  for (const summary of getPublicTemplateCatalog()) seen.add(summary.category);
  return Array.from(seen);
}
