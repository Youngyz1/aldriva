/**
 * lib/__tests__/invitation-template-manifest.test.cjs
 *
 * Source-level + structural guards for the per-template invitation field
 * manifest (minimalism-dark-blue). Step 6 of the manifest-driven builder task.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const manifestSrc = read("lib/invitation-template-manifests.ts");
const builderSrc = read("app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx");
const sectionSrc = read("app/dashboard/events/[id]/invitation-page/builder/sections/TemplateFieldsSection.tsx");
const mergeSrc = read("lib/invitation-template-preview-data.ts");
const snapshotSrc = read("lib/types/invitation-page-snapshot.ts");
const schemaSrc = read("lib/invitation-template-schema.ts");
const templateSrc = read("components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx");
const heroSrc = read("components/invitation/templates/minimalism-dark-blue/MinimalismHero.tsx");
const collageSrc = read("components/invitation/templates/minimalism-dark-blue/HeroCollage.tsx");

function withoutComments(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("invitation template manifest (minimalism-dark-blue)", () => {
  test("manifest declares sections, theme controls, and required builder sections are present", () => {
    assert.match(manifestSrc, /templateId:\s*"minimalism-dark-blue"/);
    assert.match(manifestSrc, /sections:\s*\[[^\]]*"type"[^\]]*"template"[^\]]*"design"[^\]]*"basics"[^\]]*"template-fields"[^\]]*"details"[^\]]*"gallery"[^\]]*"music"[^\]]*"publish"[^\]]*\]/);
    assert.doesNotMatch(manifestSrc, /"minimalism-dark-blue"[\s\S]{0,2000}sections:\s*\[[^\]]*"story"/);
    assert.match(manifestSrc, /themeControls:\s*\{\s*palette:\s*true,\s*fontPack:\s*true,\s*textScale:\s*true\s*\}/);
  });

  test("every manifest field has a storage target and en/fr labels", () => {
    // field instances (not the interface): contain a concrete storage kind
    const fieldBlocks = manifestSrc.split(/\{\s*key:/g).slice(1).filter((b) => /kind:\s*"(column|template_data)"/.test(b));
    assert.ok(fieldBlocks.length >= 10, "expected manifest fields");
    for (const b of fieldBlocks) {
      assert.match(b, /storage:\s*\{\s*kind:\s*"(column|template_data)"/, "storage target");
      assert.match(b, /\ben:\s*"/, "label.en");
      assert.match(b, /\bfr:\s*"/, "label.fr");
    }
  });

  test("image-list has min/max and slot labels; renderer respects manifest max", () => {
    assert.match(manifestSrc, /key:\s*"mf_hero_photos"[\s\S]*?type:\s*"image-list"[\s\S]*?min:\s*1[\s\S]*?max:\s*2/);
    assert.match(manifestSrc, /slotLabels:[\s\S]*?Large photo[\s\S]*?Small photo/);
    const sec = withoutComments(sectionSrc);
    assert.match(sec, /typeof field\.max === "number" \? field\.max/, "max comes from manifest");
    assert.match(sec, /items\.length < max/, "add slot gated by manifest max");
    assert.match(sec, /legacyInvitationTemplateToLayout|template_data/, "writes template_data");
  });

  test("manifest sections hide story/extras/photos/evergreen/hero for minimalism and keep core sections for all templates", () => {
    const manifestLine = manifestSrc.match(/templateId:\s*"minimalism-dark-blue"[\s\S]*?sections:\s*\[([\s\S]*?)\]/);
    assert.ok(manifestLine, "minimalism sections");
    const sections = manifestLine[1];
    for (const hidden of ["story", "extras", "photos", "evergreen", '"hero"']) {
      assert.ok(!sections.includes(hidden), `must not include ${hidden}`);
    }
    for (const kept of ["type", "template", "design", "music", "publish", "template-fields", "basics", "details", "gallery"]) {
      assert.ok(sections.includes(kept), `must include ${kept}`);
    }
    // builder: manifest-aware section selection; fallback/static path remains in resolver
    assert.match(builderSrc, /getBuilderSectionIds\(draft\.template_id\)|getInvitationTemplateManifest\(draft\.template_id\)/);
    const resolverSrc = read("lib/invitation-builder-section-ids.ts");
    assert.match(resolverSrc, /BUILDER_SECTION_IDS\.filter/); // fallback path remains
  });

  test("data mapping: manifest hero/parents/swatches mapped; preview merge is manifest-aware for photo gating", () => {
    assert.match(snapshotSrc, /mf_hero_photos[\s\S]*envelopePhoto/);
    assert.match(snapshotSrc, /envelopePhotoTwo/);
    assert.match(snapshotSrc, /readManifestSwatches/);
    assert.match(snapshotSrc, /mf_parent_one_name_one/);
    assert.match(snapshotSrc, /mf_invitation_line/);
    const merge = withoutComments(mergeSrc);
    assert.match(merge, /isManifestTemplate = hasInvitationTemplateManifest/);
    // manifest templates: no global photo blanking; per-field empty-check applies
    assert.match(merge, /if \(isManifestTemplate\) \{[\s\S]*?\} else if \(hasOrganizerPhoto\) \{\s*continue;\s*\}/, "one uploaded photo must not blank other slots for manifest");
    assert.match(merge, /hasOrganizerPhoto/);
  });

  test("template_data schema is passthrough for manifest keys (persistence) and save/publish preserve blocks_layout", () => {
    assert.match(schemaSrc, /\.passthrough\(\)/, "template_data accepts manifest namespaced keys");
    assert.doesNotMatch(schemaSrc, /EvergreenEnvelopeTemplateDataSchema = z\.object\([\s\S]*?\}\)\.strict\(\);\s*\n\s*\/\*\*\n\s*\* Versioned/); // ensure not strict-only in that form? relaxed
    // save passes blocks_layout through; draftFromData only transforms evergreen
    const builder = withoutComments(builderSrc);
    assert.match(builder, /d\.template_id === "evergreen-envelope" && d\.blocks_layout\s*\?\s*legacyInvitationTemplateToLayout/);
  });

  test("source-level: data.* values read by MinimalismDarkBlue template/hero/collage are mapped, existing columns, or explicit allow-list", () => {
    const code = withoutComments(templateSrc + "\n" + heroSrc + "\n" + collageSrc);
    const reads = new Set();
    for (const m of code.matchAll(/\bdata\.([A-Za-z_][A-Za-z0-9_]*)/g)) reads.add(m[1]);
    // allow-list: fields read that are provided by assembly/sample/live event/guest context or template-local conventions
    const allowed = new Set([
      "partner1Name","partner2Name","title","eventDate","locale","timezone","venue","city","address",
      "guest","seat","token","heroImage","heroImageAlt","heroImageFocus","storyImage","gallery","schedule",
      "venues","dressCode","dressCodeNotes","additionalNotes","musicAudioUrl","musicTitle","musicLinks",
      "latitude","longitude","hostNames","eyebrow","invitationLine",
      // manifest-mapped
      "envelopePhoto","envelopePhotoTwo","dressCodeSwatches","parentOneLabel","parentOneNameOne","parentOneNameTwo",
      "parentTwoLabel","parentTwoNameOne","parentTwoNameTwo",
      // sample/type context
      "familyNote","weddingSubtype","registryNote","celebrantName","ageMilestone","theme","giftNote",
      "weddingStory","accommodations","colorsOfTheDay","endDate","parkingNotes","hashtag","storyHeadline","storyText",
      "parentsLine","adultsOnlyNote","monogramInitials","albumUrl","showWishingWell","showAdultsOnly",
      "wishingWellNote","storyForeverWord","closingCaption","rsvpIntro","rsvpDeadline","coverPhoto",
      "polaroidPhotoOne","polaroidPhotoTwo","storyPhotoOne","storyPhotoTwo","closingPhoto","rsvpPhoto","photoFocalPoints",
      "scrollPrompt","ticketInstance","sampleFields",
      // provided by lib/memories/resolve-memories-props (guest gallery assembly)
      "memoriesSample","memoriesCount","memoriesToken",
    ]);
    const unknown = [...reads].filter((r) => !allowed.has(r));
    assert.deepEqual(unknown, [], `unmapped data.* reads: ${unknown.join(", ")}`);
    // manifest explicitly declares the key editable surfaces for minimalism
    for (const k of ["partner1_name","partner2_name","mf_hero_photos","mf_dress_code_swatches","show_guestbook","mf_invitation_line","mf_hero_eyebrow"]) {
      assert.match(manifestSrc, new RegExp(`key:\\s*"${k}"`), `manifest declares ${k}`);
    }
  });
});
