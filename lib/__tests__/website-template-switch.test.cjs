const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { planTemplateSwitch } = require("../website-template-resolver.ts");
const { getFlagshipTemplate, NEW_SITE_GALLERY_TEMPLATES } = require("../website-template-v2.ts");
const {
  getTemplateSwitchTargets,
  isSwitchTargetAllowed,
  resolveSwitchedAccent,
  summarizeTemplateSwitch,
} = require("../website-template-switch.ts");
const { normalizeContent } = require("../website-content.ts");

const switchActionSource = fs.readFileSync(path.join(ROOT, "lib/actions/website-template-switch.ts"), "utf8");
const editorSource = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/V2WebsiteEditor.tsx"), "utf8");
const dialogSource = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/TemplateSwitchDialog.tsx"), "utf8");
const enMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
const frMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));

function fullFoodOrderDoc() {
  return {
    business_name: "Chez Awa",
    logo_url: "/uploads/logo.png",
    hero_image: "/uploads/hero.png",
    hero_headline: "Good food fast",
    hero_subtext: "Open late",
    tagline: "Since 2019",
    primary_cta_label: "Order",
    secondary_cta_label: "Call us",
    about_text: "Family kitchen",
    about_image: "/uploads/about.png",
    testimonials: [{ author: "Awa", quote: "Great!" }],
    hours: { mon: { open: "09:00", close: "22:00" } },
    address: "12 Rue",
    phone: "+22507000000",
    directions_url: "https://maps.example/1",
    email: "a@example.com",
    business_name_2: "unused-key",
    socials: { instagram: "https://instagram.example/a" },
    footer_note: "See you soon",
    nav_labels: { home: "Home" },
    steps: [{ title: "Explore", description: "Browse" }],
    highlights: [{ label: "Fresh", value: "Daily" }],
    stats: [{ label: "Dishes", value: "42" }],
    gallery_images: ["/uploads/g.png"],
    featured: { menu_item_ids: ["dish-1"] },
  };
}

test("switch planner is reused: food-order to store carries shared slots and reports the rest", () => {
  const doc = fullFoodOrderDoc();
  const before = JSON.stringify(doc);
  const plan = planTemplateSwitch("food-order", "store", doc);
  assert.equal(JSON.stringify(doc), before, "planner must never mutate the doc");
  assert.equal(plan.newTemplateId, "store");
  const summary = summarizeTemplateSwitch("food-order", "store", doc);
  for (const label of ["Logo", "Headline", "Address", "Phone"]) {
    assert.ok(summary.carriesOver.includes(label), `${label} must carry over`);
  }
  // Store has no hours slot: the value is kept (restored on switch-back),
  // not carried into a visible slot.
  assert.ok(summary.keptKeys.includes("hours"), "hours value must be kept verbatim");
  assert.ok(summary.hiddenSections.length > 0, "food-only sections with content hide");
  assert.ok(!summary.hiddenSections.some((id) => id.includes("hero") || id.includes("contact")), "shared sections stay visible");
});

test("hidden slot values survive a round trip: switching back restores everything byte-identical", () => {
  const doc = fullFoodOrderDoc();
  const before = JSON.stringify(doc);
  const toStore = planTemplateSwitch("food-order", "store", doc);
  assert.ok(toStore.keptUnslottedKeys.length > 0, "store-lacking keys are kept, not deleted");
  const back = planTemplateSwitch("store", "food-order", doc);
  assert.equal(JSON.stringify(doc), before, "round trip must leave the doc byte-identical");
  assert.ok(back.keptUnslottedKeys.length > 0, "unslotted keys wait untouched for the return trip");
  const normalized = normalizeContent(doc);
  for (const key of ["logo_url", "hero_headline", "hours", "address", "phone", "steps", "testimonials"]) {
    assert.deepEqual(normalized[key], doc[key], `${key} must survive normalizeContent`);
  }
});

test("hours, timezone-adjacent identity, logo and hero are never touched by a switch", () => {
  const doc = fullFoodOrderDoc();
  const summary = summarizeTemplateSwitch("food-order", "store", doc);
  assert.ok(summary.carriesOver.includes("Logo"), "logo carries");
  assert.ok(summary.carriesOver.includes("Headline"), "hero headline carries");
  assert.ok(summary.keptKeys.includes("hours"), "hours kept verbatim (store shows no hours slot)");
  assert.ok(!switchActionSource.includes(".update({ content"), "switch action must not write content docs");
  assert.match(
    switchActionSource,
    /templateId: next\.id,\s*templateVersion: next\.version,/,
    "metadata write sets only template identity plus the brand accent rule"
  );
  assert.doesNotMatch(switchActionSource, /storefront:|metadata\.storefront/);
});

test("switch writes draft metadata only; live site stays unchanged until publish", () => {
  assert.match(switchActionSource, /\.from\("tenant_websites"\)/);
  assert.match(switchActionSource, /\.update\(\{ metadata: nextMetadata \}\)/);
  assert.doesNotMatch(switchActionSource, /website_pages/);
  assert.doesNotMatch(switchActionSource, /website_navigation/);
  assert.doesNotMatch(switchActionSource, /status: "published"/);
  assert.doesNotMatch(switchActionSource, /publishContentDraft/);
  assert.doesNotMatch(switchActionSource, /\.update\(\{ content/);
});

test("legacy sites can switch away, but legacy is never offered as a target", () => {
  const plan = planTemplateSwitch("restaurant-table-flame", "store", fullFoodOrderDoc());
  assert.equal(plan.currentTemplateId, "restaurant-table-flame");
  assert.equal(plan.newTemplateId, "store");
  assert.equal(isSwitchTargetAllowed("store"), true);
  assert.equal(isSwitchTargetAllowed("food-order"), true);
  assert.equal(isSwitchTargetAllowed("restaurant-table-flame"), false);
  assert.equal(isSwitchTargetAllowed("rental-driveline"), false);
  assert.equal(isSwitchTargetAllowed("nope"), false);
  const targets = getTemplateSwitchTargets("restaurant-table-flame");
  assert.deepEqual(targets.map((target) => target.id), NEW_SITE_GALLERY_TEMPLATES.map((template) => template.id));
  assert.ok(targets.every((target) => !target.isCurrent), "no current marker on a legacy site");
  const current = getTemplateSwitchTargets("store");
  assert.equal(current.find((target) => target.id === "store").isCurrent, true);
  assert.match(switchActionSource, /next\.legacy/);
});

test("auth, tenant scoping, and stale-draft guard hold on the switch action", () => {
  assert.match(switchActionSource, /getCurrentUser\(\)/);
  assert.match(switchActionSource, /checkTenantAccess\(user\.id, tenantId/);
  assert.match(switchActionSource, /ENTITY_ROLES_CONTENT_WRITE/);
  assert.match(switchActionSource, /\.eq\("id", key\)/);
  assert.match(switchActionSource, /export async function previewTemplateSwitch\(\s*websiteId: string,/);
  assert.match(switchActionSource, /export async function switchWebsiteTemplate\(\s*websiteId: string,/);
  assert.doesNotMatch(switchActionSource, /organizerId/);
  assert.match(switchActionSource, /expectedVersion !== currentVersion/);
  assert.match(switchActionSource, /STALE_DRAFT/);
  assert.match(switchActionSource, /already uses that template/);
});

test("accent default applies only when the owner has not chosen one", () => {
  const store = getFlagshipTemplate("store");
  assert.equal(resolveSwitchedAccent("midnight", store), "midnight");
  assert.equal(resolveSwitchedAccent("  ", store), store.defaultAccentId ?? "terracotta");
  assert.equal(resolveSwitchedAccent(undefined, store), store.defaultAccentId ?? "terracotta");
  assert.match(switchActionSource, /resolveSwitchedAccent\(/);
  assert.match(switchActionSource, /brand: \{\s*\.\.\.currentBrand,/);
});

test("previews reuse the gallery pipeline with the owner name and logo", () => {
  const previewSource = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/TemplateSwitchPreview.tsx"), "utf8");
  assert.match(previewSource, /resolveV2TemplateGalleryPreview/);
  assert.match(previewSource, /createNeutralGallerySampleContent/);
  assert.match(previewSource, /<V2SiteHeader/);
  assert.match(previewSource, /<BlockRenderer/);
  assert.match(previewSource, /<V2SiteFooter/);
  const builderSource = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/website/builder/page.tsx"), "utf8");
  assert.match(builderSource, /getTemplateSwitchTargets\(builderState\.data\.template\.id\)/);
  assert.match(builderSource, /<TemplateSwitchPreview/);
  assert.match(builderSource, /storefront\.businessName/);
  assert.match(builderSource, /contentDraftOrLive\.logo_url/);
});

test("change-template button is enabled for editors and explained otherwise", () => {
  assert.match(editorSource, /<TemplateSwitchDialog/);
  assert.match(editorSource, /canEdit=\{canEditWebsiteTemplate\(initialState\.userRole\)\}/);
  assert.match(editorSource, /canEditWebsiteTemplate/);
  assert.doesNotMatch(editorSource, /<button type="button" disabled[^>]*>Change template<\/button>/);
  assert.match(dialogSource, /disabled/);
  assert.match(dialogSource, /templateSwitchNoEdit/);
  assert.match(dialogSource, /previewTemplateSwitch\(websiteId, activeId\)/);
  assert.match(dialogSource, /switchWebsiteTemplate\(websiteId, activeId, expectedVersion\)/);
  assert.match(dialogSource, /templateSwitchLiveNote/);
  assert.match(dialogSource, /getExpectedVersion\(\)/);
  assert.match(dialogSource, /onSwitched\(\)/);
});

test("switch strings exist in EN and FR with real translations", () => {
  const keys = [
    "changeTemplate",
    "templateSwitchTitle",
    "templateSwitchCurrent",
    "templateSwitchCarries",
    "templateSwitchHidden",
    "templateSwitchNeedsContent",
    "templateSwitchLiveNote",
    "templateSwitchConfirm",
    "templateSwitchCancel",
    "templateSwitching",
    "templateSwitchLoading",
    "templateSwitchStale",
    "templateSwitchFailed",
    "templateSwitchNoEdit",
  ];
  for (const key of keys) {
    assert.equal(typeof enMessages.PublicSite[key], "string", `en PublicSite.${key}`);
    assert.equal(typeof frMessages.PublicSite[key], "string", `fr PublicSite.${key}`);
    assert.notEqual(frMessages.PublicSite[key], enMessages.PublicSite[key], `fr PublicSite.${key} must be translated`);
  }
});
