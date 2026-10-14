import { normalizeContent, type ContentDoc, type ContentKey } from "./website-content";
import type { ResolvedTemplate } from "./website-template-resolver";
import type { TemplateSlot, WebsiteTemplateV2 } from "./website-template-v2";

export type WebsiteEditorFieldKind = TemplateSlot["kind"] | "nav-labels";

export interface WebsiteItemFieldSchema {
  key: string;
  label: string;
  kind: "text" | "textarea" | "image";
  aliases?: string[];
}

export interface WebsiteEditorControl {
  id: string;
  slotIds: string[];
  field: ContentKey;
  label: string;
  kind: WebsiteEditorFieldKind;
  max?: number;
  required: boolean;
  itemFields?: WebsiteItemFieldSchema[];
}

export interface WebsiteEditorSection {
  id: string;
  title: string;
  summary: string;
  controls: WebsiteEditorControl[];
  missingSlotIds: string[];
  readOnly?: boolean;
  optional?: boolean;
  defaultOff?: boolean;
  sectionId?: string;
}

const ITEM_FIELDS: Record<string, WebsiteItemFieldSchema[]> = {
  "highlights.items": [
    { key: "title", label: "Title", kind: "text", aliases: ["label", "name"] },
    { key: "description", label: "Description", kind: "textarea", aliases: ["value", "text"] },
  ],
  "trust.items": [
    { key: "title", label: "Title", kind: "text", aliases: ["label", "name"] },
    { key: "description", label: "Description", kind: "textarea", aliases: ["value", "text"] },
  ],
  "steps.items": [
    { key: "title", label: "Step", kind: "text", aliases: ["label", "name"] },
    { key: "description", label: "Description", kind: "textarea", aliases: ["value", "text"] },
  ],
  "about.stats": [
    { key: "label", label: "Label", kind: "text", aliases: ["title", "name"] },
    { key: "value", label: "Value", kind: "text", aliases: ["description", "text"] },
  ],
  "testimonials.items": [
    { key: "quote", label: "Quote", kind: "textarea", aliases: ["text"] },
    { key: "author", label: "Name", kind: "text", aliases: ["name"] },
    { key: "role", label: "Role", kind: "text" },
  ],
  "faq.items": [
    { key: "question", label: "Question", kind: "text", aliases: ["title"] },
    { key: "answer", label: "Answer", kind: "textarea", aliases: ["text", "description"] },
  ],
  "locations.list": [
    { key: "name", label: "Location name", kind: "text", aliases: ["title"] },
    { key: "address", label: "Address", kind: "text" },
    { key: "hours", label: "Hours note", kind: "text" },
  ],
};

const SECTION_LAYOUT: Array<{ id: string; title: string; slotIds: string[] }> = [
  { id: "business", title: "Business basics", slotIds: ["nav.logo", "footer.business", "nav.labels", "nav.cta"] },
  { id: "hero", title: "Hero", slotIds: ["hero.image", "hero.headline", "hero.tagline", "hero.subtext", "hero.cta_secondary"] },
  { id: "highlights", title: "Highlights", slotIds: ["highlights.items"] },
  { id: "trust-steps", title: "Trust and steps", slotIds: ["trust.items", "steps.items"] },
  { id: "menu", title: "Popular dishes (optional)", slotIds: ["menu.featured"] },
  { id: "about", title: "About", slotIds: ["about.photo", "about.text", "about.stats"] },
  { id: "gallery", title: "Gallery", slotIds: ["gallery.photos"] },
  { id: "testimonials", title: "Testimonials", slotIds: ["testimonials.items"] },
  { id: "faq", title: "FAQ", slotIds: ["faq.items"] },
  {
    id: "hours-location",
    title: "Hours and location",
    slotIds: ["hours.table", "location.address", "location.phone", "location.directions", "locations.list"],
  },
  { id: "contact", title: "Contact", slotIds: ["contact.email"] },
  { id: "footer", title: "Social and footer", slotIds: ["footer.socials", "footer.note"] },
];

const ALIASES: Record<string, string[]> = {
  "nav.cta": ["nav.cta", "hero.cta_primary"],
  "hours.table": ["hours.table", "hero.open_tag"],
};

function isFilled(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== undefined && value !== null;
}

function describeControl(control: WebsiteEditorControl, content: ContentDoc): string[] {
  const value = content[control.field];
  if (control.field === "hero_image") return [isFilled(value) ? "Hero image added" : "No hero image"];
  if (control.field === "hero_headline") return [isFilled(value) ? "Headline added" : "No headline"];
  if (control.field === "business_name") return [isFilled(value) ? "Business name added" : "No business name"];
  if (control.field === "logo_url") return [isFilled(value) ? "Logo added" : "No logo"];
  if (control.field === "hours") return [isFilled(value) ? "Hours added" : "No hours yet"];
  if (control.kind === "items" || control.kind === "images" || control.kind === "pick") {
    const count = Array.isArray(value)
      ? value.length
      : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).menu_item_ids)
        ? ((value as Record<string, unknown>).menu_item_ids as unknown[]).length
        : 0;
    return [count > 0 ? `${count} ${count === 1 ? "item" : "items"}` : "No items yet"];
  }
  if (control.field === "socials") {
    const socials = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const count = Object.values(socials).filter(isFilled).length;
    return [count > 0 ? `${count} social ${count === 1 ? "link" : "links"}` : "No social links"];
  }
  return [isFilled(value) ? "Added" : "Not added"];
}

function sectionHasRenderedBacking(
  template: WebsiteTemplateV2,
  sectionId: string,
  resolved: ResolvedTemplate
): boolean {
  const section = template.sections.find((entry) => entry.id === sectionId);
  if (!section) return false;
  if (section.chrome) return true;
  if (!section.block || section.pendingBlock) return false;
  const page = template.pages.find((entry) => entry.purpose === section.page);
  return Boolean(page && resolved.pages.some((emitted) => emitted.slug === page.slug));
}

function activeSlotIds(template: WebsiteTemplateV2, resolved: ResolvedTemplate): Set<string> {
  const active = new Set<string>();
  for (const section of template.sections) {
    if (!section.slots?.length || !sectionHasRenderedBacking(template, section.id, resolved)) continue;
    section.slots.forEach((slotId) => active.add(slotId));
  }
  return active;
}

function summarize(title: string, controls: WebsiteEditorControl[], content: ContentDoc): string {
  // The accordion button already renders the section title above the summary,
  // so the summary must not repeat it — one-line status only.
  if (controls.length === 0) return "Not used by this template";
  const first = controls[0];
  return describeControl(first, content)[0];
}

/** Derives the fixed editor form from manifest slots that back emitted sections. */
export function buildWebsiteEditorSections(
  template: WebsiteTemplateV2,
  content: ContentDoc,
  resolved: ResolvedTemplate,
  missingRequiredSlotIds: string[] = []
): WebsiteEditorSection[] {
  const active = activeSlotIds(template, resolved);
  const missing = new Set(missingRequiredSlotIds);
  const byId = new Map(template.editableSlots.map((slot) => [slot.slotId, slot]));
  const sections: WebsiteEditorSection[] = [
    {
      id: "template",
      title: "Template",
      summary: template.name,
      controls: [],
      missingSlotIds: [],
      readOnly: true,
    },
  ];

  for (const group of SECTION_LAYOUT) {
    const controls: WebsiteEditorControl[] = [];
    const seenFields = new Set<string>();
    for (const requestedId of group.slotIds) {
      const aliases = ALIASES[requestedId] ?? [requestedId];
      const availableIds = aliases.filter((slotId) => active.has(slotId));
      if (availableIds.length === 0) continue;
      const slot = availableIds.map((id) => byId.get(id)).find((entry): entry is TemplateSlot => Boolean(entry));
      if (!slot || seenFields.has(slot.field)) continue;
      seenFields.add(slot.field);
      controls.push({
        id: requestedId,
        slotIds: availableIds,
        field: slot.field,
        label: slot.field === "hours" ? "Opening hours" : slot.label,
        kind: slot.field === "nav_labels" ? "nav-labels" : slot.kind,
        max: slot.max,
        required: availableIds.some((id) => byId.get(id)?.required),
        ...(ITEM_FIELDS[requestedId] ? { itemFields: ITEM_FIELDS[requestedId] } : {}),
      });
    }
    if (controls.length === 0) continue;
    const missingSlotIds = controls.flatMap((control) => {
      const missingAlias = control.slotIds.find((slotId) => missing.has(slotId));
      return missingAlias ? [missingAlias] : [];
    });
    const matchingSection = template.sections.find(
      (sec) => sec.id === group.id || group.slotIds.some((slotId) => sec.slots?.includes(slotId))
    );
    sections.push({
      id: group.id,
      title: group.title,
      summary: summarize(group.title, controls, content),
      controls,
      missingSlotIds: [...new Set(missingSlotIds)],
      optional: matchingSection?.optional,
      defaultOff: matchingSection?.defaultOff,
      sectionId: matchingSection?.id ?? group.id,
    });
  }
  return sections;
}

export function getWebsiteEditorControlForSlot(
  sections: WebsiteEditorSection[],
  slotId: string
): { sectionId: string; control: WebsiteEditorControl } | undefined {
  for (const section of sections) {
    const control = section.controls.find((candidate) => candidate.slotIds.includes(slotId));
    if (control) return { sectionId: section.id, control };
  }
  return undefined;
}

/** Produces the only document shape passed to saveContentDraft; samples are not accepted here. */
export function toWebsiteContentDraft(content: ContentDoc): ContentDoc {
  return normalizeContent(content);
}
