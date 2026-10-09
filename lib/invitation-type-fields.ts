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

import type { TemplateCategory } from "@/components/invitation/templates/registry";

/** First-screen choice of the builder (and of the future Create flow). */
export type InvitationType = "wedding" | "birthday" | "gala" | "other";

export const INVITATION_TYPES: { id: InvitationType; label: string; hint: string }[] = [
  { id: "wedding", label: "Wedding", hint: "Couple, ceremony & celebration" },
  { id: "birthday", label: "Birthday", hint: "Celebrant, party & fun" },
  { id: "gala", label: "Gala", hint: "Formal, corporate & fundraisers" },
  { id: "other", label: "Other", hint: "Generic fields, any template" },
];

/** Suggested template when a type is picked (host can still choose any). */
export const DEFAULT_TEMPLATE_FOR_TYPE: Record<InvitationType, string> = {
  wedding: "wedding-romantic",
  birthday: "birthday-bold",
  gala: "gala-editorial",
  other: "gala-editorial",
};

/** Registry template category per template id (mirrors the registry). */
export const TEMPLATE_CATEGORY_BY_ID: Record<string, TemplateCategory> = {
  "gala-editorial": "gala_corporate",
  "black-tie": "gala_corporate",
  "wedding-romantic": "wedding",
  "birthday-bold": "birthday",
  cover: "universal",
};

export type TypeFieldKey =
  | "partner1_name"
  | "partner2_name"
  | "family_note"
  | "wedding_subtype"
  | "registry_note"
  | "venues"
  | "accommodations"
  | "colors_of_the_day"
  | "wedding_story"
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
  wedding_story: "Our story chapters",
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
  "wedding_story",
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

/** Type-specific extras visible for a template (by registry category). */
export function extrasForTemplate(templateId: string | null | undefined): TypeFieldKey[] {
  const category = (templateId && TEMPLATE_CATEGORY_BY_ID[templateId]) || null;
  if (category === "wedding") return WEDDING_FIELDS;
  if (category === "birthday") return BIRTHDAY_FIELDS;
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
  const fromFields = new Set(extrasForTemplate(fromTemplateId));
  const toFields = new Set(extrasForTemplate(toTemplateId));
  const hidden: string[] = [];
  for (const key of fromFields) {
    if (!toFields.has(key) && hasContent(draft[key])) {
      hidden.push(TYPE_FIELD_LABELS[key]);
    }
  }
  return hidden;
}
