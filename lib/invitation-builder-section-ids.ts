import { getInvitationTemplateManifest } from "./invitation-template-manifests.ts";

export const BUILDER_SECTION_IDS = [
  "type",
  "template",
  "design",
  "basics",
  "hero",
  "story",
  "details",
  "evergreen",
  "photos",
  "gallery",
  "music",
  "extras",
  "template-fields",
  "publish",
] as const;

export type BuilderSectionId = (typeof BUILDER_SECTION_IDS)[number];

/**
 * Real section-selection logic used by InvitationPageBuilder.
 * Manifest templates render exactly their declared sections (filtered to known ids).
 * Templates without a manifest keep the static list.
 */
export function getBuilderSectionIds(templateId: string | null | undefined): BuilderSectionId[] {
  const manifest = getInvitationTemplateManifest(templateId);
  if (manifest) {
    const known = new Set<string>(BUILDER_SECTION_IDS);
    return (manifest.sections as readonly string[]).filter((id): id is BuilderSectionId => known.has(id));
  }
  return BUILDER_SECTION_IDS.filter(
    (id) => (id !== "photos" && id !== "evergreen") || templateId === "evergreen-envelope"
  );
}
