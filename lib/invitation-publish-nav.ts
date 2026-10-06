/**
 * lib/invitation-publish-nav.ts
 *
 * Maps publish-validation error fields to the builder section that owns
 * them, so checklist failures render as jump links (scroll + open + focus
 * the section). Unmapped fields fall back to the Publish section itself.
 */

export type BuilderSectionId =
  | "type"
  | "template"
  | "basics"
  | "hero"
  | "story"
  | "details"
  | "gallery"
  | "music"
  | "extras"
  | "publish";

const EXACT_FIELD_SECTIONS: Record<string, BuilderSectionId> = {
  title: "basics",
  template_id: "template",
  timezone: "basics",
  event_date: "basics",
  partner1_name: "extras",
  partner2_name: "extras",
  celebrant_name: "extras",
};

const PREFIX_SECTION_RULES: { prefix: string; section: BuilderSectionId }[] = [
  { prefix: "hero_image", section: "hero" },
  { prefix: "story_", section: "story" },
  { prefix: "scroll_prompt", section: "hero" },
  { prefix: "venue", section: "details" },
  { prefix: "address", section: "details" },
  { prefix: "parking_notes", section: "details" },
  { prefix: "schedule", section: "details" },
  { prefix: "dress_code", section: "details" },
  { prefix: "hashtag", section: "details" },
  { prefix: "additional_notes", section: "details" },
  { prefix: "gallery", section: "gallery" },
  { prefix: "music_", section: "music" },
  { prefix: "partner", section: "extras" },
  { prefix: "family_note", section: "extras" },
  { prefix: "wedding_subtype", section: "extras" },
  { prefix: "registry_note", section: "extras" },
  { prefix: "accommodations", section: "extras" },
  { prefix: "colors_of_the_day", section: "extras" },
  { prefix: "wedding_story", section: "extras" },
  { prefix: "celebrant_name", section: "extras" },
  { prefix: "age_milestone", section: "extras" },
  { prefix: "theme", section: "extras" },
  { prefix: "gift_note", section: "extras" },
  { prefix: "eyebrow", section: "basics" },
  { prefix: "host_names", section: "basics" },
  { prefix: "display_title", section: "basics" },
  { prefix: "locale", section: "basics" },
];

export function sectionForPublishField(field: string): BuilderSectionId {
  if (EXACT_FIELD_SECTIONS[field]) return EXACT_FIELD_SECTIONS[field];
  const base = field.split(".")[0];
  if (EXACT_FIELD_SECTIONS[base]) return EXACT_FIELD_SECTIONS[base];
  for (const rule of PREFIX_SECTION_RULES) {
    if (base.startsWith(rule.prefix)) return rule.section;
  }
  return "publish";
}
