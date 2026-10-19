/**
 * lib/__tests__/store-products-embed-validation.test.cjs
 *
 * Milestone 1 (Store hardening): the products_embed validator must preserve
 * valid Store-specific browse flags through validation → save → reload →
 * publish instead of silently discarding them.
 *
 * Covers:
 *  1. validateBlock preserves categoryTiles / siteLocalProductDetails /
 *     allowLargeCatalog / browsePageSize when valid.
 *  2. Absent flags stay absent (existing non-Store blocks unchanged).
 *  3. Non-boolean flags and non-numeric browsePageSize are rejected.
 *  4. browsePageSize clamps to 1..24.
 *  5. previewProducts stays render-only (never persisted by the validator).
 *  6. parseBlock fallback mirrors the same preservation leniently.
 *  7. Inspector controls exist for the owner-facing settings.
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
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

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

const {
  validateBlock,
  parseBlock,
  BLOCK_LIMITS,
} = require("../website-blocks.ts");

// ── 1. Preservation ──────────────────────────────────────────────────────────

test("validateBlock preserves valid Store browse flags", () => {
  const res = validateBlock({
    type: "products_embed",
    heading: "Shop",
    limit: 8,
    layout: "grid",
    categoryTiles: true,
    siteLocalProductDetails: true,
    allowLargeCatalog: true,
    browsePageSize: 12,
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.categoryTiles, true);
  assert.strictEqual(res.data.siteLocalProductDetails, true);
  assert.strictEqual(res.data.allowLargeCatalog, true);
  assert.strictEqual(res.data.browsePageSize, 12);
});

test("validateBlock preserves explicit false flags", () => {
  const res = validateBlock({
    type: "products_embed",
    categoryTiles: false,
    siteLocalProductDetails: false,
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.categoryTiles, false);
  assert.strictEqual(res.data.siteLocalProductDetails, false);
  assert.ok(!("allowLargeCatalog" in res.data));
  assert.ok(!("browsePageSize" in res.data));
});

// ── 2. Absent stays absent ───────────────────────────────────────────────────

test("validateBlock leaves non-Store blocks unchanged", () => {
  const res = validateBlock({
    type: "products_embed",
    heading: "Store",
    limit: 8,
    layout: "list",
  });
  assert.strictEqual(res.success, true);
  for (const key of [
    "categoryTiles",
    "siteLocalProductDetails",
    "allowLargeCatalog",
    "browsePageSize",
    "previewProducts",
  ]) {
    assert.ok(!(key in res.data), `${key} must stay absent`);
  }
});

// ── 3. Rejection ─────────────────────────────────────────────────────────────

test("validateBlock rejects non-boolean Store flags", () => {
  const res = validateBlock({
    type: "products_embed",
    categoryTiles: "yes",
    siteLocalProductDetails: 1,
  });
  assert.strictEqual(res.success, false);
  assert.ok(res.issues.some((i) => i.path === "categoryTiles"));
  assert.ok(res.issues.some((i) => i.path === "siteLocalProductDetails"));
});

test("validateBlock rejects non-numeric browsePageSize", () => {
  const res = validateBlock({
    type: "products_embed",
    browsePageSize: "many",
  });
  assert.strictEqual(res.success, false);
  assert.ok(res.issues.some((i) => i.path === "browsePageSize"));
});

// ── 4. Clamping ──────────────────────────────────────────────────────────────

test("browsePageSize clamps to 1..24", () => {
  assert.strictEqual(BLOCK_LIMITS.MIN_BROWSE_PAGE_SIZE, 1);
  assert.strictEqual(BLOCK_LIMITS.MAX_BROWSE_PAGE_SIZE, 24);

  const low = validateBlock({ type: "products_embed", browsePageSize: -5 });
  assert.strictEqual(low.success, true);
  assert.strictEqual(low.data.browsePageSize, 1);

  const high = validateBlock({ type: "products_embed", browsePageSize: 200 });
  assert.strictEqual(high.success, true);
  assert.strictEqual(high.data.browsePageSize, 24);

  const fractional = validateBlock({ type: "products_embed", browsePageSize: 7.8 });
  assert.strictEqual(fractional.success, true);
  assert.strictEqual(fractional.data.browsePageSize, 7);
});

// ── 5. previewProducts stays render-only ─────────────────────────────────────

test("validateBlock never persists previewProducts", () => {
  const res = validateBlock({
    type: "products_embed",
    previewProducts: [
      {
        id: "preview-1",
        name: "Sample",
        slug: "sample",
        description: "",
        images: [],
        price_type: "one_time",
        stock_quantity: null,
        status: "active",
        isDraft: true,
        category: null,
        tags: [],
        stripe_price_id: null,
      },
    ],
  });
  assert.strictEqual(res.success, true);
  assert.ok(!("previewProducts" in res.data));
});

// ── 6. Fallback parity ───────────────────────────────────────────────────────

test("parseBlock fallback preserves valid Store flags leniently", () => {
  const parsed = parseBlock({
    type: "products_embed",
    categoryTiles: true,
    siteLocalProductDetails: true,
    allowLargeCatalog: "nope",
    browsePageSize: 99,
    previewProducts: [{ id: "x" }],
    selectedProductIds: ["not-a-uuid"],
  });
  assert.ok(parsed);
  assert.strictEqual(parsed.categoryTiles, true);
  assert.strictEqual(parsed.siteLocalProductDetails, true);
  assert.ok(!("allowLargeCatalog" in parsed), "invalid flag dropped, not fatal");
  assert.strictEqual(parsed.browsePageSize, 24);
  assert.ok(!("previewProducts" in parsed));
  assert.deepStrictEqual(parsed.selectedProductIds, []);
});

test("validate → serialize → parse round-trip keeps Store flags", () => {
  const res = validateBlock({
    type: "products_embed",
    heading: "Shop",
    categoryTiles: true,
    siteLocalProductDetails: true,
    allowLargeCatalog: true,
    browsePageSize: 6,
  });
  assert.strictEqual(res.success, true);
  const revived = parseBlock(JSON.parse(JSON.stringify(res.data)));
  assert.strictEqual(revived.categoryTiles, true);
  assert.strictEqual(revived.siteLocalProductDetails, true);
  assert.strictEqual(revived.allowLargeCatalog, true);
  assert.strictEqual(revived.browsePageSize, 6);
});

// ── 7. Hero validator parity (badge 50) ──────────────────────────────────────

test("hero badge beyond 50 chars fails validation", () => {
  const res = validateBlock({ type: "hero", heading: "H", badge: "x".repeat(51) });
  assert.strictEqual(res.success, false);
  assert.ok(res.issues.some((i) => i.path === "badge"));
});

// ── 8. Source-level contracts ────────────────────────────────────────────────

test("resolver still emits Store browse flags from the manifest", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "lib/website-template-resolver.ts"),
    "utf8"
  );
  assert.ok(src.includes("categoryTiles"), "resolver sets categoryTiles");
  assert.ok(src.includes("siteLocalProductDetails"), "resolver sets site-local details");
  assert.ok(src.includes("browsePageSize"), "resolver sets page size");
});

test("products inspector exposes page-size control and Store note", () => {
  const src = fs.readFileSync(
    path.join(
      ROOT,
      "components/dashboard/website/builder/inspectors/ProductsEmbedInspector.tsx"
    ),
    "utf8"
  );
  assert.ok(src.includes("browsePageSize"), "page-size control bound");
  assert.ok(src.includes("Products Shown at Once"), "owner-friendly label");
});

test("hero inspector exposes tagline and background color", () => {
  const src = fs.readFileSync(
    path.join(
      ROOT,
      "components/dashboard/website/builder/inspectors/HeroInspector.tsx"
    ),
    "utf8"
  );
  assert.ok(src.includes("tagline"), "tagline control bound");
  assert.ok(src.includes("backgroundColor"), "background color control bound");
});
