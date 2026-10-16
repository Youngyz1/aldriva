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
const { resolveV2TemplateGalleryPreview } = require("../website-v2-template-preview.ts");
const { WEBSITE_CATEGORIES, isTemplateCompatibleWithCategory } = require("../website-category.ts");
const { FLAGSHIP_TEMPLATES } = require("../website-template-v2.ts");
const { toWebsiteContentDraft } = require("../website-v2-editor-schema.ts");
const galleryClientPath = path.join(ROOT, "components/dashboard/website/v2/WebsiteV2TemplateGalleryClient.tsx");
const galleryClientSource = fs.readFileSync(galleryClientPath, "utf8");
const galleryServerSource = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/WebsiteV2TemplateGallery.tsx"), "utf8");

test("gallery pills use only the shared website categories", () => {
  assert.deepEqual(flow.getV2GalleryCategories(), WEBSITE_CATEGORIES);
  assert.equal(flow.getV2GalleryCategories().includes("all"), false);
  assert.match(galleryClientSource, /categories\.map\(\(option\)/);
});

test("every flagship template stays visible and categories only mark recommendations", () => {
  for (const category of WEBSITE_CATEGORIES) {
    const model = flow.getV2GalleryCategoryModel(category);
    assert.deepEqual(model.templates, FLAGSHIP_TEMPLATES);
    assert.deepEqual(model.recommendedTemplateIds, FLAGSHIP_TEMPLATES
      .filter((template) => isTemplateCompatibleWithCategory(template, category))
      .map((template) => template.id));
    assert.deepEqual(model.categories, WEBSITE_CATEGORIES);
    assert.equal(model.empty, false);
  }
  assert.deepEqual(flow.getV2GalleryCategoryModel("restaurant").templates.map((template) => template.id), FLAGSHIP_TEMPLATES.map((template) => template.id));
  assert.deepEqual(flow.getV2GalleryCategoryModel("retail").templates.map((template) => template.id), FLAGSHIP_TEMPLATES.map((template) => template.id));
});

test("every listed template can be passed to create for every category", () => {
  const model = flow.getV2GalleryCategoryModel("professional");
  assert.equal(model.empty, false);
  assert.deepEqual(model.templates, FLAGSHIP_TEMPLATES);
  const restaurantInRetail = flow.getV2CreateActionArgs("org", "restaurant-table-flame", "retail", "request-r");
  const rentalInService = flow.getV2CreateActionArgs("org", "rental-driveline", "service", "request-s");
  assert.equal(restaurantInRetail[2].websiteCategory, "retail");
  assert.equal(rentalInService[2].websiteCategory, "service");
  assert.match(galleryClientSource, /recommendedTemplateIds\.includes\(card\.id\)/);
  assert.match(galleryClientSource, /visibleCards\.map\(\(card\)/);
});

test("create action arguments use the selected category and keep ownership out of options", () => {
  const args = flow.getV2CreateActionArgs("organizer-from-route", "rental-driveline", "service", "request-1");
  assert.deepEqual(args, ["organizer-from-route", "rental-driveline", {
    websiteCategory: "service",
    creationRequestId: "request-1",
  }]);
  assert.deepEqual(Object.keys(args[2]).sort(), ["creationRequestId", "websiteCategory"]);
  assert.match(galleryClientSource, /createWebsiteFromV2Template\(/);
  assert.match(galleryClientSource, /getV2CreateActionArgs\(/);
});

test("a double-click/retry of one template/category reuses its creation request id", () => {
  let generated = 0;
  const makeId = () => `request-${++generated}`;
  const key = flow.getV2CreateAttemptKey("restaurant", "restaurant-table-flame");
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
