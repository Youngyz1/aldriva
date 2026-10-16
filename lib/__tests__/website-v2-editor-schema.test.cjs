const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
require.extensions[".ts"] = function compileTs(module, filename) {
  const fs = require("node:fs");
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { getFlagshipTemplate } = require("../website-template-v2.ts");
const { normalizeContent } = require("../website-content.ts");
const { resolveTemplateContent, checkPublishReadiness } = require("../website-template-resolver.ts");
const { buildWebsiteEditorSections, getWebsiteEditorControlForSlot, toWebsiteContentDraft } = require("../website-v2-editor-schema.ts");

function schemaFor(templateId, content = {}) {
  const template = getFlagshipTemplate(templateId);
  const normalized = normalizeContent(content);
  const resolved = resolveTemplateContent(template.id, template.version, normalized, { includeSamples: true, includeSourceMap: true });
  const readiness = checkPublishReadiness(template.id, template.version, normalized);
  return { template, normalized, resolved, sections: buildWebsiteEditorSections(template, normalized, resolved, readiness.missingRequired.map((slot) => slot.slotId)) };
}

test("v2 editor schema keeps the template row first and combines CTA and hours aliases", () => {
  const { sections } = schemaFor("restaurant-table-flame");
  assert.equal(sections[0].id, "template");
  assert.equal(sections[0].readOnly, true);
  const cta = getWebsiteEditorControlForSlot(sections, "nav.cta");
  assert.equal(cta.control.field, "primary_cta_label");
  assert.deepEqual(cta.control.slotIds, ["nav.cta", "hero.cta_primary"]);
  const hours = getWebsiteEditorControlForSlot(sections, "hours.table");
  assert.equal(hours.control.field, "hours");
  assert.deepEqual(hours.control.slotIds, ["hours.table", "hero.open_tag"]);
  assert.equal(getWebsiteEditorControlForSlot(sections, "fleet.featured"), undefined);
});

test("v2 editor exposes only slots from emitted blocks or chrome and excludes pending commerce", () => {
  const restaurant = schemaFor("restaurant-table-flame");
  const restaurantSlots = new Set(restaurant.sections.flatMap((section) => section.controls.flatMap((control) => control.slotIds)));
  assert.ok(restaurantSlots.has("menu.featured"));
  assert.ok(restaurantSlots.has("footer.business"));

  const rental = schemaFor("rental-driveline");
  const rentalSlots = new Set(rental.sections.flatMap((section) => section.controls.flatMap((control) => control.slotIds)));
  assert.equal(rentalSlots.has("fleet.featured"), false, "pending fleet commerce must not become an editor control");
  assert.equal(rentalSlots.has("hero.booking-bar"), false);
  assert.equal(rental.sections.some((section) => section.id === "menu"), false);
});

test("Food Order has a real editor control for every editable slot, including localized owner-editable steps", () => {
  const food = schemaFor("food-order");
  const exposedSlots = new Set(food.sections.flatMap((section) => section.controls.flatMap((control) => control.slotIds)));
  assert.deepEqual([...exposedSlots].sort(), food.template.editableSlots.map((slot) => slot.slotId).sort());
  const stepsSection = food.sections.find((section) => section.id === "trust-steps");
  assert.equal(stepsSection.titleKey, "foodOrderEditorSteps");
  const stepsControl = getWebsiteEditorControlForSlot(food.sections, "steps.items").control;
  assert.equal(stepsControl.field, "steps");
  assert.equal(stepsControl.kind, "items");
  assert.equal(stepsControl.labelKey, "foodOrderSlotSteps");
  assert.deepEqual(stepsControl.itemFields.map((field) => [field.key, field.labelKey]), [
    ["title", "foodOrderStepTitleLabel"],
    ["description", "foodOrderStepDescriptionLabel"],
  ]);
  assert.equal(food.template.lockedLayout, true);
  assert.deepEqual(food.template.lockedBlocks, ["cta-band", "footer"]);
});

test("typed fixed item fields stay pinned to the matching content shape", () => {
  const { sections } = schemaFor("rental-driveline");
  const fields = (slotId) => getWebsiteEditorControlForSlot(sections, slotId).control.itemFields.map((field) => [field.key, field.kind]);
  assert.deepEqual(fields("trust.items"), [["title", "text"], ["description", "textarea"]]);
  assert.deepEqual(fields("testimonials.items"), [["quote", "textarea"], ["author", "text"], ["role", "text"]]);
  assert.deepEqual(fields("faq.items"), [["question", "text"], ["answer", "textarea"]]);
  assert.deepEqual(fields("locations.list"), [["name", "text"], ["address", "text"], ["hours", "text"]]);
  assert.ok(fields("faq.items").every(([, kind]) => kind !== "image"));
  const faqSchema = getWebsiteEditorControlForSlot(sections, "faq.items").control.itemFields;
  assert.deepEqual(faqSchema[0].aliases, ["title"]);
  assert.deepEqual(faqSchema[1].aliases, ["text", "description"]);
});

test("section summaries use real content and required aliases do not double-count controls", () => {
  const empty = schemaFor("restaurant-table-flame");
  const hero = empty.sections.find((section) => section.id === "hero");
  assert.equal(hero.summary, "No hero image");
  const template = empty.sections.find((section) => section.id === "template");
  assert.equal(template.summary, "Table & Flame");
  for (const section of empty.sections) {
    assert.doesNotMatch(section.summary, new RegExp(`^${section.title} ·`), "summary must not repeat the section title");
  }
  const business = empty.sections.find((section) => section.id === "business");
  assert.equal(business.controls.filter((control) => control.field === "primary_cta_label").length, 1);
  assert.ok(business.missingSlotIds.filter((slotId) => slotId === "nav.cta" || slotId === "hero.cta_primary").length <= 1);

  const filled = schemaFor("restaurant-table-flame", { hero_image: "/uploads/hero.jpg" });
  assert.equal(filled.sections.find((section) => section.id === "hero").summary, "Hero image added");
});

test("sample-filled preview blocks never enter the normalized save document", () => {
  const original = normalizeContent({});
  const resolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", original, { includeSamples: true, includeSourceMap: true });
  assert.ok(resolved.sampleFields.length > 0);
  assert.ok(resolved.pages.some((page) => page.blocks.length > 0));
  const savePayload = toWebsiteContentDraft(original);
  assert.deepEqual(savePayload, {});
  assert.equal(savePayload.hero_headline, undefined);
  assert.equal(savePayload.hero_image, undefined);
});
