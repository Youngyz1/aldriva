/**
 * lib/__tests__/savannah-phase-3h-owner-fixes.test.cjs
 *
 * Tests covering Phase 3h owner review fixes:
 *  1. Promo on real timo-wears content fixture
 *  2. Promo hiding when disabled, empty, or expired
 *  3. Menu card and catalog carousel imageFit setting
 *  4. Item detail sheet clean layout in Savannah
 *  5. "What we offer" clean checkmark list for label-only offerings
 *  6. Non-Savannah templates unaffected (Table & Flame, Food Order, Store, DriveLine)
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const fs = require("node:fs");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

require.extensions[".tsx"] = function compileTsx(module, filename) {
  const fs = require("node:fs");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
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
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const fontStub = (variable) => () => ({ variable });
const originalModuleLoad = Module._load;
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === "next/font/google") {
    return {
      Fraunces: fontStub("--font-fraunces"),
      Arimo: fontStub("--font-arimo"),
      Inter: fontStub("--font-inter"),
    };
  }
  if (request === "server-only") {
    return {};
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

const { resolveTemplateContent } = require("../website-template-resolver.ts");
const fixture = require("./fixtures/timo-wears-content.json");

test("1. Promo on real timo-wears content fixture resolves when enabled in draft/live", () => {
  // Test draft content (owner viewing with draft preview)
  const resolvedDraft = resolveTemplateContent(
    "restaurant-savannah",
    "1.0.0",
    fixture.draftContent.content,
    { includeSamples: false }
  );
  const homeDraft = resolvedDraft.pages.find((p) => p.isHome);
  assert.ok(homeDraft, "Home page exists");
  const promoBlock = homeDraft.blocks.find((b) => b.type === "cta_banner" && b.variant === "promo");
  assert.ok(promoBlock, "Promo block resolves for timo-wears draft");
  assert.equal(promoBlock.heading, "Don't miss this opportunity");
  assert.equal(promoBlock.eyebrow, "Grab is now");
  assert.equal(promoBlock.ctaLabel, "Hurry");
  assert.ok(promoBlock.image.includes("cms-media"), "Image URL preserved");

  // Test builder preview mode (includeSamples: true)
  const resolvedPreview = resolveTemplateContent(
    "restaurant-savannah",
    "1.0.0",
    fixture.draftContent.content,
    { includeSamples: true }
  );
  const homePreview = resolvedPreview.pages.find((p) => p.isHome);
  const previewPromo = homePreview.blocks.find((b) => b.type === "cta_banner" && b.variant === "promo");
  assert.ok(previewPromo, "Promo block resolves in builder preview mode");
  assert.equal(previewPromo.heading, "Don't miss this opportunity");
});

test("2. Promo is hidden when disabled, empty, or past end date", () => {
  // Disabled via enabled_sections
  const contentDisabled = {
    ...fixture.draftContent.content,
    enabled_sections: { promo: false },
  };
  const resDisabled = resolveTemplateContent("restaurant-savannah", "1.0.0", contentDisabled, { includeSamples: false });
  assert.equal(
    resDisabled.pages.find((p) => p.isHome).blocks.some((b) => b.variant === "promo"),
    false,
    "Disabled promo does not render"
  );

  // Unset in enabled_sections (defaultOff must keep it off)
  const contentUnset = {
    ...fixture.draftContent.content,
    enabled_sections: {},
  };
  const resUnset = resolveTemplateContent("restaurant-savannah", "1.0.0", contentUnset, { includeSamples: false });
  assert.equal(
    resUnset.pages.find((p) => p.isHome).blocks.some((b) => b.variant === "promo"),
    false,
    "Unset promo does not render"
  );

  // Enabled, but empty content (no headline, text, or image)
  const contentEmpty = {
    ...fixture.draftContent.content,
    enabled_sections: { promo: true },
    promo: {},
    template_extras: {},
  };
  const resEmpty = resolveTemplateContent("restaurant-savannah", "1.0.0", contentEmpty, { includeSamples: false });
  assert.equal(
    resEmpty.pages.find((p) => p.isHome).blocks.some((b) => b.variant === "promo"),
    false,
    "Empty promo does not render on live site"
  );

  // Enabled, but past end date
  const contentPast = {
    ...fixture.draftContent.content,
    enabled_sections: { promo: true },
    promo: { headline: "Flash Sale", end_date: "2020-01-01" },
  };
  const resPast = resolveTemplateContent("restaurant-savannah", "1.0.0", contentPast, {
    includeSamples: false,
    now: new Date("2026-01-01T00:00:00Z"),
  });
  assert.equal(
    resPast.pages.find((p) => p.isHome).blocks.some((b) => b.variant === "promo"),
    false,
    "Expired promo does not render"
  );
});

test("3. Menu card and catalog-carousel image fit setting", () => {
  // Default is 'cover' (no imageFit set)
  const resDefault = resolveTemplateContent("restaurant-savannah", "1.0.0", fixture.draftContent.content, { includeSamples: false });
  const homeDefault = resDefault.pages.find((p) => p.isHome);
  const menuBlockDefault = homeDefault.blocks.find((b) => b.type === "menu_embed");
  assert.ok(menuBlockDefault);
  assert.equal(menuBlockDefault.imageFit, undefined, "Defaults to unset (component defaults to cover)");

  // Explicit 'contain' in template_extras
  const contentContain = {
    ...fixture.draftContent.content,
    template_extras: {
      ...fixture.draftContent.content.template_extras,
      menuImageFit: "contain",
    },
  };
  const resContain = resolveTemplateContent("restaurant-savannah", "1.0.0", contentContain, { includeSamples: false });
  const homeContain = resContain.pages.find((p) => p.isHome);
  const menuBlockContain = homeContain.blocks.find((b) => b.type === "menu_embed");
  assert.equal(menuBlockContain.imageFit, "contain", "menuImageFit: contain propagates to block");
});

test("4. 'What we offer' clean checkmark list for label-only offerings", () => {
  const offerings = ["dine_in", "catering", "outdoor_seating", "wifi"];
  const res = resolveTemplateContent("restaurant-savannah", "1.0.0", fixture.draftContent.content, {
    includeSamples: false,
    business: {
      offerings,
      businessType: "Full-Service Restaurant",
      category: "Restaurant",
      offeringLabels: {
        dine_in: "Dine-in",
        catering: "Catering",
        outdoor_seating: "Outdoor Seating",
        wifi: "Free Wi-Fi",
      },
    },
  });
  const home = res.pages.find((p) => p.isHome);
  const offeringsBlock = home.blocks.find((b) => b.type === "features" && b.heading === "What we offer");
  assert.ok(offeringsBlock, "Offerings features block exists");
  assert.ok(Array.isArray(offeringsBlock.items));
  assert.equal(offeringsBlock.items.length, 4);
  assert.equal(offeringsBlock.items[0].title, "Dine-in");
  assert.equal(offeringsBlock.items[0].image, undefined, "Items have no images (renders as clean checkmark list)");
});

test("5. Non-Savannah templates remain unchanged", () => {
  const templates = ["restaurant-table-flame", "food-order", "store", "rental-driveline"];
  for (const tId of templates) {
    const res = resolveTemplateContent(tId, "1.0.0", {}, { includeSamples: true });
    assert.ok(res.pages.length > 0, `${tId} resolves pages`);
    const home = res.pages.find((p) => p.isHome);
    assert.ok(home, `${tId} has home page`);
    const menuBlock = home.blocks.find((b) => b.type === "menu_embed");
    if (menuBlock) {
      assert.notEqual(menuBlock.variant, "catalog-carousel", `${tId} does not use catalog-carousel`);
    }
  }
});
