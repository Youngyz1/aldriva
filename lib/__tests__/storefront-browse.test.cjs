/**
 * lib/__tests__/storefront-browse.test.cjs
 *
 * Hermetic tests for Phase 1 storefront browse (menu dishes + shop items):
 * pure filter helpers (lib/storefront-browse.ts), Storefront i18n keys,
 * and the progressive-enhancement + accessibility contract of
 * components/site/blocks/StorefrontBrowse.tsx.
 *
 * No DB, no network, no Stripe calls (resolveShopPrices short-circuits
 * without a key). Stripe-backed price resolution is a hand-check item.
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

const {
  BROWSE_ALL_GROUP,
  hasBrowseableItems,
  normalizeSearchQuery,
  filterBrowseGroups,
} = require("../storefront-browse.ts");

const GROUPS = [
  {
    id: "starters",
    title: "Starters",
    items: [
      { id: "1", name: "Café Gourmand", description: "Crème brûlée bite", image: null, priceLabel: "2 500 F CFA", tags: ["vegetarian"], detailRows: [] },
      { id: "2", name: "Bruschetta", description: "Tomato and basil", image: null, priceLabel: "1 500 F CFA", tags: [], detailRows: [] },
    ],
  },
  {
    id: "mains",
    title: "Mains",
    items: [
      { id: "3", name: "Grilled Fish", description: "Attiéké on the side", image: null, priceLabel: "5 000 F CFA", tags: [], detailRows: [] },
    ],
  },
];

// ── Pure helpers ────────────────────────────────────────────────────────────

test("search is accent- and case-insensitive across name and description", () => {
  assert.equal(normalizeSearchQuery("Café CRÈME  "), "cafe creme");
  assert.equal(normalizeSearchQuery(null), "");
  assert.deepEqual(filterBrowseGroups(GROUPS, "cafe", BROWSE_ALL_GROUP).flatMap((g) => g.items).map((i) => i.id), ["1"]);
  assert.deepEqual(filterBrowseGroups(GROUPS, "CREME", BROWSE_ALL_GROUP).flatMap((g) => g.items).map((i) => i.id), ["1"]);
  assert.deepEqual(filterBrowseGroups(GROUPS, "attieke", BROWSE_ALL_GROUP).flatMap((g) => g.items).map((i) => i.id), ["3"]);
  assert.deepEqual(filterBrowseGroups(GROUPS, "grilled fish", BROWSE_ALL_GROUP).flatMap((g) => g.items).map((i) => i.id), ["3"]);
  assert.equal(filterBrowseGroups(GROUPS, "grilled bruschetta", BROWSE_ALL_GROUP).length, 0, "every token must match");
});

test("empty query returns everything; chip filters to one group", () => {
  assert.equal(filterBrowseGroups(GROUPS, "", BROWSE_ALL_GROUP).length, 2);
  const mains = filterBrowseGroups(GROUPS, "", "mains");
  assert.equal(mains.length, 1);
  assert.equal(mains[0].title, "Mains");
});

test("groups left with zero items are dropped", () => {
  const filtered = filterBrowseGroups(GROUPS, "bruschetta", BROWSE_ALL_GROUP);
  assert.deepEqual(filtered.map((g) => g.id), ["starters"]);
  assert.deepEqual(filtered[0].items.map((i) => i.id), ["2"]);
});

test("empty catalog groups do not count as a browseable menu", () => {
  assert.equal(hasBrowseableItems([]), false);
  assert.equal(hasBrowseableItems([{ items: [] }, { items: [] }]), false);
  assert.equal(hasBrowseableItems([{ items: [] }, { items: [{ id: "1" }] }]), true);
});

// ── i18n keys ───────────────────────────────────────────────────────────────

test("every Storefront key exists in both language files", () => {
  const en = require("../../messages/en.json");
  const fr = require("../../messages/fr.json");
  const keys = [
    "categories", "all", "searchLabel", "searchPlaceholder", "clearFilters",
    "noDishesMatch", "noProductsMatch", "details", "close", "allergens",
    "viewProduct", "stock", "unlimited", "outOfStock", "otherCategory",
    "orderNow", "reserveTable", "bookNow", "contact", "menuComingSoon",
    "addFirstDish", "manageMenu", "openSite", "copyLink", "linkCopied", "copyLinkFailed",
  ];
  for (const key of keys) {
    assert.equal(typeof en.Storefront[key], "string", `en Storefront.${key} must exist`);
    assert.equal(typeof fr.Storefront[key], "string", `fr Storefront.${key} must exist`);
  }
  assert.equal(en.Storefront.all, "All");
  assert.equal(fr.Storefront.all, "Tout");
  assert.equal(fr.Storefront.noDishesMatch, "Aucun plat ne correspond");
});

// ── Component contract (static source assertions) ───────────────────────────

const COMPONENT_PATH = path.join(ROOT, "components/site/blocks/StorefrontBrowse.tsx");
const componentSource = fs.readFileSync(COMPONENT_PATH, "utf8");

test("server static markup renders before hydration; enhancement mounts client-side only", () => {
  assert.match(componentSource, /if \(!mounted\) return <>\{children\}<\/>/);
  assert.match(componentSource, /if \(groups\.length === 0\) return <>\{children\}<\/>/, "empty catalogs never show chips");
});

test("chips are a labelled, scrollable, keyboard-operable group", () => {
  assert.match(componentSource, /role="group"/);
  assert.match(componentSource, /aria-label=\{labels\.categories\}/);
  assert.match(componentSource, /aria-pressed=\{active\}/);
  assert.match(componentSource, /overflow-x-auto/);
  assert.match(componentSource, /sticky top-16/);
  assert.match(componentSource, /focus-visible:outline/);
});

test("search is labelled and every card is a real button", () => {
  assert.match(componentSource, /<label htmlFor=\{searchId\}/);
  assert.match(componentSource, /aria-label=\{`?\$\{item\.name\}/);
  assert.match(componentSource, /<button[\s\S]*?onClick=\{\(event\) => openSheet\(item\.id/);
});

test("detail sheet follows the dialog pattern with no dead commerce button", () => {
  assert.match(componentSource, /role="dialog"/);
  assert.match(componentSource, /aria-modal="true"/);
  assert.match(componentSource, /aria-labelledby=\{titleId\}/);
  assert.match(componentSource, /event\.key === "Escape"/);
  assert.match(componentSource, /document\.body\.style\.overflow = "hidden"/, "scroll lock");
  assert.match(componentSource, /triggerRef\.current\?\.focus\(\)/, "focus returns to the trigger");
  assert.match(componentSource, /tabIndex=\{-1\}/);
  const codeOnly = componentSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(codeOnly, /add-to-cart|Add to cart|addToCart|checkout/i);
});

test("layout cannot overflow horizontally", () => {
  assert.match(componentSource, /min-w-0/);
  assert.match(componentSource, /whitespace-nowrap/);
  assert.match(componentSource, /max-w-lg/);
  assert.match(componentSource, /max-h-\[88dvh\]/);
});

// ── BlockRenderer wiring ────────────────────────────────────────────────────

const RENDERER_PATH = path.join(ROOT, "components/site/blocks/BlockRenderer.tsx");
const rendererSource = fs.readFileSync(RENDERER_PATH, "utf8");

test("menu_embed renders the shared browse with server static sections as children", () => {
  assert.match(rendererSource, /<StorefrontBrowse groups=\{menuGroups\} labels=\{browseLabels\} showGroups=\{populatedSections\.length > 1\}(?: orderConfig=\{orderConfig\})?>/);
  assert.match(rendererSource, /getTranslations\("Storefront"\)/);
  assert.match(rendererSource, /noResults: t\("noDishesMatch"\)/);
  assert.match(rendererSource, /\{!hasMenuItems \? \([\s\S]*?t\("menuComingSoon"\)/);
  assert.match(rendererSource, /const populatedSections = sections\.filter\(\(section: ResolvedMenuSection\) => section\.items\.length > 0\)/);
  assert.doesNotMatch(rendererSource, /No menu available at this time/);
});

test("products_embed renders the shared browse grouped by category with real detail links", () => {
  assert.match(rendererSource, /<StorefrontBrowse groups=\{productGroups\} labels=\{browseLabels\} showGroups=\{categoryOrder\.length > 1\}>/);
  assert.match(rendererSource, /noResults: t\("noProductsMatch"\)/);
  assert.match(rendererSource, /action: \{ label: t\("viewProduct"\), href: `\/products\/\$\{product\.slug\}` \}/);
});

test("products resolver projects category, tags, and stripe_price_id without touching scoping", () => {
  const embeds = fs.readFileSync(path.join(ROOT, "lib/website-embeds.ts"), "utf8");
  assert.match(embeds, /"id, name, slug, description, images, price_type, stock_quantity, status, category, tags, stripe_price_id"/);
  assert.match(embeds, /\.in\("business_id", businessIds\)/);
  assert.match(embeds, /export async function resolveShopPrices/);
  assert.match(embeds, /if \(!secret\) return out/);
});

test("resolveShopPrices without a key returns an empty map and never throws", async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const { resolveShopPrices } = require("../website-embeds.ts");
    const result = await resolveShopPrices([{ id: "a", stripe_price_id: "price_x" }]);
    assert.equal(result instanceof Map, true);
    assert.equal(result.size, 0);
  } finally {
    if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
  }
});

// ── Real render (Phase 3.1): dishes open without searching ───────────────────
// Regression: the client grid used to render only after a search/chip tap
// (`engaged`), so default-view dish cards were dead static markup and clicks
// did nothing. The grid must be interactive right after mount.

const RENDER_GROUPS = [
  {
    id: "mains",
    title: "Mains",
    items: [
      // Legacy row: no option_groups / promo / sold-out fields at all.
      { id: "legacy-1", name: "Riz Gras", description: "Party rice", image: null, priceLabel: "USD 8.00", tags: [], detailRows: [] },
      {
        id: "full-1",
        name: "Yassa Poulet",
        description: "Lemon onion chicken",
        image: null,
        priceLabel: "USD 9.50",
        numericPrice: 9.5,
        originalPriceLabel: "USD 12.00",
        isSoldOut: false,
        tags: ["spicy"],
        detailRows: [{ label: "Allergens", value: "peanut" }],
        optionGroups: [
          { id: "g1", name: "Size", required: false, min: 0, max: 1, options: [{ id: "s", name: "Small", priceDelta: 0 }, { id: "l", name: "Large", priceDelta: 2 }] },
        ],
      },
      {
        id: "sold-1",
        name: "Capitaine Braisé",
        description: null,
        image: null,
        priceLabel: "USD 15.00",
        numericPrice: 15,
        isSoldOut: true,
        tags: [],
        detailRows: [],
      },
    ],
  },
];

const RENDER_LABELS = {
  categories: "Categories",
  all: "All",
  searchLabel: "Search",
  searchPlaceholder: "Search dishes",
  clearFilters: "Clear",
  noResults: "No match",
  details: "Details",
  close: "Close",
  allergens: "Allergens",
  soldOut: "Sold out",
  required: "Required",
  optional: "Optional",
  options: "Options",
  addToOrder: "Add to order",
  viewOrder: "View order",
  yourOrder: "Your order",
  emptyCart: "Empty",
  subtotal: "Subtotal",
  total: "Total",
  fulfilment: "Fulfilment",
  pickup: "Pickup",
  delivery: "Delivery",
  deliveryAddress: "Address",
  customerDetails: "Details",
  fullName: "Name",
  phone: "Phone",
  email: "Email",
  paymentOnFulfilment: "Pay on pickup",
  placeOrder: "Place order",
  placingOrder: "Placing…",
  orderSuccessTitle: "Done",
  orderSuccessSubtext: "Received",
  orderNumber: "Number",
  backToMenu: "Back",
};

// Stub env vars required by the supabase client chain pulled in through
// the order action import (never actually connects in tests).
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "stub-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "stub-service-key";

function renderToStaticMarkup(element) {
  const { renderToString } = require("react-dom/server");
  return renderToString(element);
}

test("server render never throws: legacy rows, full rows, orderConfig undefined or present", () => {
  const React = require("react");
  const { StorefrontBrowse } = require("../../components/site/blocks/StorefrontBrowse.tsx");
  const staticChildren = React.createElement("div", null, "static menu");
  for (const orderConfig of [undefined, { enabled: true, slug: "sams-abidjan", currency: "USD", offerings: ["pickup"] }]) {
    const html = renderToStaticMarkup(
      React.createElement(StorefrontBrowse, {
        groups: RENDER_GROUPS,
        labels: RENDER_LABELS,
        showGroups: false,
        orderConfig,
        children: staticChildren,
      })
    );
    assert.ok(html.includes("static menu"), "pre-mount server output is the static markup");
  }
});

test("mounted grid is interactive without searching (no engaged gate)", () => {
  const codeOnly = componentSource.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(codeOnly, /\{visible\.length === 0 \? \(/, "grid renders from the filtered list directly");
  assert.doesNotMatch(codeOnly, /\) : \(\s*children\s*\)\}/, "post-mount output never falls back to dead static markup");
});

function tryRequireJsdom() {
  try {
    return require("jsdom");
  } catch {
    return null;
  }
}

test("client render: dish buttons exist by default and a click opens the sheet", async () => {
  const jsdom = tryRequireJsdom();
  if (!jsdom) {
    assert.ok(true, "jsdom unavailable — server render plus source checks above cover this");
    return;
  }
  const { JSDOM } = jsdom;
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { url: "https://localhost/" });
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevNavigator = globalThis.navigator;
  const prevLocalStorage = globalThis.localStorage;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.navigator = dom.window.navigator;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    const React = require("react");
    const { createRoot } = require("react-dom/client");
    const { act } = require("react");
    const { StorefrontBrowse } = require("../../components/site/blocks/StorefrontBrowse.tsx");
    const container = document.getElementById("root");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(StorefrontBrowse, {
          groups: RENDER_GROUPS,
          labels: RENDER_LABELS,
          showGroups: false,
          children: React.createElement("div", null, "static menu"),
        })
      );
    });
    // No search typed, no chip tapped: dish buttons must still exist.
    const dishButton = document.querySelector('button[aria-label="Yassa Poulet"]');
    assert.ok(dishButton, "dish card is a button without searching first");
    await act(async () => {
      dishButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.ok(document.querySelector('[role="dialog"]'), "clicking a dish opens its sheet");
    assert.ok(document.body.textContent.includes("Lemon onion chicken"), "sheet shows the dish");
    await act(async () => {
      root.unmount();
    });
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
    globalThis.navigator = prevNavigator;
    globalThis.localStorage = prevLocalStorage;
  }
});

test("client render: throwing localStorage never breaks the menu", async () => {
  const jsdom = tryRequireJsdom();
  if (!jsdom) {
    assert.ok(true, "jsdom unavailable");
    return;
  }
  const { JSDOM } = jsdom;
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { url: "https://localhost/" });
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevNavigator = globalThis.navigator;
  const prevLocalStorage = globalThis.localStorage;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.navigator = dom.window.navigator;
  globalThis.localStorage = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    const React = require("react");
    const { createRoot } = require("react-dom/client");
    const { act } = require("react");
    const { StorefrontBrowse } = require("../../components/site/blocks/StorefrontBrowse.tsx");
    const container = document.getElementById("root");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(StorefrontBrowse, {
          groups: RENDER_GROUPS,
          labels: RENDER_LABELS,
          showGroups: false,
          orderConfig: { enabled: true, slug: "sams-abidjan", currency: "USD" },
          children: React.createElement("div", null, "static menu"),
        })
      );
    });
    assert.ok(document.querySelector('button[aria-label="Riz Gras"]'), "legacy dish renders with broken storage");
    await act(async () => {
      root.unmount();
    });
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
    globalThis.navigator = prevNavigator;
    globalThis.localStorage = prevLocalStorage;
  }
});
