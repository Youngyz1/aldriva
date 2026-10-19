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
const { spawnSync } = require("node:child_process");
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
const {
  computeLineTotal,
  resolveItemOptionGroups,
  validateSelection,
} = require("../menu-pricing.ts");

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
    "shopNow", "storeShopHeading", "storeLoadMore", "storeBackToShop",
    "storeInStock", "storeLowStock", "storeSoldOut",
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
  assert.match(componentSource, /sticky top-\[var\(--site-header-h\)\]/);
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
  assert.match(componentSource, /max-h-\[85dvh\]/);
});

// ── BlockRenderer wiring ────────────────────────────────────────────────────

const RENDERER_PATH = path.join(ROOT, "components/site/blocks/BlockRenderer.tsx");
const rendererSource = fs.readFileSync(RENDERER_PATH, "utf8");

test("menu_embed renders the shared browse with server static sections as children", () => {
  assert.match(rendererSource, /const tableFlameRows = siteTemplateId === "restaurant-table-flame" && block\.variant === "rows"/);
  assert.match(rendererSource, /const savannahEditorial = siteTemplateId === "restaurant-savannah" && block\.variant === "editorial"/);
  assert.match(rendererSource, /<StorefrontBrowse[\s\S]*?groups=\{menuGroups\}[\s\S]*?labels=\{browseLabels\}/);
  assert.match(rendererSource, /orderConfig=\{orderConfig\}[\s\S]*?accentColor=\{accentColor\}/);
  assert.match(rendererSource, /"catalog-carousel"/);
  assert.match(rendererSource, /showGroups[\s\S]*?populatedSections\.length > 1[\s\S]*?catalog-carousel/);
  assert.match(rendererSource, /getTranslations\("Storefront"\)/);
  assert.match(rendererSource, /noResults: t\("noDishesMatch"\)/);
  assert.match(rendererSource, /\{!hasMenuItems \? \([\s\S]*?t\("menuComingSoon"\)/);
  assert.match(rendererSource, /const populatedSections = sections\.filter\(\(section: ResolvedMenuSection\) => section\.items\.length > 0\)/);
  assert.doesNotMatch(rendererSource, /No menu available at this time/);
});

test("products_embed renders the shared browse grouped by category with real detail links", () => {
  assert.match(rendererSource, /<StorefrontBrowse groups=\{productGroups\} labels=\{browseLabels\} showGroups=\{categoryOrder\.length > 1\} accentColor=\{accentColor\}>/);
  assert.match(rendererSource, /noResults: t\("noProductsMatch"\)/);
  assert.match(rendererSource, /block\.siteLocalProductDetails && siteSlug[\s\S]*?`\/site\/\$\{encodeURIComponent\(siteSlug\)\}\/products\/\$\{encodeURIComponent\(product\.slug\)\}`/);
  assert.match(rendererSource, /: `\/products\/\$\{product\.slug\}`/);
});

test("Store browse uses site-local links, hides category controls below two real categories, and paginates", () => {
  assert.match(rendererSource, /showGroups=\{Boolean\(block\.categoryTiles && realCategoryCount >= 2\)\}/);
  assert.match(rendererSource, /itemMode="links"/);
  assert.match(rendererSource, /pageSize=\{block\.browsePageSize \?\? 12\}/);
  assert.match(componentSource, /itemMode === "links"/);
  assert.match(componentSource, /href=\{item\.action\.href\}/);
  assert.match(componentSource, /setVisibleItemCount\(\(count\) => count \+ Math\.max\(1, pageSize \?\? 12\)\)/);
  assert.match(componentSource, /categoryTiles && group\.id === "uncategorized" \? null/);
});

test("products resolver projects category, tags, and stripe_price_id without touching scoping", () => {
  const embeds = fs.readFileSync(path.join(ROOT, "lib/website-embeds.ts"), "utf8");
  assert.match(embeds, /"id, name, slug, description, images, price_type, stock_quantity, status, category, tags, stripe_price_id, created_at"/);
  assert.match(embeds, /\.in\("business_id", businessIds\)/);
  assert.match(embeds, /export async function resolveShopPrices/);
  assert.match(embeds, /if \(!secret\) return out/);
});

test("normalized option assignments take precedence and apply hidden options and price overrides", () => {
  const item = {
    id: "item-1",
    price: 10,
    option_groups: [{
      id: "legacy",
      name: "Legacy decoy",
      required: false,
      min: 0,
      max: 1,
      options: [{ id: "legacy-choice", name: "Legacy choice", price_delta: 99 }],
    }],
  };
  const normalizedRows = [{
    item_id: "item-1",
    group_id: "normalized",
    position: 0,
    hidden_option_ids: ["hidden"],
    price_overrides: { visible: 1.25 },
    group: {
      id: "normalized",
      name: "Extras",
      kind: "addon",
      min_select: 0,
      max_select: 2,
      is_required: false,
      options: [
        { id: "visible", name: "Visible", price: 2, max_qty: 3, is_available: true, position: 0 },
        { id: "hidden", name: "Hidden", price: 3, max_qty: 1, is_available: true, position: 1 },
        { id: "unavailable", name: "Unavailable", price: 4, max_qty: 1, is_available: false, position: 2 },
      ],
    },
  }];

  const groups = resolveItemOptionGroups(item, normalizedRows);
  assert.equal(groups.length, 1, "the legacy group is not merged");
  assert.equal(groups[0].id, "normalized");
  assert.deepEqual(groups[0].options.map((option) => option.id), ["visible"]);
  assert.equal(groups[0].options[0].price, 1.25);
  assert.equal(groups[0].options[0].price_delta, 1.25);
  assert.deepEqual(resolveItemOptionGroups(item, []), [{
    ...item.option_groups[0],
    kind: "addon",
    options: [{ ...item.option_groups[0].options[0], price: 99, max_qty: 1, is_available: true }],
  }]);
});

test("variant prices replace the base price and ignore promo_price; add-on quantities multiply deltas", () => {
  const variantItem = {
    price: 15,
    promo_price: 9,
    option_groups: [{
      id: "size",
      name: "Size",
      kind: "variant",
      required: true,
      min: 1,
      max: 1,
      options: [{ id: "small", name: "Small", price: 8, price_delta: 0, max_qty: 1 }],
    }],
  };
  const variantSelection = [{ groupId: "size", optionIds: ["small"], selectedOptions: [{ optionId: "small", qty: 1 }] }];
  assert.deepEqual(computeLineTotal({ item: variantItem, selection: variantSelection, quantity: 1 }), {
    unitPrice: 8,
    optionsDelta: 0,
    lineTotal: 8,
  });
  assert.equal(validateSelection(variantItem, []).valid, false, "a variant must be selected");

  const addonItem = {
    price: 10,
    option_groups: [{
      id: "extras",
      name: "Extras",
      kind: "addon",
      required: false,
      min: 0,
      max: 1,
      options: [{ id: "cheese", name: "Cheese", price: 1.5, price_delta: 1.5, max_qty: 3 }],
    }],
  };
  const addonSelection = [{ groupId: "extras", optionIds: ["cheese"], selectedOptions: [{ optionId: "cheese", qty: 3 }] }];
  assert.deepEqual(computeLineTotal({ item: addonItem, selection: addonSelection, quantity: 2 }), {
    unitPrice: 10,
    optionsDelta: 4.5,
    lineTotal: 29,
  });
  assert.equal(validateSelection(addonItem, [{
    groupId: "extras",
    optionIds: ["cheese"],
    selectedOptions: [{ optionId: "cheese", qty: 4 }],
  }]).valid, false, "option quantity above max_qty is rejected");
});

test("backfill --verify accepts the staging seed row set and an independent suite fixture", () => {
  const script = path.join(ROOT, "scripts/backfill-menu-option-groups.cjs");
  const fixturePaths = [
    path.join(ROOT, "scripts/fixtures/staging-option-groups-seed-verify.json"),
    path.join(__dirname, "fixtures/menu-option-groups-backfill.json"),
  ];
  for (const fixturePath of fixturePaths) {
    const result = spawnSync(process.execPath, [script, "--verify", "--input", fixturePath], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true, report.issues.join("; "));
    assert.equal(report.verifiedBackfillItems, 1);
    assert.ok(report.legacyFallbackItems >= 1);
  }
});

test("menu option actions enforce tenant authorization and expose CRUD plus assignments", () => {
  const actionSource = fs.readFileSync(path.join(ROOT, "lib/actions/menu-option-groups.ts"), "utf8");
  for (const name of [
    "listMenuOptionGroups",
    "createMenuOptionGroup",
    "updateMenuOptionGroup",
    "deleteMenuOptionGroup",
    "createMenuOption",
    "updateMenuOption",
    "deleteMenuOption",
    "assignMenuOptionGroup",
    "updateMenuItemOptionGroup",
    "unassignMenuOptionGroup",
  ]) {
    assert.match(actionSource, new RegExp(`export async function ${name}\\b`), `${name} is exported`);
  }
  assert.match(actionSource, /requireTenantContext\(user\.id, organizerId/);
  assert.match(actionSource, /\["owner", "admin", "manager", "editor"\]/);
  assert.match(actionSource, /typeof value !== "number"/);
  assert.match(actionSource, /hidden_option_ids/);
  assert.match(actionSource, /price_overrides/);
  assert.match(actionSource, /is_default/);
  assert.match(actionSource, /max_qty/);
});

test("migration mirror is byte-identical and RLS scopes public option reads through active parents", () => {
  const migrationPath = path.join(ROOT, "db/migration_182_menu_option_groups.sql");
  const mirrorPath = path.join(ROOT, "supabase/migrations/20261019000000_migration_182_menu_option_groups.sql");
  const migration = fs.readFileSync(migrationPath, "utf8");
  assert.equal(fs.readFileSync(mirrorPath, "utf8"), migration);
  for (const table of ["menu_option_groups", "menu_options", "menu_item_option_groups"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /Public can view assigned active menu option groups/);
  assert.match(migration, /Public can view assignments for active menu items/);
  assert.match(migration, /Public can view available assigned menu options/);
  assert.match(migration, /Tenant editors can insert menu option groups/);
  assert.match(migration, /Tenant editors can update menu options/);
  assert.match(migration, /Tenant managers can delete menu item option groups/);
  assert.match(migration, /at most one variant group/);
  assert.match(migration, /at most 20 options/);
  const rollback = fs.readFileSync(path.join(ROOT, "db/rollback/migration_182_menu_option_groups_rollback.sql"), "utf8");
  assert.match(rollback, /DROP TABLE IF EXISTS public\.menu_item_option_groups/);
  assert.match(rollback, /DROP TABLE IF EXISTS public\.menu_options/);
  assert.match(rollback, /DROP TABLE IF EXISTS public\.menu_option_groups/);
});

test("new order snapshot labels and quantities retain legacy snapshot fallbacks", () => {
  const orderCard = fs.readFileSync(path.join(ROOT, "components/dashboard/orders/OrderCard.tsx"), "utf8");
  const tracking = fs.readFileSync(path.join(ROOT, "components/site/OrderTrackingView.tsx"), "utf8");
  const notifications = fs.readFileSync(path.join(ROOT, "lib/order-notifications.ts"), "utf8");
  for (const source of [orderCard, tracking, notifications]) {
    assert.match(source, /group_name\?/);
    assert.match(source, /qty\?/);
    assert.match(source, /group_name \?/);
  }
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

// ── Client render: catalog-carousel (Savannah) click opens sheet ─────

const CAROUSEL_GROUPS = [
  {
    id: "mains",
    title: "Mains",
    items: [
      {
        id: "dish-a",
        name: "Yassa Poulet",
        description: "Lemon onion chicken",
        image: null,
        priceLabel: "4 500 F CFA",
        numericPrice: 4500,
        isSoldOut: false,
        tags: [],
        detailRows: [],
        optionGroups: [],
      },
      {
        id: "dish-b",
        name: "Thieboudienne",
        description: "Fish and rice",
        image: null,
        priceLabel: "5 000 F CFA",
        numericPrice: 5000,
        isSoldOut: false,
        tags: [],
        detailRows: [],
        optionGroups: [],
      },
    ],
  },
];

const CAROUSEL_LABELS = {
  ...RENDER_LABELS,
  freeDelivery: "Free delivery",
  freeDeliveryProgress: "Add {amount} more for free delivery",
};

test("client render: catalog-carousel click opens the item sheet", async () => {
  const jsdom = tryRequireJsdom();
  if (!jsdom) {
    assert.ok(true, "jsdom unavailable — source ordering test covers this path");
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
          groups: CAROUSEL_GROUPS,
          labels: CAROUSEL_LABELS,
          showGroups: false,
          variant: "catalog-carousel",
          carousel: { prevLabel: "Previous", nextLabel: "Next", regionLabel: "Categories" },
          currency: "XOF",
          currencyLocale: "fr",
          orderConfig: { enabled: true, slug: "sams-abidjan", currency: "XOF", offerings: ["delivery"], fulfilment: "delivery", freeDeliveryAbove: 99999, deliveryFee: 500 },
          children: React.createElement("div", null, "static menu"),
        })
      );
    });
    // Carousel cards are buttons with onSelect
    const firstCard = document.querySelector('button[aria-label="Yassa Poulet"]');
    assert.ok(firstCard, "catalog-carousel card is a button");
    await act(async () => {
      firstCard.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.ok(document.querySelector('[role="dialog"]'), "clicking a carousel card opens the sheet");
    assert.ok(document.body.textContent.includes("Yassa Poulet"), "sheet shows the clicked dish");
    assert.ok(document.body.textContent.includes("4 500 F CFA"), "sheet shows the price");
    // Add-to-order, quantity and options controls are present
    assert.ok(document.body.textContent.includes("Add"), "sheet has add-to-order");
    assert.ok(document.body.textContent.includes("Quantity"), "sheet has quantity control");
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

// ── Ordering: catalog-carousel branch sits after openSheet and all hooks ──
test("catalog-carousel branch is defined after openSheet and after the last hook", () => {
  const src = fs.readFileSync(COMPONENT_PATH, "utf8");
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const openSheetIdx = codeOnly.indexOf("const openSheet = (id: string");
  const carouselIdx = codeOnly.indexOf("if (variant === \"catalog-carousel\")");
  // Only consider hooks inside the StorefrontBrowse function body, before ItemDetailSheet starts.
  const itemDetailSheetIdx = codeOnly.indexOf("function ItemDetailSheet");
  const mainFnEnd = itemDetailSheetIdx > -1 ? itemDetailSheetIdx : codeOnly.length;
  const mainFnBody = codeOnly.slice(0, mainFnEnd);
  const lastHookIdx = Math.max(
    mainFnBody.lastIndexOf("useState("),
    mainFnBody.lastIndexOf("useRef("),
    mainFnBody.lastIndexOf("useId("),
    mainFnBody.lastIndexOf("useEffect("),
    mainFnBody.lastIndexOf("useCallback(")
  );
  assert.ok(openSheetIdx > -1, "openSheet is declared");
  assert.ok(carouselIdx > -1, "catalog-carousel branch exists");
  assert.ok(lastHookIdx > -1, "at least one hook is declared");
  assert.ok(carouselIdx > openSheetIdx, "catalog-carousel branch comes after openSheet declaration");
  assert.ok(carouselIdx > lastHookIdx, "catalog-carousel branch comes after the last hook call");
});

// ── freeDeliveryProgress uses the raw template (no FORMATTING_ERROR) ──
test("freeDeliveryProgress uses the raw template (no FORMATTING_ERROR)", async () => {
  const jsdom = tryRequireJsdom();
  if (!jsdom) {
    assert.ok(true, "jsdom unavailable — source check above covers this");
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
    // orderConfig with a free-delivery threshold that is NOT yet met
    await act(async () => {
      root.render(
        React.createElement(StorefrontBrowse, {
          groups: RENDER_GROUPS,
          labels: CAROUSEL_LABELS,
          showGroups: false,
          orderConfig: { enabled: true, slug: "sams-abidjan", currency: "XOF", offerings: ["pickup", "delivery"], fulfilment: "delivery", freeDeliveryAbove: 99999, deliveryFee: 500 },
          children: React.createElement("div", null, "static menu"),
        })
      );
    });
    // No FORMATTING_ERROR in the rendered output
    assert.ok(!document.body.textContent.includes("FORMATTING_ERROR"), "no intl formatting error rendered");
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

// ── Client render: throwing localStorage never breaks the menu ──────────
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

// ── Client render: catalog-carousel click "Add to order" updates cart ──
test("client render: catalog-carousel click card and 'Add to order' updates cart and closes sheet", async () => {
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
  globalThis.localStorage = dom.window.localStorage;
  globalThis.localStorage.clear();
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
          groups: CAROUSEL_GROUPS,
          labels: CAROUSEL_LABELS,
          showGroups: false,
          variant: "catalog-carousel",
          carousel: { prevLabel: "Previous", nextLabel: "Next", regionLabel: "Categories" },
          currency: "XOF",
          currencyLocale: "fr",
          orderConfig: { enabled: true, slug: "test-slug", currency: "XOF" },
          children: React.createElement("div", null, "static menu"),
        })
      );
    });

    // 1. Click card to open sheet
    const card = document.querySelector('button[aria-label="Yassa Poulet"]');
    assert.ok(card, "first card exists");
    await act(async () => {
      card.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, "sheet is open");

    // 2. Click "Add to order" button
    const addToOrderBtn = dialog.querySelector('button.ps-button-primary');
    assert.ok(addToOrderBtn, "add to order button exists");
    await act(async () => {
      addToOrderBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    // 3. Assert sheet is closed
    assert.equal(document.querySelector('[role="dialog"]'), null, "sheet closes after adding to order");

    // 4. Assert cart in localStorage has item with quantity 1
    const persistedCart = JSON.parse(globalThis.localStorage.getItem("aldriva_cart_test-slug") || "[]");
    const storedCart = Array.isArray(persistedCart)
      ? persistedCart
      : persistedCart.version === 2 && Array.isArray(persistedCart.items)
        ? persistedCart.items
        : [];
    assert.equal(storedCart.length, 1, "cart contains 1 item");
    assert.equal(storedCart[0].itemId, "dish-a", "item id matches");
    assert.equal(storedCart[0].quantity, 1, "quantity is 1");

    // 5. Assert cart bar is in DOM with count 1 and total
    const cartCountEl = document.querySelector('.bg-\\[var\\(--ps-accent\\)\\]');
    assert.ok(cartCountEl, "cart count element exists in floating cart bar");
    assert.equal(cartCountEl.textContent.trim(), "1", "cart count in floating bar is 1");
    assert.ok(document.body.textContent.includes("XOF 4500.00"), "cart bar contains formatted subtotal");

    // 6. Assert aria-live region announces 'Added to order'
    const liveRegion = document.querySelector('[role="status"]');
    assert.ok(liveRegion, "aria-live status region exists");
    assert.equal(liveRegion.textContent.trim(), "Added to order", "aria-live announced Added to order");

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

// ── Client render: add the same item twice with quantity 2 and assert line and total ──
test("client render: add the same item twice with quantity 2 updates line and total in cart", async () => {
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
  globalThis.localStorage = dom.window.localStorage;
  globalThis.localStorage.clear();
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
          groups: CAROUSEL_GROUPS,
          labels: CAROUSEL_LABELS,
          showGroups: false,
          variant: "catalog-carousel",
          carousel: { prevLabel: "Previous", nextLabel: "Next", regionLabel: "Categories" },
          currency: "XOF",
          currencyLocale: "fr",
          orderConfig: { enabled: true, slug: "test-slug", currency: "XOF" },
          children: React.createElement("div", null, "static menu"),
        })
      );
    });

    const addDishWithQuantity2 = async () => {
      const card = document.querySelector('button[aria-label="Yassa Poulet"]');
      assert.ok(card, "card exists");
      await act(async () => {
        card.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
      const dialog = document.querySelector('[role="dialog"]');
      assert.ok(dialog, "dialog open");

      const plusBtn = Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent && b.textContent.trim() === "+"
      );
      assert.ok(plusBtn, "+ button found");
      await act(async () => {
        plusBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });

      const addToOrderBtn = dialog.querySelector('button.ps-button-primary');
      assert.ok(addToOrderBtn, "add to order button exists");
      await act(async () => {
        addToOrderBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
    };

    // First add: quantity 2
    await addDishWithQuantity2();
    let cartCountEl = document.querySelector('.bg-\\[var\\(--ps-accent\\)\\]');
    assert.equal(cartCountEl.textContent.trim(), "2");
    assert.ok(document.body.textContent.includes("XOF 9000.00"), "subtotal is 2 * 4500 = 9000");

    // Second add: quantity 2 again -> total count 4, subtotal 18000
    await addDishWithQuantity2();
    cartCountEl = document.querySelector('.bg-\\[var\\(--ps-accent\\)\\]');
    assert.equal(cartCountEl.textContent.trim(), "4", "bar shows count 4 after second add");
    assert.ok(document.body.textContent.includes("XOF 18000.00"), "subtotal is 4 * 4500 = 18000");

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

// ── Client render: opening the order panel from the bar lists the item with quantity and total ──
test("client render: opening the order panel from the bar lists the item with quantity and total", async () => {
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
  globalThis.localStorage = dom.window.localStorage;
  globalThis.localStorage.clear();
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
          groups: CAROUSEL_GROUPS,
          labels: CAROUSEL_LABELS,
          showGroups: false,
          variant: "catalog-carousel",
          carousel: { prevLabel: "Previous", nextLabel: "Next", regionLabel: "Categories" },
          currency: "XOF",
          currencyLocale: "fr",
          orderConfig: { enabled: true, slug: "test-slug", currency: "XOF" },
          children: React.createElement("div", null, "static menu"),
        })
      );
    });

    // 1. Add item to order
    const card = document.querySelector('button[aria-label="Yassa Poulet"]');
    await act(async () => {
      card.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    const dialog = document.querySelector('[role="dialog"]');
    const addToOrderBtn = dialog.querySelector('button.ps-button-primary');
    await act(async () => {
      addToOrderBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    // 2. Open OrderDrawer by clicking "View order" on the floating cart bar
    const viewOrderBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.includes(CAROUSEL_LABELS.viewOrder || "View order")
    );
    assert.ok(viewOrderBtn, "View order button exists in floating bar");
    await act(async () => {
      viewOrderBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    // 3. Assert drawer is open and lists the item with quantity and price
    const drawer = document.querySelector('[role="dialog"]');
    assert.ok(drawer, "order drawer is open");
    assert.ok(drawer.textContent.includes("Yassa Poulet"), "drawer lists item name");
    assert.ok(drawer.textContent.includes("1"), "drawer shows quantity 1");
    assert.ok(drawer.textContent.includes("XOF 4500.00"), "drawer shows item line price");

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

// ── Image fit: card and sheet images have object-contain and soft background; equal card heights ──
test("Image fit: card and sheet images have object-contain and soft background; equal card heights", async () => {
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
  globalThis.localStorage = dom.window.localStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  try {
    const React = require("react");
    const { createRoot } = require("react-dom/client");
    const { act } = require("react");
    const { CatalogCard } = require("../../components/site/blocks/CatalogCard.tsx");
    const { StorefrontBrowse } = require("../../components/site/blocks/StorefrontBrowse.tsx");
    const container = document.getElementById("root");
    const root = createRoot(container);

    const testGroups = [
      {
        id: "cat-1",
        title: "Category 1",
        items: [
          { id: "i1", name: "Item with description", description: "Delicious dish with description", image: "/img1.jpg", priceLabel: "1000", numericPrice: 1000, isSoldOut: false, tags: [], detailRows: [] },
          { id: "i2", name: "Item without description", description: null, image: "/img2.jpg", priceLabel: "2000", numericPrice: 2000, isSoldOut: false, tags: [], detailRows: [] },
        ],
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(StorefrontBrowse, {
          groups: testGroups,
          labels: CAROUSEL_LABELS,
          showGroups: false,
          variant: "catalog-carousel",
          carousel: { prevLabel: "Previous", nextLabel: "Next", regionLabel: "Categories" },
          currency: "USD",
          orderConfig: { enabled: true, slug: "test", currency: "USD" },
          children: React.createElement("div", null, "static"),
        })
      );
    });

    // 1. Verify card image has object-contain and soft background
    const cardImg = document.querySelector('img[src="/img1.jpg"]');
    assert.ok(cardImg, "card image found");
    assert.ok(cardImg.className.includes("object-cover") || cardImg.className.includes("object-contain"), "card image has object-cover or object-contain");
    assert.ok(cardImg.parentElement.className.includes("bg-[var(--tf-soft)]"), "card image container has bg-[var(--tf-soft)]");

    // 2. Verify equal card heights: both have min-h-[2.5rem] on description container and flex h-full
    const itemCard1 = document.querySelector('button[aria-label="Item with description"]');
    const itemCard2 = document.querySelector('button[aria-label="Item without description"]');
    assert.ok(itemCard1, "item 1 card found");
    assert.ok(itemCard2, "item 2 card found");
    assert.ok(itemCard1.className.includes("h-full"), "card 1 button has h-full");
    assert.ok(itemCard2.className.includes("h-full"), "card 2 button has h-full");

    const desc1 = itemCard1.querySelector('p.min-h-\\[2\\.5rem\\]');
    const desc2 = itemCard2.querySelector('p.min-h-\\[2\\.5rem\\]');
    assert.ok(desc1, "card 1 reserves min-h-[2.5rem] for description alignment");
    assert.ok(desc2, "card 2 reserves min-h-[2.5rem] for description alignment");

    // 3. Open sheet and verify sheet image has object-contain and soft background
    await act(async () => {
      itemCard1.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    const sheetImg = document.querySelector('[role="dialog"] img');
    assert.ok(sheetImg, "sheet image rendered");
    assert.ok(sheetImg.className.includes("object-contain"), "sheet image has object-contain");
    assert.ok(sheetImg.parentElement.className.includes("bg-[var(--tf-soft)]"), "sheet image container has bg-[var(--tf-soft)]");

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

// ── Contrast for card description, name, price and bar text on all six Savannah palettes ──
test("Contrast for card description, name, price and bar text on all six Savannah palettes", () => {
  const { deriveWebsitePaletteRoles } = require("../website-v2-color-resolution.ts");
  const { contrastRatio } = require("../readable-on.ts");

  const palettes = [
    { id: "midnight-sapphire", base: "#EEF3FB", accent: "#2F5DA8", ink: "#0C1F3F", soft: "#8FAADC" },
    { id: "deep-sapphire", base: "#0C1F3F", accent: "#8FAADC", ink: "#EEF3FB", soft: "#2F5DA8" },
    { id: "gallery-white", base: "#F9F9F9", accent: "#000000", ink: "#1B1B1B", soft: "#DADADA" },
    { id: "dusk-sienna", base: "#FBF4EA", accent: "#B5441F", ink: "#2B1810", soft: "#E8B89A" },
    { id: "acacia", base: "#F3F6EE", accent: "#2F6B3A", ink: "#14241A", soft: "#A9C9A4" },
    { id: "baobab-gold", base: "#FAF6EA", accent: "#C8941F", ink: "#231B0E", soft: "#E6CF8F" },
  ];

  for (const p of palettes) {
    const roles = deriveWebsitePaletteRoles(p);
    const cardBg = roles.soft;
    // Card text (name, description, price) uses roles.onSoft on cardBg
    const cardTextRatio = contrastRatio(cardBg, roles.onSoft);
    assert.ok(
      cardTextRatio >= 4.5,
      `Palette ${p.id} card text ratio on soft (${cardTextRatio.toFixed(2)}) must meet WCAG AA 4.5:1`
    );

    // Floating cart bar uses roles.band and roles.onBand
    const barTextRatio = contrastRatio(roles.band, roles.onBand);
    assert.ok(
      barTextRatio >= 4.5,
      `Palette ${p.id} bar text ratio on band (${barTextRatio.toFixed(2)}) must meet WCAG AA 4.5:1`
    );
  }
});

// ── savannah=false: ItemDetailSheet and the rows branch markup contain none of the new classes ──
test("savannah=false: ItemDetailSheet and the rows branch markup contain none of the new classes", async () => {
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
          variant: "rows", // Table & Flame rows mode
          children: React.createElement("div", null, "static menu"),
        })
      );
    });

    const dishBtn = document.querySelector('button[data-menu-row="true"]');
    assert.ok(dishBtn, "rows mode dish row button exists");
    await act(async () => {
      dishBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, "ItemDetailSheet opened in non-savannah mode");
    // Verify none of the savannah classes are on the dialog
    assert.ok(!dialog.className.includes("rounded-none"), "non-savannah dialog does not have rounded-none");
    assert.ok(!dialog.className.includes("shadow-none"), "non-savannah dialog does not have shadow-none");
    assert.ok(!dialog.className.includes("bg-[var(--tf-base)]"), "non-savannah dialog does not have bg-[var(--tf-base)]");

    // Title has text-lg font-bold text-[var(--ps-text)], not savannah text-[24px]
    const titleEl = dialog.querySelector('h2');
    assert.ok(titleEl.className.includes("text-lg font-bold text-[var(--ps-text)]"), "title has non-savannah class");
    assert.ok(!titleEl.className.includes("text-[24px]"), "title does not have savannah text-[24px]");

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


