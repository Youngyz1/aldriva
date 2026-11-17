/**
 * lib/invitation-type-fields.ts
 *
 * Pure derivation helpers for the one-page invitation builder:
 * invitation type -> default template, template grouping, type-specific
 * field visibility, and template-switch hidden-content detection.
 *
 * Visibility is derived; data is never deleted by switching type or
 * template — hidden fields stay stored (nullable columns) and reappear
 * when their type/template returns.
 */

import type { InvitationTemplateCategory as TemplateCategory } from "@/lib/invitation-template-registry";
import { getInvitationTemplateManifest, readManifestStorage, resolveManifestLabel } from "@/lib/invitation-template-manifests";

/** First-screen choice of the builder (and of the future Create flow). */
export type InvitationType = "wedding" | "birthday" | "gala" | "other";

export const INVITATION_TYPES: { id: InvitationType; label: string; hint: string }[] = [
  { id: "wedding", label: "Wedding", hint: "Couple, ceremony & celebration" },
  { id: "birthday", label: "Birthday", hint: "Celebrant, party & fun" },
  { id: "gala", label: "Gala", hint: "Formal, corporate & fundraisers" },
  { id: "other", label: "Other", hint: "Generic fields, any template" },
];

/** No templates ship with the platform, so no default template per type. */
export const DEFAULT_TEMPLATE_FOR_TYPE: Record<InvitationType, string> = {
  wedding: "",
  birthday: "",
  gala: "",
  other: "",
};

/** Recover the builder type from the saved page template when reopening. */
export function invitationTypeForTemplate(templateId?: string | null): InvitationType {
  const manifest = getInvitationTemplateManifest(templateId);
  if (manifest?.invitationType) return manifest.invitationType;
  return "other";
}

export type TypeFieldKey =
  | "partner1_name"
  | "partner2_name"
  | "family_note"
  | "wedding_subtype"
  | "registry_note"
  | "venues"
  | "accommodations"
  | "colors_of_the_day"
  | "celebrant_name"
  | "age_milestone"
  | "theme"
  | "gift_note";

export const TYPE_FIELD_LABELS: Record<TypeFieldKey, string> = {
  partner1_name: "Partner 1 name",
  partner2_name: "Partner 2 name",
  family_note: "Family note",
  wedding_subtype: "Wedding subtype",
  registry_note: "Registry note",
  venues: "Ceremony & reception venues",
  accommodations: "Accommodations",
  colors_of_the_day: "Colors of the day",
  celebrant_name: "Celebrant name",
  age_milestone: "Age milestone",
  theme: "Party theme",
  gift_note: "Gift note",
};

const WEDDING_FIELDS: TypeFieldKey[] = [
  "partner1_name",
  "partner2_name",
  "family_note",
  "wedding_subtype",
  "registry_note",
  "venues",
  "accommodations",
  "colors_of_the_day",
];

const BIRTHDAY_FIELDS: TypeFieldKey[] = [
  "celebrant_name",
  "age_milestone",
  "theme",
  "gift_note",
];

/** Type-specific extras visible for a builder type choice. */
export function extrasForType(type: InvitationType | null | undefined): TypeFieldKey[] {
  if (type === "wedding") return WEDDING_FIELDS;
  if (type === "birthday") return BIRTHDAY_FIELDS;
  return [];
}

/** No templates exist, so no template-specific fields. */
export function extrasForTemplate(): TypeFieldKey[] {
  return [];
}

export interface TemplateGroupOption {
  id: string;
  name: string;
  category: TemplateCategory;
  categoryLabel: string;
  description: string;
}

/**
 * Orders templates for the dropdown: templates whose category matches the
 * chosen type first, then the rest under "All templates". "Other" (and no
 * choice yet) shows everything in a single "All templates" group.
 */
export function orderTemplatesForType<T extends { category: TemplateCategory }>(
  templates: T[],
  type: InvitationType | null | undefined
): { matching: T[]; others: T[] } {
  const want: TemplateCategory | null =
    type === "wedding"
      ? "wedding"
      : type === "birthday"
        ? "birthday"
        : type === "gala"
          ? "gala_corporate"
          : null;
  if (!want) return { matching: [], others: [...templates] };
  return {
    matching: templates.filter((t) => t.category === want),
    others: templates.filter((t) => t.category !== want),
  };
}

function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Lists the human-readable labels of type-specific fields that hold content
 * in `draft` but would be hidden by switching from `fromTemplateId` to
 * `toTemplateId`. Empty array = safe switch, no warning needed.
 */
export function hiddenContentOnTemplateSwitch(
  draft: Record<string, unknown>,
  fromTemplateId: string | null | undefined,
  toTemplateId: string | null | undefined
): string[] {
  if (!fromTemplateId || !toTemplateId || fromTemplateId === toTemplateId) return [];
  const fromFields = new Set(extrasForTemplate());
  const toFields = new Set(extrasForTemplate());
  const hidden: string[] = [];
  for (const key of fromFields) {
    if (!toFields.has(key) && hasContent(draft[key])) {
      hidden.push(TYPE_FIELD_LABELS[key]);
    }
  }

  const fromManifest = getInvitationTemplateManifest(fromTemplateId);
  const toManifest = getInvitationTemplateManifest(toTemplateId);
  if (fromManifest) {
    // Preserve existing minimalism warning text and behavior.
    if (fromTemplateId === "minimalism-dark-blue" && toTemplateId !== "minimalism-dark-blue") {
      const blocksLayout = draft.blocks_layout;
      const td = typeof blocksLayout === "object" && blocksLayout !== null && !Array.isArray(blocksLayout)
        ? (blocksLayout as Record<string, unknown>).template_data
        : null;
      const tdr = typeof td === "object" && td !== null && !Array.isArray(td) ? (td as Record<string, unknown>) : {};
      const manifestKeys = [
        "mf_parent_one_label","mf_parent_one_name_one","mf_parent_one_name_two",
        "mf_parent_two_label","mf_parent_two_name_one","mf_parent_two_name_two",
        "mf_hero_photos","mf_hero_eyebrow","mf_invitation_line","mf_dress_code_swatches",
      ];
      const hasManifestContent = manifestKeys.some((k) => hasContent(tdr[k]))
        || hasContent(draft.partner1_name) || hasContent(draft.partner2_name);
      if (hasManifestContent) hidden.push("Template fields (names, photos, parents, details)");
    }

    const toStorageKeys = new Set(
      (toManifest?.fields ?? []).map((f) =>
        f.storage.kind === "column" ? `col:${f.storage.column}` : `td:${f.storage.path}`
      )
    );
    for (const field of fromManifest.fields) {
      const key = field.storage.kind === "column" ? `col:${field.storage.column}` : `td:${field.storage.path}`;
      if (toStorageKeys.has(key)) continue;
      const value = readManifestStorage(draft, field.storage);
      if (!hasContent(value)) continue;
      const label = resolveManifestLabel(field.label, undefined, "en");
      if (!hidden.includes(label)) hidden.push(label);
    }
  }
  return hidden;
}
