/**
 * lib/__tests__/store-milestone2.test.cjs
 *
 * Milestone 2 (Store completion): Shop sorting/filtering, multi-image
 * detail, category reuse, site-local checkout return, confirmation tenancy,
 * and the product-detail pre-stream gate.
 *
 * Hermetic: pure sort helper (lib/storefront-browse.ts), money formatting,
 * EN/FR parity, and source-level contracts. No DB, no network, no Stripe.
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

const { sortBrowseItems } = require("../storefront-browse.ts");
const { formatMoney } = require("../money.ts");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const enStorefront = JSON.parse(read("messages/en.json")).Storefront;
const frStorefront = JSON.parse(read("messages/fr.json")).Storefront;

function browseItem(id, overrides = {}) {
  return {
    id,
    name: `Product ${id}`,
    description: null,
    image: null,
    priceLabel: null,
    tags: [],
    detailRows: [],
    ...overrides,
  };
}

// ── Pure sort ────────────────────────────────────────────────────────────────

test("featured keeps server order", () => {
  const items = [browseItem("b"), browseItem("a"), browseItem("c")];
  assert.deepStrictEqual(
    sortBrowseItems(items, "featured").map((i) => i.id),
    ["b", "a", "c"]
  );
});

test("newest sorts by createdAt descending, unknown last", () => {
  const items = [
    browseItem("old", { createdAt: "2024-01-01T00:00:00Z" }),
    browseItem("unknown"),
    browseItem("new", { createdAt: "2026-05-01T00:00:00Z" }),
    browseItem("mid", { createdAt: "2025-06-01T00:00:00Z" }),
  ];
  assert.deepStrictEqual(
    sortBrowseItems(items, "newest").map((i) => i.id),
    ["new", "mid", "old", "unknown"]
  );
});

test("price sorts honor Stripe amounts with unpriced last", () => {
  const items = [
    browseItem("mid", { numericPrice: 20 }),
    browseItem("free-unknown"),
    browseItem("cheap", { numericPrice: 5 }),
    browseItem("pricey", { numericPrice: 99.99 }),
  ];
  assert.deepStrictEqual(
    sortBrowseItems(items, "priceAsc").map((i) => i.id),
    ["cheap", "mid", "pricey", "free-unknown"]
  );
  assert.deepStrictEqual(
    sortBrowseItems(items, "priceDesc").map((i) => i.id),
    ["pricey", "mid", "cheap", "free-unknown"]
  );
});

test("sort is stable for ties", () => {
  const items = [
    browseItem("first", { numericPrice: 10 }),
    browseItem("second", { numericPrice: 10 }),
  ];
  assert.deepStrictEqual(
    sortBrowseItems(items, "priceAsc").map((i) => i.id),
    ["first", "second"]
  );
});

// ── Money ────────────────────────────────────────────────────────────────────

test("confirmation totals render through formatMoney", () => {
  assert.equal(formatMoney(25, "USD", "en-US"), "$25.00");
  assert.equal(formatMoney(1200, "XOF"), "FCFA 1,200");
  const view = read("components/site/v2/StoreOrderConfirmationView.tsx");
  assert.ok(view.includes("formatMoney"), "confirmation uses the shared formatter");
});

// ── i18n parity ──────────────────────────────────────────────────────────────

test("sort and confirmation labels exist in EN and FR", () => {
  for (const key of [
    "sortLabel",
    "sortFeatured",
    "sortNewest",
    "sortPriceAsc",
    "sortPriceDesc",
    "storeOrderConfirmedTitle",
    "storeOrderConfirmedBody",
    "storeOrderPendingTitle",
    "storeOrderPendingBody",
    "storeOrderFailedTitle",
    "storeOrderFailedBody",
    "storeOrderReference",
  ]) {
    assert.equal(typeof enStorefront[key], "string", `en Storefront.${key}`);
    assert.equal(typeof frStorefront[key], "string", `fr Storefront.${key}`);
    assert.notEqual(frStorefront[key], enStorefront[key], `fr ${key} translated`);
  }
});

// ── Source contracts ─────────────────────────────────────────────────────────

test("product resolver projects created_at for newest sort", () => {
  const src = read("lib/website-embeds.ts");
  assert.ok(src.includes("stripe_price_id, created_at"), "projection includes created_at");
  assert.ok(src.includes("created_at: typeof item.created_at"), "mapping carries it");
});

test("browse renderer feeds numericPrice, createdAt, and sort labels", () => {
  const src = read("components/site/blocks/BlockRenderer.tsx");
  assert.ok(src.includes("numericPrice: price ? price.amount : undefined"));
  assert.ok(src.includes('"created_at" in product'));
  assert.ok(src.includes("sortLabel"), "sort labels resolved");
  assert.match(src, /sort=\{sortLabels\}/);
});

test("browse client exposes opt-in sort select", () => {
  const src = read("components/site/blocks/StorefrontBrowse.tsx");
  assert.ok(src.includes("sortBrowseItems"), "pure sort applied");
  assert.ok(src.includes("handleSortChange"), "sort resets pagination");
  assert.match(src, /<select[^>]*value=\{sortKey\}/);
});

test("detail gallery renders every owner image with thumbnails", () => {
  const gallery = read("components/site/v2/StoreProductGallery.tsx");
  assert.ok(gallery.includes("useState"), "thumbnail selection is interactive");
  assert.ok(gallery.includes('role="group"'), "thumbnails grouped for AT");
  assert.ok(gallery.includes("aria-pressed"), "active thumbnail exposed");
  const page = read("app/site/[slug]/products/[productSlug]/page.tsx");
  assert.ok(page.includes("StoreProductGallery"), "detail page uses the gallery");
  assert.ok(page.includes("safeImages"), "all valid images passed, not just the first");
  assert.doesNotMatch(page, /const safeImage = image \? safeImageSrc/);
});

test("checkout honors validated siteSlug with site-local return URLs", () => {
  const src = read("app/api/checkout/product/route.ts");
  assert.ok(src.includes("rawSiteSlug"), "siteSlug accepted from buyer form");
  assert.ok(src.includes("siteTemplateId === \"store\""), "Store template verified");
  assert.ok(src.includes("siteBusinessIds.has(product.business_id)"), "tenant ownership verified");
  assert.ok(src.includes("/site/${siteSlug}/order-confirmation"), "site-local success URL");
  assert.ok(src.includes("/site/${siteSlug}/products/"), "site-local cancel URL");
  assert.ok(src.includes("/products/order-confirmation"), "platform fallback retained");
  const button = read("components/site/v2/StoreProductPurchaseButton.tsx");
  assert.ok(button.includes("siteSlug"), "button threads the site slug");
});

test("site confirmation binds the order to the site tenant", () => {
  const src = read("app/site/[slug]/order-confirmation/page.tsx");
  assert.ok(src.includes("template.id !== \"store\""), "Store-only page");
  assert.ok(src.includes("businessIds.includes(orderProduct.business_id)"), "tenant binding");
  assert.ok(src.includes("/api/products/order-lookup"), "reuses buyer-proofed lookup");
  assert.doesNotMatch(src, /product_orders.*insert|create.*order/i, "no parallel order writes");
});

test("proxy gates site product slugs before streaming", () => {
  const src = read("proxy.ts");
  assert.ok(src.includes("checkStoreProductAccess"), "helper exists");
  assert.ok(src.includes("storeProductMatch"), "matcher wired into the site gate");
  assert.ok(src.includes("/products/"), "products subpath distinguished");
  assert.ok(src.includes("out_of_stock"), "sold-out detail state allowed through");
});

test("category suggestions reuse owner values without a new table", () => {
  const action = read("lib/actions/products.ts");
  assert.ok(action.includes("getOwnerProductCategories"), "helper exists");
  assert.ok(action.includes('.eq("owner_id", user.id)'), "owner-scoped");
  assert.doesNotMatch(action, /product_categories/);
  const fields = read("components/products/DigitalProductFields.tsx");
  assert.ok(fields.includes("categorySuggestions"), "suggestions prop exists");
  assert.ok(fields.includes("<datalist"), "native reuse UI, free text still allowed");
  for (const page of [
    "app/dashboard/products/new/page.tsx",
    "app/dashboard/products/[id]/edit/page.tsx",
  ]) {
    assert.ok(read(page).includes("getOwnerProductCategories"), `${page} feeds suggestions`);
  }
});
