/**
 * lib/invitation-template-manifests.ts
 *
 * Per-template field manifests for the invitation builder.
 * Pure module (no React, no server-only APIs) — safe for client and server.
 *
 * When a template declares a manifest, the builder renders its sections/fields
 * from that declaration instead of the static type-gated sections. Templates
 * without a manifest keep the legacy static builder behavior unchanged.
 */

export type ManifestBuilderSection =
  | "type"
  | "template"
  | "design"
  | "basics"
  | "template-fields"
  | "details"
  | "gallery"
  | "music"
  | "publish"
  // legacy/static sections a manifest may still reference if needed
  | "hero"
  | "story"
  | "extras"
  | "photos"
  | "evergreen";

export type ManifestFieldType = "text" | "textarea" | "image-list" | "color-list" | "toggle";

export type ManifestStorage =
  | { kind: "column"; column: string }
  | { kind: "template_data"; path: string };

export interface ManifestLabel {
  /** i18n key in messages (Events namespace) when present, else used as fallback text */
  key?: string;
  en: string;
  fr: string;
}

export interface ManifestField {
  key: string;
  group: string;
  groupLabel: ManifestLabel;
  type: ManifestFieldType;
  label: ManifestLabel;
  required?: boolean;
  /** image-list / color-list */
  min?: number;
  max?: number;
  /** text / textarea */
  maxLength?: number;
  /** toggle: checked state when the stored value is absent/null. */
  defaultValue?: boolean;
  /** Optional short helper rendered under the control. */
  helper?: ManifestLabel;
  /** image-list slot labels (index-aligned) */
  slotLabels?: ManifestLabel[];
  storage: ManifestStorage;
  /** Sample/default value for preview fallbacks and UI hints */
  sampleValue?: unknown;
}

export interface TemplateManifest {
  templateId: string;
  /** Fixed invitation type for this template; drives the Type control. */
  invitationType: "wedding" | "birthday" | "gala" | "other";
  sections: ManifestBuilderSection[];
  fields: ManifestField[];
  /** Declared only for now; the template does not consume them yet. */
  themeControls: { palette: boolean; fontPack: boolean; textScale: boolean };
  /** Builder/content limits for manifest-driven sections. */
  venues?: { max: number };
  schedule?: { enabled: boolean; max: number };
}

const MINIMALISM_DARK_BLUE_MANIFEST: TemplateManifest = {
  templateId: "minimalism-dark-blue",
  invitationType: "wedding",
  sections: ["type", "template", "design", "basics", "template-fields", "details", "gallery", "music", "publish"],
  themeControls: { palette: true, fontPack: true, textScale: true },
  venues: { max: 3 },
  schedule: { enabled: true, max: 15 },
  fields: [
    {
      key: "partner1_name",
      group: "couple",
      groupLabel: { key: "manifestGroupCouple", en: "Couple", fr: "Couple" },
      type: "text",
      label: { key: "manifestPartner1Name", en: "Partner 1 name", fr: "Prénom du partenaire 1" },
      required: false,
      maxLength: 100,
      storage: { kind: "column", column: "partner1_name" },
      sampleValue: "Nora Hale",
    },
    {
      key: "partner2_name",
      group: "couple",
      groupLabel: { key: "manifestGroupCouple", en: "Couple", fr: "Couple" },
      type: "text",
      label: { key: "manifestPartner2Name", en: "Partner 2 name", fr: "Prénom du partenaire 2" },
      required: false,
      maxLength: 100,
      storage: { kind: "column", column: "partner2_name" },
      sampleValue: "Theo Reyes",
    },
    {
      key: "mf_parent_one_label",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentOneLabel", en: "Partner 1 parents label", fr: "Libellé parents partenaire 1" },
      maxLength: 80,
      storage: { kind: "template_data", path: "mf_parent_one_label" },
      sampleValue: "Mr. and Mrs.",
    },
    {
      key: "mf_parent_one_name_one",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentOneNameOne", en: "Partner 1 — parent 1", fr: "Partenaire 1 — parent 1" },
      maxLength: 120,
      storage: { kind: "template_data", path: "mf_parent_one_name_one" },
      sampleValue: "Gabriel Hale",
    },
    {
      key: "mf_parent_one_name_two",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentOneNameTwo", en: "Partner 1 — parent 2", fr: "Partenaire 1 — parent 2" },
      maxLength: 120,
      storage: { kind: "template_data", path: "mf_parent_one_name_two" },
      sampleValue: "Noemi Hale",
    },
    {
      key: "mf_parent_two_label",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentTwoLabel", en: "Partner 2 parents label", fr: "Libellé parents partenaire 2" },
      maxLength: 80,
      storage: { kind: "template_data", path: "mf_parent_two_label" },
      sampleValue: "Mr. and Mrs.",
    },
    {
      key: "mf_parent_two_name_one",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentTwoNameOne", en: "Partner 2 — parent 1", fr: "Partenaire 2 — parent 1" },
      maxLength: 120,
      storage: { kind: "template_data", path: "mf_parent_two_name_one" },
      sampleValue: "Felix Reyes",
    },
    {
      key: "mf_parent_two_name_two",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentTwoNameTwo", en: "Partner 2 — parent 2", fr: "Partenaire 2 — parent 2" },
      maxLength: 120,
      storage: { kind: "template_data", path: "mf_parent_two_name_two" },
      sampleValue: "Camille Reyes",
    },
    {
      key: "mf_hero_photos",
      group: "hero",
      groupLabel: { key: "manifestGroupHeroPhotos", en: "Hero photos", fr: "Photos d’en-tête" },
      type: "image-list",
      label: { key: "manifestHeroPhotos", en: "Hero photos", fr: "Photos d’en-tête" },
      min: 1,
      max: 2,
      slotLabels: [
        { key: "manifestHeroPhotoLarge", en: "Large photo", fr: "Grande photo" },
        { key: "manifestHeroPhotoSmall", en: "Small photo", fr: "Petite photo" },
      ],
      storage: { kind: "template_data", path: "mf_hero_photos" },
      sampleValue: [],
    },
    {
      key: "mf_hero_eyebrow",
      group: "hero-text",
      groupLabel: { key: "manifestGroupHeroText", en: "Hero text", fr: "Texte d’en-tête" },
      type: "text",
      label: { key: "manifestHeroEyebrow", en: "Eyebrow text", fr: "Texte d’accroche" },
      maxLength: 120,
      storage: { kind: "template_data", path: "mf_hero_eyebrow" },
      sampleValue: "Our Wedding",
    },
    {
      key: "mf_invitation_line",
      group: "hero-text",
      groupLabel: { key: "manifestGroupHeroText", en: "Hero text", fr: "Texte d’en-tête" },
      type: "textarea",
      label: { key: "manifestInvitationLine", en: "Invitation line", fr: "Ligne d’invitation" },
      maxLength: 240,
      storage: { kind: "template_data", path: "mf_invitation_line" },
      sampleValue: "Together with their families, invite you to celebrate their marriage.",
    },
    {
      key: "mf_dress_code_swatches",
      group: "dress-code",
      groupLabel: { key: "manifestGroupDressCode", en: "Dress code", fr: "Code vestimentaire" },
      type: "color-list",
      label: { key: "manifestDressCodeSwatches", en: "Color swatches", fr: "Nuanciers de couleur" },
      min: 0,
      max: 5,
      storage: { kind: "template_data", path: "mf_dress_code_swatches" },
      sampleValue: [
        { name: "Midnight", hex: "#14305a" },
        { name: "Dusty Blue", hex: "#5b7da6" },
        { name: "Ivory", hex: "#f3efe4" },
      ],
    },
    {
      key: "show_guestbook",
      group: "guestbook",
      groupLabel: { key: "manifestGroupGuestbook", en: "Guestbook", fr: "Livre d’or" },
      type: "toggle",
      label: { key: "manifestShowGuestbook", en: "Show guestbook section", fr: "Afficher la section livre d’or" },
      storage: { kind: "template_data", path: "show_guestbook" },
      defaultValue: true,
      sampleValue: true,
    },
    {
      key: "mf_show_memories",
      group: "memories",
      groupLabel: { key: "manifestGroupMemories", en: "Memories", fr: "Souvenirs" },
      type: "toggle",
      label: {
        key: "manifestShowMemories",
        en: "Show guest memories on this invitation",
        fr: "Afficher les souvenirs des invités sur cette invitation",
      },
      helper: {
        key: "manifestShowMemoriesHelper",
        en: "Only photos you approved appear.",
        fr: "Seules les photos que vous avez approuvées apparaissent.",
      },
      storage: { kind: "template_data", path: "mf_show_memories" },
      defaultValue: false,
      sampleValue: false,
    },
  ],
};

const BURGUNDY_GOLD_MANIFEST: TemplateManifest = {
  templateId: "burgundy-gold",
  invitationType: "wedding",
  sections: ["type", "template", "design", "basics", "template-fields", "details", "gallery", "music", "publish"],
  themeControls: { palette: true, fontPack: true, textScale: true },
  venues: { max: 3 },
  schedule: { enabled: true, max: 15 },
  fields: [
    {
      key: "partner1_name",
      group: "couple",
      groupLabel: { key: "manifestGroupCouple", en: "Couple", fr: "Couple" },
      type: "text",
      label: { key: "manifestPartner1Name", en: "Partner 1 name", fr: "Prénom du partenaire 1" },
      required: false,
      maxLength: 100,
      storage: { kind: "column", column: "partner1_name" },
      sampleValue: "Modou Gueye",
    },
    {
      key: "partner2_name",
      group: "couple",
      groupLabel: { key: "manifestGroupCouple", en: "Couple", fr: "Couple" },
      type: "text",
      label: { key: "manifestPartner2Name", en: "Partner 2 name", fr: "Prénom du partenaire 2" },
      required: false,
      maxLength: 100,
      storage: { kind: "column", column: "partner2_name" },
      sampleValue: "Ndeye Sarr",
    },
    {
      key: "mf_parent_one_label",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentOneLabel", en: "Partner 1 parents label", fr: "Libellé parents partenaire 1" },
      maxLength: 80,
      storage: { kind: "template_data", path: "mf_parent_one_label" },
      sampleValue: "Mr. and Mrs.",
    },
    {
      key: "mf_parent_one_name_one",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentOneNameOne", en: "Partner 1 — parent 1", fr: "Partenaire 1 — parent 1" },
      maxLength: 120,
      storage: { kind: "template_data", path: "mf_parent_one_name_one" },
      sampleValue: "",
    },
    {
      key: "mf_parent_one_name_two",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentOneNameTwo", en: "Partner 1 — parent 2", fr: "Partenaire 1 — parent 2" },
      maxLength: 120,
      storage: { kind: "template_data", path: "mf_parent_one_name_two" },
      sampleValue: "",
    },
    {
      key: "mf_parent_two_label",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentTwoLabel", en: "Partner 2 parents label", fr: "Libellé parents partenaire 2" },
      maxLength: 80,
      storage: { kind: "template_data", path: "mf_parent_two_label" },
      sampleValue: "Mr. and Mrs.",
    },
    {
      key: "mf_parent_two_name_one",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentTwoNameOne", en: "Partner 2 — parent 1", fr: "Partenaire 2 — parent 1" },
      maxLength: 120,
      storage: { kind: "template_data", path: "mf_parent_two_name_one" },
      sampleValue: "",
    },
    {
      key: "mf_parent_two_name_two",
      group: "parents",
      groupLabel: { key: "manifestGroupParents", en: "Parents", fr: "Parents" },
      type: "text",
      label: { key: "manifestParentTwoNameTwo", en: "Partner 2 — parent 2", fr: "Partenaire 2 — parent 2" },
      maxLength: 120,
      storage: { kind: "template_data", path: "mf_parent_two_name_two" },
      sampleValue: "",
    },
    {
      key: "mf_hero_eyebrow",
      group: "hero-text",
      groupLabel: { key: "manifestGroupHeroText", en: "Hero text", fr: "Texte d’en-tête" },
      type: "text",
      label: { key: "manifestHeroEyebrow", en: "Eyebrow text", fr: "Texte d’accroche" },
      maxLength: 120,
      storage: { kind: "template_data", path: "mf_hero_eyebrow" },
      sampleValue: "Le mariage de",
    },
    {
      key: "mf_invitation_line",
      group: "hero-text",
      groupLabel: { key: "manifestGroupHeroText", en: "Hero text", fr: "Texte d’en-tête" },
      type: "textarea",
      label: { key: "manifestInvitationLine", en: "Invitation line", fr: "Ligne d’invitation" },
      maxLength: 240,
      storage: { kind: "template_data", path: "mf_invitation_line" },
      sampleValue: "Together with their families, invite you to celebrate their marriage.",
    },
    {
      key: "mf_opening_photo",
      group: "opening",
      groupLabel: { key: "manifestGroupOpening", en: "Opening", fr: "Ouverture" },
      type: "image-list",
      label: { key: "manifestOpeningPhoto", en: "Opening photo", fr: "Photo d’ouverture" },
      min: 0,
      max: 1,
      storage: { kind: "template_data", path: "mf_opening_photo" },
      sampleValue: [],
    },
    {
      key: "mf_opening_message",
      group: "opening",
      groupLabel: { key: "manifestGroupOpening", en: "Opening", fr: "Ouverture" },
      type: "textarea",
      label: { key: "manifestOpeningMessage", en: "Opening message", fr: "Message d’ouverture" },
      maxLength: 240,
      storage: { kind: "template_data", path: "mf_opening_message" },
      sampleValue: "",
    },
    {
      key: "mf_dress_code_swatches",
      group: "dress-code",
      groupLabel: { key: "manifestGroupDressCode", en: "Dress code", fr: "Code vestimentaire" },
      type: "color-list",
      label: { key: "manifestDressCodeSwatches", en: "Color swatches", fr: "Nuanciers de couleur" },
      min: 0,
      max: 5,
      storage: { kind: "template_data", path: "mf_dress_code_swatches" },
      sampleValue: [],
    },
    {
      key: "show_guestbook",
      group: "guestbook",
      groupLabel: { key: "manifestGroupGuestbook", en: "Guestbook", fr: "Livre d’or" },
      type: "toggle",
      label: { key: "manifestShowGuestbook", en: "Show guestbook section", fr: "Afficher la section livre d’or" },
      storage: { kind: "template_data", path: "show_guestbook" },
      defaultValue: true,
      sampleValue: true,
    },
    {
      key: "mf_show_memories",
      group: "memories",
      groupLabel: { key: "manifestGroupMemories", en: "Memories", fr: "Souvenirs" },
      type: "toggle",
      label: {
        key: "manifestShowMemories",
        en: "Show guest memories on this invitation",
        fr: "Afficher les souvenirs des invités sur cette invitation",
      },
      helper: {
        key: "manifestShowMemoriesHelper",
        en: "Only photos you approved appear.",
        fr: "Seules les photos que vous avez approuvées apparaissent.",
      },
      storage: { kind: "template_data", path: "mf_show_memories" },
      defaultValue: false,
      sampleValue: false,
    },
  ],
};

const MANIFESTS: Record<string, TemplateManifest> = {
  [MINIMALISM_DARK_BLUE_MANIFEST.templateId]: MINIMALISM_DARK_BLUE_MANIFEST,
  [BURGUNDY_GOLD_MANIFEST.templateId]: BURGUNDY_GOLD_MANIFEST,
};

export function getInvitationTemplateManifest(templateId: string | null | undefined): TemplateManifest | null {
  if (!templateId) return null;
  return MANIFESTS[templateId] ?? null;
}

export function hasInvitationTemplateManifest(templateId: string | null | undefined): boolean {
  return Boolean(getInvitationTemplateManifest(templateId));
}

export function manifestBuilderSections(templateId: string | null | undefined): ManifestBuilderSection[] | null {
  return getInvitationTemplateManifest(templateId)?.sections ?? null;
}

/** Resolve a manifest label to a display string (client: pass `t` from useTranslations("Events")). */
export function resolveManifestLabel(
  label: ManifestLabel,
  t?: ((key: string) => string) | ((key: any) => string),
  locale: "en" | "fr" = "en"
): string {
  if (label.key && t) {
    try {
      const v = (t as (key: string) => string)(label.key);
      if (v && v !== label.key) return v;
    } catch {
      /* fall through */
    }
  }
  return locale === "fr" ? label.fr : label.en;
}

/** Read a storage target from a draft-like object. */
export function readManifestStorage(
  draft: Record<string, unknown>,
  storage: ManifestStorage
): unknown {
  if (storage.kind === "column") return draft[storage.column];
  const td = getTemplateData(draft);
  return td ? td[storage.path] : undefined;
}

/** Write a storage target into a draft patch (returns partial BuilderDraft-ish patch). */
export function writeManifestStorage(
  draft: Record<string, unknown>,
  storage: ManifestStorage,
  value: unknown
): Record<string, unknown> {
  if (storage.kind === "column") return { [storage.column]: value };
  const blocks = isRecord(draft.blocks_layout) ? { ...(draft.blocks_layout as Record<string, unknown>) } : {};
  const td = isRecord(blocks.template_data) ? { ...(blocks.template_data as Record<string, unknown>) } : {};
  td[storage.path] = value;
  blocks.template_data = td;
  return { blocks_layout: blocks as unknown };
}

export function getTemplateData(draft: Record<string, unknown>): Record<string, unknown> | null {
  const blocks = draft.blocks_layout;
  if (!isRecord(blocks)) return null;
  const td = (blocks as Record<string, unknown>).template_data;
  return isRecord(td) ? (td as Record<string, unknown>) : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function getManifestField(manifest: TemplateManifest, key: string): ManifestField | undefined {
  return manifest.fields.find((f) => f.key === key);
}

/** Collect manifest field storage paths for hidden-content detection on template switch. */
export function manifestStoredFieldKeys(manifest: TemplateManifest): string[] {
  return manifest.fields.map((f) => (f.storage.kind === "column" ? f.storage.column : `template_data.${f.storage.path}`));
}
