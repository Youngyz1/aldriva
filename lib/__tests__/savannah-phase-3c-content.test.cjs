/**
 * lib/__tests__/savannah-phase-3c-content.test.cjs
 *
 * Hermetic resolver/content tests for Savannah Phase 3c (Steps 1-5):
 *  - Promo slot read/write chain via shared slot-value helpers
 *  - Promo end-date hiding (past/future/none)
 *  - Highlights image item field gated to Savannah
 *  - Hero focal point/fit extras plumbing
 *  - CT A band slots unlocked for Savannah
 *  - Menu embed catalog-carousel variant for Savannah
 *  - Template switch Savannah <-> Table & Flame content preservation
 *  - Contrast tokens for all six Savannah palettes
 *  - Ordering/reservation feature derivation with Promo present
 *
 * No DB, no network. Uses the same transpile/alias harness as website-template-v2.test.cjs.
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
Module._load = function mockNextFontGoogle(request, parent, isMain) {
  if (request === "next/font/google") {
    return {
      Arimo: fontStub("font-arimo-test"),
      Fraunces: fontStub("font-fraunces-test"),
      Geist: fontStub("font-geist-test"),
      Geist_Mono: fontStub("font-geist-mono-test"),
    };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const {
  RESTAURANT_SAVANNAH,
  RESTAURANT_TABLE_FLAME,
} = require("@/lib/website-template-v2");
const { resolveTemplateContent, planTemplateSwitch } = require("@/lib/website-template-resolver");

const {
  readSlotValue,
  applySlotValue,
} = require("@/lib/website-v2-slot-value");
const { validateBlock } = require("@/lib/website-blocks");
const { contrastRatio } = require("@/lib/readable-on");

// ── Promo slot value chain ──
test("Savannah promo read/write chain: image/headline/text/button_label/button_link/end_date via template_extras", () => {
  const fields = [
    { slot: "promo.image", extraKey: "image", value: "/uploads/promo-hero.png" },
    { slot: "promo.eyebrow", extraKey: "eyebrow", value: "Limited Time" },
    { slot: "promo.headline", extraKey: "headline", value: "Seasonal Tasting Menu" },
    { slot: "promo.text", extraKey: "text", value: "Chef's curated seasonal tasting menu." },
    { slot: "promo.button_label", extraKey: "button_label", value: "Reserve a table" },
    { slot: "promo.button_link", extraKey: "button_link", value: "/reservations" },
    { slot: "promo.end_date", extraKey: "end_date", value: "2026-12-31" },
  ];

  let doc = {};
  for (const { extraKey, value } of fields) {
    doc = applySlotValue(doc, "promo", extraKey, value);
  }

  assert.deepEqual(doc.template_extras, {
    image: "/uploads/promo-hero.png",
    eyebrow: "Limited Time",
    headline: "Seasonal Tasting Menu",
    text: "Chef's curated seasonal tasting menu.",
    button_label: "Reserve a table",
    button_link: "/reservations",
    end_date: "2026-12-31",
  });

  for (const { extraKey, value } of fields) {
    assert.equal(readSlotValue(doc, "promo", extraKey), value, `promo.${extraKey} reads back`);
  }

  // ExtraKey present + field === "template_extras" keeps old extras path for Store slots
  assert.equal(readSlotValue(doc, "template_extras", "image"), "/uploads/promo-hero.png");
  assert.equal(applySlotValue(doc, "template_extras", "image", "/new.png").template_extras.image, "/new.png");
});

test("Savannah promo all-empty renders nothing; partial content renders", () => {
  const empty = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {}, { includeSamples: false });
  const home = empty.pages.find((p) => p.isHome);
  assert.ok(!home.blocks.some((b) => b.type === "cta_banner" && b.variant === "promo"),
    "no promo block when nothing is set");

  const withImage = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    promo: { image: "/uploads/promo.png" },
  }, { includeSamples: false });
  const home2 = withImage.pages.find((p) => p.isHome);
  assert.ok(home2.blocks.some((b) => b.type === "cta_banner" && b.variant === "promo" && b.image === "/uploads/promo.png"),
    "promo block present when only image is set");

  const full = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    promo: {
      eyebrow: "Limited Time",
      headline: "Seasonal Menu",
      text: "Chef's curated seasonal tasting menu.",
      button_label: "Reserve a table",
      button_link: "/reservations",
      end_date: "2026-12-31",
    },
  }, { includeSamples: false });
  const home3 = full.pages.find((p) => p.isHome);
  const promo = home3.blocks.find((b) => b.type === "cta_banner" && b.variant === "promo");
  assert.equal(promo.heading, "Seasonal Menu");
  assert.equal(promo.subheading, "Chef's curated seasonal tasting menu.");
  assert.equal(promo.eyebrow, "Limited Time");
  assert.equal(promo.endDate, "2026-12-31");
});

test("Savannah promo past end date hides the block; future end date shows it", () => {
  const past = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    promo: { headline: "Expired Offer", end_date: "2020-01-01" },
  }, { includeSamples: false, now: new Date("2026-06-01T12:00:00Z") });
  assert.ok(!past.pages.find((p) => p.isHome).blocks.some((b) => b.type === "cta_banner" && b.variant === "promo"),
    "promo with past end date is hidden at resolver time");

  const future = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    promo: { headline: "Coming Soon", end_date: "2099-12-31" },
  }, { includeSamples: false, now: new Date("2026-06-01T12:00:00Z") });
  assert.ok(future.pages.find((p) => p.isHome).blocks.some((b) => b.type === "cta_banner" && b.variant === "promo"),
    "promo with future end date is shown");

  const noDate = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    promo: { headline: "No Expiry" },
  }, { includeSamples: false, now: new Date("2026-06-01T12:00:00Z") });
  assert.ok(noDate.pages.find((p) => p.isHome).blocks.some((b) => b.type === "cta_banner" && b.variant === "promo"),
    "promo with no end date is shown");
});

// ── Highlights image gated to Savannah ──
test("Savannah highlights image item field is exposed in the editor schema", () => {
  const sections = require("@/lib/website-v2-editor-schema").buildWebsiteEditorSections(
    RESTAURANT_SAVANNAH,
    { highlights: [{ title: "Tacos", description: "Great tacos" }] },
    { pages: [{ slug: "home", blocks: [{ type: "features", items: [{ title: "Tacos" }] }] }] },
  );
  const highlights = sections.find((s) => s.id === "highlights");
  assert.ok(highlights, "highlights section exists for Savannah");
  const imageField = highlights.controls.find((c) => c.id === "highlights.items")?.itemFields?.find((f) => f.key === "image");
  assert.ok(imageField, "highlights.items exposes an image itemField for Savannah");
  assert.equal(imageField.kind, "image");
  assert.ok(["image", "image_url", "photo", "src"].includes(imageField.aliases ? imageField.aliases[0] : "image"),
    "image key accepts URL-like aliases");
});

test("Table & Flame does NOT get the highlights image item field (gated to Savannah)", () => {
  const sections = require("@/lib/website-v2-editor-schema").buildWebsiteEditorSections(
    RESTAURANT_TABLE_FLAME,
    { highlights: [{ title: "Tacos", description: "Great tacos" }] },
    { pages: [{ slug: "home", blocks: [{ type: "features", items: [{ title: "Tacos" }] }] }] },
  );
  const highlights = sections.find((s) => s.id === "highlights");
  assert.ok(highlights);
  const imageField = highlights.controls.find((c) => c.id === "highlights.items")?.itemFields?.find((f) => f.key === "image");
  assert.ok(!imageField, "highlights.items has no image itemField for Table & Flame");
});

// ── Hero focal point / fit ──
test("Savannah hero focal point defaults to 50/50 and maps to imagePosition", () => {
  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    hero_headline: "Hero",
    template_extras: { savannahHeroFocalX: 30, savannahHeroFocalY: 70 },
  }, { includeSamples: false });
  const hero = resolved.pages.find((p) => p.isHome).blocks.find((b) => b.type === "hero");
  assert.equal(hero.imagePosition, "30% 70%", "focal x/y map to imagePosition");
});

test("Savannah hero focal point missing side defaults to 50", () => {
  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    hero_headline: "Hero",
    template_extras: { savannahHeroFocalX: 10 },
  }, { includeSamples: false });
  const hero = resolved.pages.find((p) => p.isHome).blocks.find((b) => b.type === "hero");
  assert.equal(hero.imagePosition, "10% 50%", "missing focal Y defaults to 50");
});

test("Savannah hero 'Show full image' fit maps to imageFit contain with soft backing", () => {
  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    hero_headline: "Hero",
    hero_image: "/uploads/hero.png",
    template_extras: { savannahHeroFit: "contain" },
  }, { includeSamples: false });
  const hero = resolved.pages.find((p) => p.isHome).blocks.find((b) => b.type === "hero");
  assert.equal(hero.imageFit, "contain", "hero fit maps to imageFit contain");
  const v = validateBlock(hero);
  assert.equal(v.success, true, "hero block with imageFit contain validates");
});

test("Savannah hero default fit is cover (no imageFit emitted)", () => {
  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    hero_headline: "Hero",
    hero_image: "/uploads/hero.png",
  }, { includeSamples: false });
  const hero = resolved.pages.find((p) => p.isHome).blocks.find((b) => b.type === "hero");
  assert.equal(hero.imageFit, undefined, "default hero fit is cover (no imageFit)");
});

// ── CT A band slots unlocked for Savannah ──
test("Savannah cta-band section is unlocked and editable", () => {
  assert.equal(RESTAURANT_SAVANNAH.lockedBlocks.includes("cta-band"), false,
    "cta-band removed from Savannah lockedBlocks");
  const ctaBandSection = RESTAURANT_SAVANNAH.sections.find((s) => s.id === "cta-band");
  assert.ok(ctaBandSection, "cta-band section exists");
  assert.equal(ctaBandSection.locked, undefined, "cta-band section is not locked");
  assert.ok(ctaBandSection.slots.includes("cta.heading"), "cta.heading slot present");
  assert.ok(ctaBandSection.slots.includes("cta.button_label"), "cta.button_label slot present");
  assert.ok(ctaBandSection.slots.includes("cta.button_link"), "cta.button_link slot present");
});

test("Savannah cta band renders custom heading/button from template_extras", () => {
  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    template_extras: {
      ctaBandHeading: "View our menu",
      ctaBandButtonLabel: "See the menu",
      ctaBandButtonLink: "/menu",
    },
  }, { includeSamples: false });
  const home = resolved.pages.find((p) => p.isHome);
  const band = home.blocks.find((b) => b.type === "cta_banner");
  assert.equal(band.heading, "View our menu", "cta band uses custom heading");
  assert.equal(band.ctaLabel, "See the menu", "cta band uses custom button label");
  assert.equal(band.ctaHref, "/menu", "cta band uses custom button link");
});

test("Savannah cta band defaults fall back to feature-derived View menu", () => {
  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    template_extras: {},
  }, { includeSamples: false, viewMenuLabel: "View menu" });
  const home = resolved.pages.find((p) => p.isHome);
  const band = home.blocks.find((b) => b.type === "cta_banner");
  assert.equal(band.heading, "Join us around the table.", "cta band default heading");
  assert.equal(band.ctaLabel, "View menu", "cta band default label is View menu");
  assert.equal(band.ctaHref, "/menu", "cta band default link is /menu");
});

// ── Menu embed catalog-carousel ──
test("Savannah menu_embed emits catalog-carousel variant; Table & Flame emits rows", () => {
  const savannah = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    featured: { menu_item_ids: ["11111111-1111-1111-1111-111111111111"] },
  }, { includeSamples: false });
  const savannahHome = savannah.pages.find((p) => p.isHome);
  const bestSellers = savannahHome.blocks.find((b) => b.type === "menu_embed" && b.heading === "Best sellers");
  assert.equal(bestSellers.variant, "catalog-carousel", "Savannah best sellers uses catalog-carousel");

  const tableFlame = resolveTemplateContent(RESTAURANT_TABLE_FLAME.id, RESTAURANT_TABLE_FLAME.version, {
    featured: { menu_item_ids: ["11111111-1111-1111-1111-111111111111"] },
  }, { includeSamples: false });
  const tfHome = tableFlame.pages.find((p) => p.isHome);
  const tfBest = tfHome.blocks.find((b) => b.type === "menu_embed" && b.heading === "Featured dishes");
  assert.equal(tfBest.variant, "rows", "Table & Flame keeps rows variant");
});

test("catalog-carousel variant passes validateBlock", () => {
  const v = validateBlock({ type: "menu_embed", variant: "catalog-carousel", heading: "Best sellers", limit: 6, layout: "grid" });
  assert.equal(v.success, true, "catalog-carousel variant is accepted by validateBlock");
});

// ── Template switch Savannah <-> Table & Flame keeps content ──
test("Template switch Savannah <-> Table & Flame preserves unslotted content keys", () => {
  const content = {
    business_name: "Savannah House",
    hero_headline: "A calm plate",
    promo: { headline: "Seasonal", image: "/uploads/promo.png" },
    highlights: [{ title: "Tacos", description: "Great tacos", image: "/uploads/taco.png" }],
    template_extras: { savannahHeroFit: "contain", savannahHeroFocalX: 30 },
  };
  const plan = planTemplateSwitch(
    "restaurant-savannah", "restaurant-table-flame", content
  );
  assert.ok(plan.keptUnslottedKeys.includes("template_extras"),
    "template_extras kept when switching away from Savannah");
  assert.ok(plan.keptUnslottedKeys.includes("promo"),
    "promo kept when switching away from Savannah");
  // highlights is a shared slot field (both templates have it), so not unslotted
  assert.ok(!plan.keptUnslottedKeys.includes("highlights"),
    "highlights is a shared slot, not unslotted on switch");
});

// ── Contrast for all six Savannah palettes ──
test("All six Savannah palettes meet contrast minimums", () => {
  for (const palette of RESTAURANT_SAVANNAH.palettes) {
    const baseToInk = contrastRatio(palette.base, palette.ink);
    assert.ok(baseToInk >= 4.5, `${palette.id}: base/ink contrast ${baseToInk.toFixed(2)} >= 4.5`);
    if (palette.soft) {
      const softToInk = contrastRatio(palette.soft, palette.ink);
      assert.ok(softToInk >= 3, `${palette.id}: soft/ink contrast ${softToInk.toFixed(2)} >= 3`);
    }
  }
});

// ── Ordering/reservation feature derivation with Promo present ──
test("Savannah storefrontFeatures ordering/reservations derived with Promo present", () => {
  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    promo: { headline: "Seasonal" },
  }, {
    includeSamples: false,
    business: {
      offerings: ["online_ordering", "table_reservations"],
      capabilities: ["ONLINE_ORDERING", "RESERVATIONS"],
    },
    reservationsApproved: true,
  });
  const home = resolved.pages.find((p) => p.isHome);
  assert.ok(home.blocks.some((b) => b.type === "cta_banner" && b.variant === "promo"),
    "promo block is emitted when content present");
  // Feature derivation comes from getBuiltStorefrontFeatures + resolveStorefrontFeatures
  const built = require("@/lib/storefront-features").getBuiltStorefrontFeatures(RESTAURANT_SAVANNAH);
  assert.ok(built.ordering, "Savannah built features include ordering");
  assert.ok(built.reservations, "Savannah built features include reservations");
});
