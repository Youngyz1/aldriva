/**
 * lib/__tests__/store-product-carousel.test.cjs
 *
 * Hermetic tests for the Stage 3.5 public-site product carousel:
 * pure scroll-end helper (components/site/blocks/ProductCarousel.tsx),
 * money formatting (lib/money.ts), real stock states
 * (lib/store-product-detail.ts), EN/FR label parity, and source-level
 * contracts (role variables only, no banned storefront patterns, Store
 * home row wiring, other templates untouched, samples never leak).
 *
 * No DB, no network, no Stripe calls.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");
const Module = require("node:module");
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

require.extensions[".tsx"] = function compileTsx(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
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
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { computeCarouselEnds } = require("../../components/site/blocks/ProductCarousel.tsx");
const { formatMoney } = require("../money.ts");
const { getStoreProductStockState } = require("../store-product-detail.ts");

const carouselSource = fs.readFileSync(
  path.join(ROOT, "components/site/blocks/ProductCarousel.tsx"),
  "utf8"
);
const browseSource = fs.readFileSync(
  path.join(ROOT, "components/site/blocks/StorefrontBrowse.tsx"),
  "utf8"
);
const rendererSource = fs.readFileSync(
  path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"),
  "utf8"
);
const enStorefront = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8")).Storefront;
const frStorefront = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8")).Storefront;

// ── Scroll-end helper ───────────────────────────────────────────────────────

test("carousel ends: arrows only on overflow, disabled at the ends", () => {
  assert.deepEqual(
    computeCarouselEnds(0, 300, 300),
    { canPrev: false, canNext: false },
    "no overflow hides both arrows"
  );
  assert.deepEqual(
    computeCarouselEnds(0, 900, 300),
    { canPrev: false, canNext: true },
    "start of an overflowing row"
  );
  assert.deepEqual(
    computeCarouselEnds(600, 900, 300),
    { canPrev: true, canNext: false },
    "end of an overflowing row"
  );
  assert.deepEqual(
    computeCarouselEnds(300, 900, 300),
    { canPrev: true, canNext: true },
    "middle of an overflowing row"
  );
  assert.deepEqual(
    computeCarouselEnds(599.4, 900, 300),
    { canPrev: true, canNext: false },
    "sub-pixel rounding does not stick the next arrow on"
  );
});

// ── Money formatting ────────────────────────────────────────────────────────

test("formatMoney renders XOF, XAF, and USD for carousel prices", () => {
  assert.equal(formatMoney(1200, "XOF"), "FCFA 1,200");
  assert.equal(formatMoney(3000, "XAF"), "FCFA 3,000");
  assert.ok(!formatMoney(1200, "XOF").includes("€"), "no euro default for CFA");
  assert.ok(formatMoney(25, "USD").includes("25"), "USD renders its amount");
  assert.ok(!formatMoney(25, "USD").includes("FCFA"), "USD never renders FCFA");
});

// ── Real stock states ───────────────────────────────────────────────────────

test("stock badges come only from real stock state", () => {
  assert.equal(getStoreProductStockState("active", 0), "sold_out");
  assert.equal(getStoreProductStockState("out_of_stock", 9), "sold_out");
  assert.equal(getStoreProductStockState("active", 5), "low_stock");
  assert.equal(getStoreProductStockState("active", 6), "in_stock");
  assert.equal(getStoreProductStockState("active", null), "in_stock");
});

// ── EN/FR label parity ──────────────────────────────────────────────────────

test("carousel arrow labels exist in EN and FR with real translations", () => {
  for (const key of ["carouselPrev", "carouselNext"]) {
    assert.equal(typeof enStorefront[key], "string", `en Storefront.${key}`);
    assert.equal(typeof frStorefront[key], "string", `fr Storefront.${key}`);
    assert.notEqual(frStorefront[key], enStorefront[key], `fr Storefront.${key} is translated`);
  }
});

// ── Role variables only ─────────────────────────────────────────────────────

test("carousel uses Stage 1 role variables only", () => {
  assert.doesNotMatch(carouselSource, /#[0-9a-fA-F]{3,8}\b/, "no hardcoded hex colors");
  assert.doesNotMatch(
    carouselSource,
    /text-orange|bg-orange|border-orange|text-zinc|bg-zinc|border-zinc/,
    "no orange/zinc utilities"
  );
  assert.doesNotMatch(carouselSource, /text-\[10px\]|text-\[11px\]/, "no sub-12px text");
  assert.ok(carouselSource.includes("ps-button"), "shared button styles");
  assert.ok(carouselSource.includes("ps-card"), "shared card styles");
  assert.ok(carouselSource.includes("focus-visible"), "shared focus styles");
  assert.ok(carouselSource.includes("rounded-lg"), "8px card radius");
});

// ── Banned storefront patterns ──────────────────────────────────────────────

test("carousel output has no ratings, hearts, euro, guest counts, or dead links", () => {
  const haystack = carouselSource.toLowerCase();
  assert.ok(!haystack.includes("rating"), "no ratings");
  assert.ok(!haystack.includes("heart"), "no favourite button");
  assert.ok(!haystack.includes("review"), "no review counts");
  assert.ok(!carouselSource.includes("€"), "no euro default");
  assert.ok(!carouselSource.includes("/ guest"), "no per-guest counts");
  assert.ok(!carouselSource.includes('href="#"'), "no dead links");
  assert.ok(browseSource.includes('item.action.href !== "#"'), "upstream dead links are filtered");
});

// ── Card data contract ──────────────────────────────────────────────────────

test("carousel cards reuse owner data with graceful fallbacks", () => {
  assert.match(carouselSource, /loading="lazy"/, "images lazy-load");
  assert.ok(carouselSource.includes("placeholder") || carouselSource.includes("aria-hidden"), "missing image has a plain placeholder");
  assert.doesNotMatch(carouselSource, /unsplash|picsum|placehold\.|dummyimage/i, "no stock photos or remote hotlinks");
  assert.match(carouselSource, /next\/link/, "names link through the site router");
  assert.ok(carouselSource.includes("priceLabel"), "server-formatted price labels");
  assert.doesNotMatch(carouselSource, /formatMoney\(|formatCurrency\(|Intl\.NumberFormat/, "no client-side price formatting");
});

// ── Store home row wiring ───────────────────────────────────────────────────

test("Store home row renders the carousel and hides with no items", () => {
  assert.match(rendererSource, /<ProductCarousel items=\{staticItems\.map\(toCarouselItem\)\}/);
  assert.match(rendererSource, /carousel=\{\{/);
  assert.match(browseSource, /carousel\?: \{/);
  assert.match(browseSource, /<ProductCarousel/);
  assert.match(rendererSource, /if \(products\.length === 0\) return null;/);
  assert.match(rendererSource, /badgeTone: stockState === "sold_out" \? "alert" : "muted"/);
});

// ── Other templates unchanged ───────────────────────────────────────────────

test("non-Store embeds and menu rendering are untouched", () => {
  const menuSection = rendererSource.slice(rendererSource.indexOf("MenuEmbedBlockRenderer"));
  assert.ok(!menuSection.includes("ProductCarousel"), "menu output has no carousel");
  assert.match(rendererSource, /<div className="grid grid-cols-1 gap-\[var\(--ps-space-6\)\] sm:grid-cols-2 lg:grid-cols-3">/);
  assert.match(
    browseSource,
    /\) : carousel \? \(\s*<ProductCarousel/,
    "carousel renders only through the opt-in prop"
  );
});

// ── Samples never leak ──────────────────────────────────────────────────────

test("preview products still flow through the existing preview path only", () => {
  assert.match(rendererSource, /block\.previewProducts \?\? \[\]/);
  assert.doesNotMatch(carouselSource, /previewProducts|STORE_PREVIEW_PRODUCTS|sample/i);
});
