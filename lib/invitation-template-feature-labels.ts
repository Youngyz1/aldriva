/**
 * Maps a public template summary's supported block types / effects /
 * customizations to a bounded, ordered list of translation keys under the
 * "InvitationMarketplace" message namespace — for display as feature tags
 * on the public gallery and details pages.
 *
 * Pure, no i18n import: callers translate the returned keys with their own
 * useTranslations/getTranslations instance.
 */
import type { PublicTemplateSummary } from "@/lib/invitation-template-public-catalog";
import type { InvitationTemplateCategory } from "@/lib/invitation-template-registry";

export type InvitationCategoryTranslationKey =
  | "categoryGalaCorporate"
  | "categoryWedding"
  | "categoryBirthday"
  | "categoryUniversal";

export const CATEGORY_TRANSLATION_KEYS: Readonly<Record<InvitationTemplateCategory, InvitationCategoryTranslationKey>> = {
  gala_corporate: "categoryGalaCorporate",
  wedding: "categoryWedding",
  birthday: "categoryBirthday",
  universal: "categoryUniversal",
};

export type InvitationFeatureTagKey =
  | "featureCountdown"
  | "featurePhotoGallery"
  | "featureRsvp"
  | "featureLocationMap"
  | "featureSchedule"
  | "featureMusic"
  | "featureInteractiveEnvelope"
  | "featureScrollAnimations"
  | "featureEnvelopeReveal"
  | "featureFallingPetals"
  | "featureCustomColors"
  | "featureCustomFonts"
  | "featureAdjustableTextSize";

/** Ordered so the most visually distinctive features surface first. */
export function getPublicTemplateFeatureTags(summary: PublicTemplateSummary): InvitationFeatureTagKey[] {
  const { blockTypes, effects, customizations } = summary.features;
  const tags: InvitationFeatureTagKey[] = [];

  if (effects.includes("envelope-reveal")) tags.push("featureEnvelopeReveal");
  if (blockTypes.includes("interactive_envelope") || blockTypes.includes("romantic_hero")) {
    tags.push("featureInteractiveEnvelope");
  }
  if (blockTypes.includes("countdown")) tags.push("featureCountdown");
  if (blockTypes.includes("gallery")) tags.push("featurePhotoGallery");
  if (blockTypes.includes("location_map")) tags.push("featureLocationMap");
  if (blockTypes.includes("schedule")) tags.push("featureSchedule");
  if (blockTypes.includes("action_portal")) tags.push("featureRsvp");
  if (blockTypes.includes("music")) tags.push("featureMusic");
  if (effects.includes("falling-petals")) tags.push("featureFallingPetals");
  if (effects.includes("scroll-reveal")) tags.push("featureScrollAnimations");
  if (customizations.palette) tags.push("featureCustomColors");
  if (customizations.fontPack) tags.push("featureCustomFonts");
  if (customizations.textScale) tags.push("featureAdjustableTextSize");

  return tags;
}
