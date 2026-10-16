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

const flow = require("../website-v2-create-flow.ts");
const { normalizeWebsiteCategory, WEBSITE_CATEGORIES } = require("../website-category.ts");
const { resolveV2TemplateGalleryPreview } = require("../website-v2-template-preview.ts");
const { FLAGSHIP_TEMPLATES, NEW_SITE_GALLERY_TEMPLATES, getFlagshipTemplate } = require("../website-template-v2.ts");
const { toWebsiteContentDraft } = require("../website-v2-editor-schema.ts");
const galleryClientPath = path.join(ROOT, "components/dashboard/website/v2/WebsiteV2TemplateGalleryClient.tsx");
const galleryClientSource = fs.readFileSync(galleryClientPath, "utf8");
const galleryServerSource = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/WebsiteV2TemplateGallery.tsx"), "utf8");
const legacyGallerySource = fs.readFileSync(path.join(ROOT, "components/dashboard/website/TemplateGallery.tsx"), "utf8");

const BUSINESS_CATEGORIES = ["restaurant", "rental", "retail", "salon", "nonprofit", "custom"];

test("both galleries show templates without category controls or category filtering", () => {
  assert.doesNotMatch(galleryClientSource, /categories\.map|setCategory|chooseCategory|isTemplateCompatibleWithCategory/);
  assert.match(galleryClientSource, /categoryRecommendationOnly/);
  assert.match(galleryClientSource, /recommendedFor/);
  assert.match(legacyGallerySource, /const filtered = TEMPLATE_REGISTRY\.filter/);
  assert.doesNotMatch(legacyGallerySource, /isTemplateCompatibleWithCategory|setCategory|WEBSITE_CATEGORIES/);
  assert.match(legacyGallerySource, /Every template is available to every business/);
  assert.match(legacyGallerySource, /Suggested for:/);
  assert.match(galleryServerSource, /NEW_SITE_GALLERY_TEMPLATES\.map/);
  const legacyCreateAction = fs.readFileSync(path.join(ROOT, "lib/actions/website-instantiation.ts"), "utf8");
  const v2CreateAction = fs.readFileSync(path.join(ROOT, "lib/actions/website-v2.ts"), "utf8");
  assert.doesNotMatch(legacyCreateAction, /isTemplateCompatibleWithCategory|Incompatible category/);
  assert.doesNotMatch(v2CreateAction, /isTemplateCompatibleWithCategory|Incompatible category/);
});

test("legacy templates stay resolvable but remain hidden from the new-site gallery", () => {
  assert.equal(getFlagshipTemplate("restaurant-table-flame", "1.0.0").id, "restaurant-table-flame");
  assert.equal(getFlagshipTemplate("rental-driveline", "1.0.0").id, "rental-driveline");
  assert.deepEqual(NEW_SITE_GALLERY_TEMPLATES, FLAGSHIP_TEMPLATES.filter((template) => !template.legacy));
  assert.ok(NEW_SITE_GALLERY_TEMPLATES.some((template) => template.id === "food-order"));
  assert.ok(NEW_SITE_GALLERY_TEMPLATES.some((template) => template.id === "store"));
  assert.ok(!NEW_SITE_GALLERY_TEMPLATES.some((template) => template.legacy));
  for (const category of BUSINESS_CATEGORIES) {
    const model = flow.getV2GalleryCategoryModel(category);
    assert.deepEqual(model.templates, NEW_SITE_GALLERY_TEMPLATES);
    assert.ok(model.recommendedTemplateIds.every((id) => NEW_SITE_GALLERY_TEMPLATES.some((template) => template.id === id)));
    assert.equal(model.empty, false);
  }
});

test("category normalization accepts every business category without rejecting any template choice", () => {
  for (const category of BUSINESS_CATEGORIES) {
    const normalized = normalizeWebsiteCategory(category);
    assert.ok(WEBSITE_CATEGORIES.includes(normalized), `${category} normalizes to a valid website category`);
  }
  assert.equal(normalizeWebsiteCategory("salon"), "service");
  assert.equal(normalizeWebsiteCategory("nonprofit"), "organization");
  assert.equal(normalizeWebsiteCategory("custom"), "business");
  assert.equal(normalizeWebsiteCategory(undefined, "retail"), "retail");
});

test("every new template can be selected for restaurant, rental, retail, salon, nonprofit, and custom businesses", () => {
  for (const category of BUSINESS_CATEGORIES) {
    const model = flow.getV2GalleryCategoryModel(category);
    for (const template of NEW_SITE_GALLERY_TEMPLATES) {
      assert.ok(model.templates.some((candidate) => candidate.id === template.id), `${template.id} remains visible for ${category}`);
      const [organizerId, templateId, options] = flow.getV2CreateActionArgs("org", template.id, category, `request-${category}-${template.id}`);
      assert.equal(organizerId, "org");
      assert.equal(templateId, template.id);
      assert.equal(options.websiteCategory, category);
    }
  }
  assert.match(galleryClientSource, /visibleCards\.map\(\(card\)/);
  assert.match(galleryClientSource, /disabled=\{!canCreate \|\| pendingTemplateId !== null\}/);
  assert.doesNotMatch(galleryClientSource, /disabled=\{[^}]*category/i);
});

test("create action arguments preserve business category metadata without making it a template gate", () => {
  const args = flow.getV2CreateActionArgs("organizer-from-route", "store", "rental", "request-1");
  assert.deepEqual(args, ["organizer-from-route", "store", {
    websiteCategory: "rental",
    creationRequestId: "request-1",
  }]);
  assert.deepEqual(Object.keys(args[2]).sort(), ["creationRequestId", "websiteCategory"]);
  assert.match(galleryClientSource, /createWebsiteFromV2Template\(/);
  assert.match(galleryClientSource, /getV2CreateActionArgs\(/);
});

test("a double-click/retry of one template reuses its creation request id independent of category", () => {
  let generated = 0;
  const makeId = () => `request-${++generated}`;
  const key = flow.getV2CreateAttemptKey("food-order");
  const first = flow.getOrCreateV2CreationAttempt(null, key, makeId);
  const second = flow.getOrCreateV2CreationAttempt(first, key, makeId);
  assert.equal(second.requestId, first.requestId);
  assert.equal(generated, 1);
  assert.match(galleryClientSource, /pendingRef\.current\) return/);
  assert.match(galleryClientSource, /attemptRef\.current = attempt/);
});

test("action errors map to useful already-exists, permission, and fallback messages", () => {
  assert.match(flow.mapV2TemplateCreateError("Website already exists for this organization"), /already exists/);
  assert.match(flow.mapV2TemplateCreateError("Forbidden: insufficient entity permissions"), /owner, admin, or manager/);
  assert.equal(flow.mapV2TemplateCreateError("Organizer not found"), "Organizer not found");
  assert.match(flow.mapV2TemplateCreateError(undefined), /Failed to create website/);
});

test("success navigates to the organization v2 builder route", () => {
  assert.equal(flow.getV2WebsiteBuilderPath("org-123"), "/dashboard/org/org-123/website/builder");
  assert.match(galleryClientSource, /router\.push\(getV2WebsiteBuilderPath\(organizerId\)\)/);
});

test("gallery preview resolves samples for rendering but has no save payload", () => {
  const preview = resolveV2TemplateGalleryPreview("restaurant-table-flame");
  assert.ok(preview);
  assert.ok(preview.resolved.sampleFields.length > 0);
  assert.ok(preview.resolved.pages.find((page) => page.isHome).blocks.length > 0);
  assert.deepEqual(toWebsiteContentDraft(preview.content), {});
  assert.equal(Object.hasOwn(preview, "savePayload"), false);
  assert.match(galleryServerSource, /<BlockRenderer[\s\S]*?block=\{block\}/);
  assert.match(galleryServerSource, /<V2SiteHeader/);
  assert.match(galleryServerSource, /<V2SiteFooter/);
  assert.match(galleryServerSource, /v2ThemeStyle\(template\)/);
  assert.doesNotMatch(galleryServerSource, /saveContentDraft|publishContentDraft/);
  assert.match(fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/V2TemplateGalleryPreviewFrame.tsx"), "utf8"), /inert/);
});

test("every block type the templates emit has a BlockRenderer case (template cards never warn)", () => {
  const { resolveTemplateContent } = require("../website-template-resolver.ts");
  const rendererSource = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  const emitted = new Set();
  for (const template of FLAGSHIP_TEMPLATES) {
    const resolved = resolveTemplateContent(template.id, template.version, {}, { includeSamples: true, includeSourceMap: false });
    const home = resolved.pages.find((page) => page.isHome) ?? resolved.pages[0];
    assert.ok(home && home.blocks.length > 0, `${template.id} home must render blocks`);
    for (const page of resolved.pages) {
      for (const block of page.blocks) emitted.add(block.type);
    }
  }
  assert.ok(emitted.size > 0);
  for (const type of emitted) {
    assert.match(rendererSource, new RegExp(`case "${type}":`), `BlockRenderer must handle emitted block type ${type}`);
  }
  assert.doesNotMatch(rendererSource, /throw new Error/);
});

test("editor preview lives outside the dashboard layout with the same authorization", () => {
  const routePath = path.join(ROOT, "app/website-preview/[orgId]/page.tsx");
  assert.ok(fs.existsSync(routePath), "preview route must live outside /dashboard");
  assert.ok(!fs.existsSync(path.join(ROOT, "app/dashboard/org/[id]/website/builder/preview/page.tsx")), "old dashboard-nested preview route must be gone");
  const routeSource = fs.readFileSync(routePath, "utf8");
  assert.match(routeSource, /checkTenantAccess\(user\.id, tenantId/);
  assert.match(routeSource, /getBuilderState\(website\.id/);
  assert.match(routeSource, /V2WebsitePreviewClient/);
  assert.match(routeSource, /noindex|nocache/);
  assert.match(routeSource, /\[website-preview\] denied/);
  const panelSource = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/WebsitePreviewPanel.tsx"), "utf8");
  assert.match(panelSource, /\/website-preview\/\$\{encodeURIComponent\(tenantId\)\}\?websiteId=/);
  assert.doesNotMatch(panelSource, /builder\/preview/);
  const navbarSource = fs.readFileSync(path.join(ROOT, "components/Navbar.tsx"), "utf8");
  assert.match(navbarSource, /\/website-preview\//);
});
