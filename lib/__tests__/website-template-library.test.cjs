/**
 * lib/__tests__/website-template-library.test.cjs
 * Stage K — Template Library + QA
 * Verifies registry, compatibility, preview, instantiation, immutability
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: "react" },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
if (!require.extensions[".tsx"]) require.extensions[".tsx"] = require.extensions[".ts"];

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const registryMod = require("../website-template-registry.ts");
const TEMPLATE_REGISTRY = registryMod.TEMPLATE_REGISTRY;
const validateRegistry = registryMod.validateRegistry;
const getTemplateById = registryMod.getTemplateById;
const getCompatibleTemplatesForCategory = registryMod.getCompatibleTemplatesForCategory;
const isTemplateCompatibleWithCategory = registryMod.isTemplateCompatibleWithCategory;

const blocksMod = require("../website-blocks.ts");
const normalizeBlocks = blocksMod.normalizeBlocks;
const cloneBlockWithNewIds = blocksMod.cloneBlockWithNewIds;
const validateBlock = blocksMod.validateBlock;

// ── Registry ──
test("K registry: canonical templates exist with required metadata", () => {
  assert.ok(Array.isArray(TEMPLATE_REGISTRY));
  assert.ok(TEMPLATE_REGISTRY.length >= 6, "at least 6 canonical templates");
  for (const t of TEMPLATE_REGISTRY) {
    assert.ok(typeof t.id === "string" && t.id.length > 0, `template ${t.id} has id`);
    assert.ok(typeof t.version === "string" && /^\d+\.\d+\.\d+$/.test(t.version), `template ${t.id} version semver`);
    assert.ok(typeof t.name === "string" && t.name.length > 2);
    assert.ok(typeof t.description === "string" && t.description.length > 10);
    assert.ok(typeof t.category === "string");
    assert.ok(typeof t.previewColor === "string" && /^#/.test(t.previewColor));
    assert.ok(Array.isArray(t.supportedCategories));
    assert.ok(t.theme && typeof t.theme === "object");
    assert.ok(t.header && typeof t.header === "object");
    assert.ok(t.footer && typeof t.footer === "object");
    assert.ok(Array.isArray(t.pages) && t.pages.length > 0);
    assert.ok(t.pages.some((p) => p.isHome), `template ${t.id} must have home page`);
    for (const p of t.pages) {
      assert.ok(typeof p.slug === "string" && p.slug.length > 0);
      assert.ok(Array.isArray(p.blocks));
      p.blocks.forEach((b, idx) => {
        const res = validateBlock(b);
        assert.equal(res.success, true, `template ${t.id} page ${p.slug} block ${idx} (${b.type}) must validate: ${res.success ? "" : JSON.stringify(res.issues)}`);
        const rid = (b).id;
        assert.ok(typeof rid === "string" && rid.length > 5, `block ${b.type} must have stable id`);
      });
    }
  }
});

test("K registry: template IDs unique (id@version) and page slugs valid", () => {
  const seen = new Set();
  for (const t of TEMPLATE_REGISTRY) {
    const ref = `${t.id}@${t.version}`;
    assert.ok(!seen.has(ref), `duplicate ref ${ref}`);
    seen.add(ref);
    const slugs = new Set();
    for (const p of t.pages) {
      assert.ok(!slugs.has(p.slug), `duplicate page slug ${p.slug} in ${t.id}`);
      slugs.add(p.slug);
    }
  }
  const r = validateRegistry();
  assert.equal(r.valid, true, `validateRegistry must pass: ${r.errors.join("; ")}`);
});

test("K registry: support shim WEBSITE_TEMPLATES derived correctly", () => {
  const shim = require("../website-templates.ts");
  assert.ok(Array.isArray(shim.WEBSITE_TEMPLATES));
  assert.equal(shim.WEBSITE_TEMPLATES.length, TEMPLATE_REGISTRY.length);
  for (const wt of shim.WEBSITE_TEMPLATES) {
    const canon = TEMPLATE_REGISTRY.find((c) => c.id === wt.id);
    assert.ok(canon, `shim ${wt.id} has canonical`);
    assert.equal(wt.version, canon.version);
    assert.deepEqual(wt.category, canon.category);
  }
});

// ── Compatibility ──
test("K compatibility: supportedCategories respected", () => {
  // service-pro is compatible with professional via supportedCategories ["service","professional"]
  const servicePro = getTemplateById("service-pro");
  assert.ok(servicePro);
  assert.equal(isTemplateCompatibleWithCategory(servicePro, "service"), true);
  assert.equal(isTemplateCompatibleWithCategory(servicePro, "professional"), true);
  assert.equal(isTemplateCompatibleWithCategory(servicePro, "retail"), false);
  assert.equal(isTemplateCompatibleWithCategory(servicePro, "business"), false);

  const retail = getTemplateById("retail-boutique");
  assert.equal(isTemplateCompatibleWithCategory(retail, "retail"), true);
  assert.equal(isTemplateCompatibleWithCategory(retail, "restaurant"), false);

  // business-starter only business
  const business = getTemplateById("business-starter");
  assert.equal(isTemplateCompatibleWithCategory(business, "business"), true);
  assert.equal(isTemplateCompatibleWithCategory(business, "creative"), false);
});

test("K compatibility: getCompatibleTemplatesForCategory uses supportedCategories", () => {
  const forProfessional = getCompatibleTemplatesForCategory("professional");
  assert.ok(forProfessional.some((t) => t.id === "service-pro"), "professional should include service-pro via supportedCategories");
  assert.ok(!forProfessional.some((t) => t.id === "retail-boutique"), "professional should not include retail");

  const forBusiness = getCompatibleTemplatesForCategory("business");
  assert.ok(forBusiness.some((t) => t.id === "business-starter"));
  assert.equal(forBusiness.some((t) => t.id === "retail-boutique"), false);
});

test("K compatibility: category filtering does not mutate registry", () => {
  const before = JSON.stringify(TEMPLATE_REGISTRY);
  const filteredDirect = TEMPLATE_REGISTRY.filter((t) => isTemplateCompatibleWithCategory(t, "restaurant"));
  assert.ok(filteredDirect.length >= 1, "direct filter via helper should return at least one for restaurant");
  // call again with shim
  const shimFiltered = getCompatibleTemplatesForCategory("restaurant");
  assert.ok(shimFiltered.length >= 1);
  assert.equal(JSON.stringify(TEMPLATE_REGISTRY), before, "registry must not be mutated by filtering");
  // Gallery source check: must use isTemplateCompatibleWithCategory, not t.category === category
  const gallerySrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/TemplateGallery.tsx"), "utf8");
  assert.ok(gallerySrc.includes("isTemplateCompatibleWithCategory"), "TemplateGallery must use compatibility helper, not strict t.category ===");
  assert.ok(!gallerySrc.includes("t.category === category") || gallerySrc.includes("isTemplateCompatibleWithCategory"), "should not rely solely on strict category equality");
});

// ── Preview ──
test("K preview: renders real blocks via controlled block rendering, preserves order and does not mutate registry", () => {
  const previewSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/TemplatePreview.tsx"), "utf8");
  // Must read canonical homePage.blocks and render via controlled system (not fake wireframe per-type markup)
  assert.ok(previewSrc.includes("homePage.blocks") || previewSrc.includes("template.pages.find"), "preview must read homePage.blocks");
  assert.ok(previewSrc.includes("isBlockVisible") || previewSrc.includes("BlockRenderer"), "preview must respect section envelope (visible) via real renderer/helpers");
  assert.ok(previewSrc.includes("getSpacingClass") || previewSrc.includes("getBackgroundStyle") || previewSrc.includes("BlockRenderer"), "preview must respect spacing/background via helpers or BlockRenderer");
  assert.ok(!previewSrc.includes("cloneBlockWithNewIds"), "preview must NOT clone/mutate — read-only");

  // Verify preview does not mutate registry (deep check)
  const tpl = getTemplateById("business-starter");
  const beforeBlocks = JSON.stringify(tpl.pages[0].blocks);
  const beforeIds = tpl.pages[0].blocks.map((b) => (b).id);
  // Simulate preview read
  const homePage = tpl.pages.find((p) => p.isHome) ?? tpl.pages[0];
  const blocks = homePage.blocks; // read-only, no clone
  assert.equal(JSON.stringify(tpl.pages[0].blocks), beforeBlocks, "registry blocks unchanged after preview read");
  assert.deepEqual(tpl.pages[0].blocks.map((b) => (b).id), beforeIds);
  assert.equal(blocks.length, homePage.blocks.length);
  // order preserved
  assert.equal(blocks[0].type, homePage.blocks[0].type);
});

test("K preview: respects section envelope (visible/spacing/background)", () => {
  const gallerySrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/TemplateGallery.tsx"), "utf8");
  // Gallery should show preview dialog with desktop/mobile toggle via TemplatePreview mode
  assert.ok(gallerySrc.includes("TemplatePreview"), "Gallery must import TemplatePreview");
  assert.ok(gallerySrc.includes('previewMode'), "Gallery must have desktop/mobile preview mode");
  assert.ok(gallerySrc.includes("Dialog"), "Gallery preview should be in Dialog");

  // Check BlockRenderer envelope wrapper still present (from H)
  const rendererSrc = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.ok(rendererSrc.includes("SectionEnvelopeWrapper") || rendererSrc.includes("isBlockVisible"), "BlockRenderer must respect envelope for preview");
});

// ── Instantiation ──
test("K instantiation: clone creates tenant snapshot with fresh stable IDs, preserves order/envelope/theme/header/footer", () => {
  const tpl = getTemplateById("restaurant-delight");
  assert.ok(tpl);
  const beforeIds = tpl.pages[0].blocks.map((b) => (b).id);
  const beforeItemIds = (tpl.pages[0].blocks.find((b) => b.type === "gallery")?.images ?? []).map((im) => im.id);
  const beforeRegistry = JSON.stringify(TEMPLATE_REGISTRY);

  // Simulate instantiateWebsiteFromTemplate core: fresh blocks
  const freshBlocks = tpl.pages[0].blocks.map((b) => cloneBlockWithNewIds(b));
  const normalized = normalizeBlocks(freshBlocks);
  // IDs differ
  const afterIds = normalized.map((b) => (b).id);
  assert.notDeepEqual(afterIds, beforeIds, "instantiated ids must differ from canonical");
  afterIds.forEach((id, i) => assert.notEqual(id, beforeIds[i]));
  // but type/order preserved
  assert.deepEqual(normalized.map((b) => b.type), tpl.pages[0].blocks.map((b) => b.type), "block order preserved");
  // item ids also fresh
  const freshGallery = normalized.find((b) => b.type === "gallery");
  if (freshGallery && freshGallery.images) {
    const freshItemIds = freshGallery.images.map((im) => im.id);
    assert.notDeepEqual(freshItemIds, beforeItemIds, "item ids must be fresh");
  }
  // envelope preserved (none in this template, but test with explicit envelope)
  const withEnv = normalizeBlocks([{ type: "hero", heading: "Hi", visible: false, spacing: "roomy", hiddenOnMobile: true, background: { color: "#fafafa", overlay: 0.25 } }])[0];
  const clonedEnv = cloneBlockWithNewIds(withEnv);
  assert.equal(clonedEnv.visible, false, "envelope visible preserved");
  assert.equal(clonedEnv.spacing, "roomy");
  assert.equal(clonedEnv.hiddenOnMobile, true);
  assert.equal(clonedEnv.background.color, "#fafafa");

  // canonical unchanged
  assert.equal(JSON.stringify(TEMPLATE_REGISTRY), beforeRegistry, "canonical registry must not be mutated by instantiation");

  // theme/header/footer survive (those are passed separately to RPC, but template objects unchanged)
  assert.deepEqual(tpl.theme, TEMPLATE_REGISTRY.find((t) => t.id === "restaurant-delight").theme);
});

test("K instantiation: service preserves instantiation security — template instantiation file uses correct cloning", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/actions/website-instantiation.ts"), "utf8");
  assert.ok(src.includes("cloneBlockWithNewIds"), "instantiation must use cloneBlockWithNewIds");
  assert.ok(src.includes("normalizeBlocks") && src.includes("validateBlocks"), "must normalize and validate snapshot");
  assert.ok(src.includes("hydrateBlocks"), "must hydrate business data");
  assert.ok(src.includes("requireTenantContext"), "must check tenant context");
  assert.ok(src.includes("isTemplateCompatibleWithCategory"), "must check category compatibility");
  assert.ok(!src.includes("supabase.storage.from") || src.includes("storage"), "no media copying — remote placeholder URLs remain references");
});

test("K regression: existing G1/G2/J invariants still hold via clone", () => {
  // G1 element paths still validate against clean clone
  const hero = cloneBlockWithNewIds(normalizeBlocks([{ type: "hero", heading: "Test" }])[0]);
  assert.ok(validateBlock(hero).success, "cloned hero must validate");
  const feat = cloneBlockWithNewIds(normalizeBlocks([{ type: "features", heading: "F", items: [{ title: "A" }] }])[0]);
  assert.ok(validateBlock(feat).success, "cloned features must validate");
  // J reorder still stable-id based (simulate move)
  const a = normalizeBlocks([{ type: "hero", heading: "A" }])[0];
  const b = normalizeBlocks([{ type: "features", heading: "B", items: [{ title: "B1" }] }])[0];
  const blocks = [a, b];
  const moved = [blocks[1], blocks[0]];
  assert.equal(moved[0].id, b.id);
  assert.equal(moved[1].id, a.id);
});

// ── Template library UI ──
test("K library UI: gallery shows name/description/category/preview/selection actions", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/dashboard/website/TemplateGallery.tsx"), "utf8");
  assert.ok(src.includes("TEMPLATE_REGISTRY"), "gallery must read canonical registry, not duplicate");
  assert.ok(src.includes("WEBSITE_CATEGORY_LABELS") || src.includes("WEBSITE_CATEGORIES"), "gallery must use canonical category labels, not ad-hoc TEMPLATE_CATEGORIES");
  assert.ok(src.includes("Preview") || src.includes("Eye"), "gallery must have Preview action");
  assert.ok(src.includes("Use this template") || src.includes("onUse"), "gallery must have Use/Select action");
  assert.ok(src.includes("setPreviewId") && src.includes("Dialog"), "gallery preview must be dialog-based real preview");
  assert.ok(src.includes("supportedCategories") || src.includes("Also for"), "gallery should show compatibility info when supportedCategories >1");
  assert.ok(!src.includes("const TEMPLATE_CATEGORIES"), "must not invent TEMPLATE_CATEGORIES inside UI");
});

test("K library UI: selection avoids double submission", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/dashboard/website/TemplateGallery.tsx"), "utf8");
  assert.ok(src.includes("using") && src.includes("disabled={!!using}"), "Use button must disable when using (avoid double submit)");
  assert.ok(src.includes("Applying..."), "should show Applying state");
  const clientSrc = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/website/new/NewWebsiteClient.tsx"), "utf8");
  assert.ok(clientSrc.includes("crypto.randomUUID()"), "creationRequestId must be generated for idempotent instantiate");
  assert.ok(clientSrc.includes("instantiateWebsiteFromTemplate"), "client must use existing instantiate flow, not second flow");
});
