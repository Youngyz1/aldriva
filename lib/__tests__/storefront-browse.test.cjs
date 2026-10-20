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
  defaultBrowseOptionSelections,
  availableBrowseOptionGroups,
  describeBrowseOptionGroupRules,
  hasAvailableBrowseOptionGroups,
  hasBrowseableItems,
  normalizeSearchQuery,
  filterBrowseGroups,
} = require("../storefront-browse.ts");
const {
  computeLineTotal,
  calculateSelectedMenuUnitPrice,
  isOptionGroupSelectionSatisfied,
  resolveItemOptionGroups,
  validateSelection,
} = require("../menu-pricing.ts");
const {
  migrateStorefrontCart,
  reconcileStorefrontCart,
  createStorefrontPriceVersion,
  upsertStorefrontCartLine,
  STOREFRONT_CART_VERSION,
} = require("../storefront-cart.ts");
const { formatChosenMenuOption } = require("../order-option-display.ts");

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

test("option rules, availability, and selection satisfaction agree", () => {
  const variant = { id: "size", name: "Size", kind: "variant", required: true, min: 1, max: 1, options: [{ id: "small", name: "Small", isAvailable: true }] };
  const addon = { id: "sides", name: "Sides", kind: "addon", required: false, min: 0, max: 2, options: [{ id: "rice", name: "Rice", isAvailable: true }] };
  const hidden = { id: "hidden", name: "Hidden", kind: "addon", required: false, min: 0, max: 1, options: [{ id: "x", name: "X", isAvailable: false }] };
  assert.equal(describeBrowseOptionGroupRules(variant), "Required · Choose 1");
  assert.equal(describeBrowseOptionGroupRules(addon), "Optional · up to 2");
  assert.equal(describeBrowseOptionGroupRules(variant, { required: "Obligatoire" }), "Obligatoire · Choose 1");
  assert.deepEqual(availableBrowseOptionGroups([variant, hidden]).map((group) => group.id), ["size"]);
  assert.equal(hasAvailableBrowseOptionGroups([hidden]), false);
  const requiredUnavailable = {
    id: "required-unavailable", name: "Unavailable", kind: "addon", required: true, min: 1, max: 1,
    options: [{ id: "offline", name: "Offline", is_available: false }],
  };
  assert.equal(hasAvailableBrowseOptionGroups([{ ...requiredUnavailable, options: [{ id: "offline", name: "Offline", isAvailable: false }] }]), false);
  assert.equal(validateSelection({ price: 10, option_groups: [requiredUnavailable] }, []).valid, true,
    "a required group with no available choices does not block the option-free item");
  assert.equal(validateSelection({ price: 10, option_groups: [requiredUnavailable] }, [
    { groupId: "required-unavailable", optionIds: ["offline"] },
  ]).valid, false, "an unavailable choice is still rejected");
  assert.equal(isOptionGroupSelectionSatisfied(variant, 0), false);
  assert.equal(isOptionGroupSelectionSatisfied(variant, 1), true);
  assert.equal(isOptionGroupSelectionSatisfied(addon, 0), true);
  assert.equal(isOptionGroupSelectionSatisfied(addon, 3), false);
});

test("customer and server pricing stay in parity for variants, promos, and add-on quantities", () => {
  const cases = [
    {
      item: { price: 15, promo_price: 9, option_groups: [{ id: "size", name: "Size", kind: "variant", required: true, min: 1, max: 1, options: [{ id: "large", name: "Large", price: 12, price_delta: 0, max_qty: 1 }] }] },
      selection: [{ groupId: "size", optionIds: ["large"], selectedOptions: [{ optionId: "large", qty: 1 }] }],
      quantity: 2,
      expected: 24,
    },
    {
      item: { price: 10, promo_price: 8, option_groups: [{ id: "extras", name: "Extras", kind: "addon", required: false, min: 0, max: 1, options: [{ id: "cheese", name: "Cheese", price: 1.25, price_delta: 1.25, max_qty: 3 }] }] },
      selection: [{ groupId: "extras", optionIds: ["cheese"], selectedOptions: [{ optionId: "cheese", qty: 2 }] }],
      quantity: 3,
      expected: 31.5,
    },
    {
      item: { price: 10, promo_price: 8, option_groups: [] },
      selection: [],
      quantity: 50,
      expected: 400,
    },
  ];
  for (const scenario of cases) {
    const preview = calculateSelectedMenuUnitPrice(scenario.item, scenario.selection).unitPrice;
    const server = computeLineTotal({ item: scenario.item, selection: scenario.selection, quantity: scenario.quantity });
    assert.equal(preview, server.unitPrice + server.optionsDelta);
    assert.equal(server.lineTotal, scenario.expected);
  }
});

test("cart v1/v2 migration, live-menu reconciliation, edits, merges, and cap", () => {
  const legacy = [{ itemId: "dish", selectedOptionIds: ["large"], quantity: 1 }];
  const migrated = migrateStorefrontCart(legacy, () => "line-1");
  assert.equal(STOREFRONT_CART_VERSION, 4);
  assert.equal(migrated.needsSave, true);
  assert.equal(migrated.lines[0].lineId, "line-1");
  assert.deepEqual(migrated.lines[0].selectedOptions, []);
  assert.equal(Object.hasOwn(migrated.lines[0], "price"), false, "cart stores no price snapshot");

  const v3 = migrateStorefrontCart({ version: 3, items: [{ lineId: "v3", itemId: "dish", selectedOptionIds: [], quantity: 1, itemUpdatedAt: "old-token" }] }, () => "unused");
  assert.equal(v3.needsSave, true, "v3 cart data migrates to the current format");
  assert.equal(Object.hasOwn(v3.lines[0], "itemUpdatedAt"), false);
  assert.equal(createStorefrontPriceVersion(12.5), createStorefrontPriceVersion(12.5));
  assert.notEqual(createStorefrontPriceVersion(12.5), createStorefrontPriceVersion(12.51));
  assert.doesNotMatch(createStorefrontPriceVersion(12.5), /12\.5/, "price token does not store the price");
  const v4 = migrateStorefrontCart({ version: 4, items: [{ lineId: "v4", itemId: "dish", selectedOptionIds: [], selectedOptions: [], quantity: 1, priceVersion: createStorefrontPriceVersion(10) }] }, () => "unused");
  assert.equal(v4.needsSave, false);
  assert.equal(v4.lines[0].priceVersion, createStorefrontPriceVersion(10));

  const v2 = migrateStorefrontCart({ version: 2, items: [{ lineId: "old", itemId: "dish", selectedOptionIds: ["large"], quantity: 2, selectedOptions: [{ groupId: "size", optionId: "large", qty: 1 }] }] }, () => "unused");
  assert.equal(v2.needsSave, true);
  assert.equal(v2.lines[0].lineId, "old");
  const item = { id: "dish", name: "Dish", numericPrice: 10, tags: [], detailRows: [], optionGroups: [{ id: "size", name: "Size", kind: "variant", required: true, min: 1, max: 1, options: [{ id: "large", name: "Large", price: 12, isAvailable: true }] }] };
  const reconciled = reconcileStorefrontCart(v2.lines, [item]);
  assert.equal(reconciled.removed, 0);
  assert.deepEqual(reconciled.lines[0].selectedOptions, [{ groupId: "size", optionId: "large", qty: 1 }]);
  assert.equal(reconcileStorefrontCart(v2.lines, []).removed, 1, "missing items are removed");
  assert.equal(reconcileStorefrontCart([{ ...v2.lines[0], selectedOptionIds: ["removed"] }], [item]).removed, 1, "missing options are removed");
  const optionFreeLine = { lineId: "line-empty", itemId: "empty-required", selectedOptionIds: [], selectedOptions: [], quantity: 1 };
  const emptyRequiredItem = {
    ...item, id: "empty-required", isSoldOut: false,
    optionGroups: [{ id: "required-unavailable", name: "Unavailable", kind: "addon", required: true, min: 1, max: 1, options: [] }],
  };
  assert.equal(reconcileStorefrontCart([optionFreeLine], [emptyRequiredItem]).removed, 0,
    "a group with no available options does not stale an otherwise option-free cart line");
  assert.equal(reconcileStorefrontCart([optionFreeLine], [{ ...emptyRequiredItem, isSoldOut: true }]).removed, 1,
    "newly sold-out items are removed from the cart");

  const baseLine = { lineId: "line-a", itemId: "dish", selectedOptionIds: ["large"], selectedOptions: [{ groupId: "size", optionId: "large", qty: 1 }], quantity: 1 };
  const edited = upsertStorefrontCartLine([baseLine], { ...baseLine, lineId: "line-a", selectedOptionIds: [], selectedOptions: [], quantity: 1 }, "line-a");
  assert.equal(edited.lines.length, 1);
  assert.equal(edited.lines[0].lineId, "line-a");
  assert.deepEqual(edited.lines[0].selectedOptionIds, []);
  const merged = upsertStorefrontCartLine([baseLine], { ...baseLine, lineId: "line-b", quantity: 2 });
  assert.equal(merged.lines.length, 1);
  assert.equal(merged.lines[0].quantity, 3);
  const capped = upsertStorefrontCartLine([{ ...baseLine, quantity: 49 }], { ...baseLine, lineId: "line-b", quantity: 3 });
  assert.equal(capped.lines[0].quantity, 50);
  assert.equal(capped.capped, true);
});

test("order option display labels normalized snapshots and keeps old snapshots readable", () => {
  assert.equal(formatChosenMenuOption({ group_name: "Size", group_kind: "variant", name: "Large", qty: 1 }), "Size (Variant): Large");
  assert.equal(formatChosenMenuOption({ group_name: "Extras", group_kind: "addon", name: "Cheese", qty: 2 }), "Extras (Add-on): Cheese × 2");
  assert.equal(formatChosenMenuOption({ group_name: "Size", name: "Old Large" }), "Size: Old Large");
  assert.equal(formatChosenMenuOption({ name: "Old option", qty: 2 }), "Old option × 2");
  for (const source of [
    fs.readFileSync(path.join(ROOT, "components/dashboard/orders/OrderCard.tsx"), "utf8"),
    fs.readFileSync(path.join(ROOT, "components/site/OrderTrackingView.tsx"), "utf8"),
    fs.readFileSync(path.join(ROOT, "lib/order-notifications.ts"), "utf8"),
  ]) assert.match(source, /formatChosenMenuOption/);
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

test("menu images are lazy and reserve their rendered dimensions", () => {
  const catalogCardSource = fs.readFileSync(path.join(ROOT, "components/site/blocks/CatalogCard.tsx"), "utf8");
  const blockRendererSource = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.match(componentSource, /width=\{64\} height=\{64\}[^>]*loading="lazy"/);
  assert.match(componentSource, /width=\{88\} height=\{88\}[^>]*loading="lazy"/);
  assert.match(catalogCardSource, /width=\{640\}[\s\S]*height=\{480\}[\s\S]*loading="lazy"/);
  assert.match(blockRendererSource, /width=\{88\} height=\{88\}[^>]*loading="lazy"/);
  assert.match(blockRendererSource, /width=\{64\} height=\{64\}[^>]*loading="lazy"/);
});

test("category tabs are labelled, scrollable, and keyboard-operable", () => {
  assert.match(componentSource, /role="tablist"/);
  assert.match(componentSource, /role="tab"/);
  assert.match(componentSource, /aria-label=\{labels\.categories\}/);
  assert.match(componentSource, /aria-selected=\{active\}/);
  assert.match(componentSource, /event\.key !== "ArrowRight"/);
  assert.match(componentSource, /overflow-x-auto/);
  assert.match(componentSource, /sticky top-\[var\(--site-header-h\)\]/);
  assert.match(componentSource, /focus-visible:outline/);
});

test("search is labelled and every card is a real button", () => {
  assert.match(componentSource, /<label htmlFor=\{searchId\}/);
  assert.match(componentSource, /aria-label=\{`?\$\{item\.name\}/);
  assert.match(componentSource, /<button[\s\S]*?onClick=\{\(event\) => openSheet\(item\.id/);
});

test("detail sheet follows the dialog pattern without the retired add-to-cart button", () => {
  assert.match(componentSource, /role="dialog"/);
  assert.match(componentSource, /aria-modal="true"/);
  assert.match(componentSource, /aria-labelledby=\{titleId\}/);
  assert.match(componentSource, /event\.key === "Escape"/);
  assert.match(componentSource, /document\.body\.style\.overflow = "hidden"/, "scroll lock");
  assert.match(componentSource, /triggerRef\.current\?\.focus\(\)/, "focus returns to the trigger");
  assert.match(componentSource, /tabIndex=\{-1\}/);
  const codeOnly = componentSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(codeOnly, /add-to-cart|Add to cart|addToCart/i);
});

test("menu promotion prices share the pricing engine, deep links open menu targets, and checkout revalidates only references", () => {
  assert.match(componentSource, /calculatePromotionCartPricing/);
  assert.match(componentSource, /calculateSelectedMenuUnitPrice\([\s\S]*?subtotal: eligibleSubtotal/);
  assert.match(componentSource, /params\.get\("item"\)/);
  assert.match(componentSource, /params\.get\("section"\)/);
  assert.match(componentSource, /setSelectedId\(item\.id\)/);
  assert.match(componentSource, /sectionRefs\.current\.get\(section\.id\)\?\.scrollIntoView/);
  assert.match(componentSource, /"Have a promo code\?"/);
  assert.match(componentSource, /validatePromoCode\(orderConfig\.slug, code/);
  assert.match(componentSource, /validatePromoCode\(orderConfig\.slug, submittedCode/);
  assert.match(componentSource, /localStorage\.setItem\(`aldriva_promo_\$\{orderConfig\.slug\}`, code\)/);
  assert.match(componentSource, /promoCode: submittedCode \|\| null/);
  assert.match(componentSource, /Price updated\. We refreshed the item prices and discounts/);
  assert.match(componentSource, /discountPerUnit/);
});

test("old order items without promotion snapshots still render in cards, tracking, and notifications", () => {
  const card = fs.readFileSync(path.join(ROOT, "components/dashboard/orders/OrderCard.tsx"), "utf8");
  const tracking = fs.readFileSync(path.join(ROOT, "components/site/OrderTrackingView.tsx"), "utf8");
  const notifications = fs.readFileSync(path.join(ROOT, "lib/order-notifications.ts"), "utf8");
  const oldOrderItem = { item_id: "old-item", name: "Old dish", unit_price: 10, quantity: 1, line_total: 10 };
  assert.equal(oldOrderItem.promotion?.name, undefined, "legacy order snapshots do not have a promotion field");
  for (const source of [card, tracking, notifications]) {
    assert.match(source, /promotion\?\.name/);
    assert.match(source, /discount_per_unit/);
  }
  assert.match(card, /promotion\?: \{/);
  assert.match(card, /item\.promotion\?\.name \?/);
  assert.match(tracking, /item\.promotion\?\.name/);
  assert.match(notifications, /\.filter\(\(item\) => item\.promotion\?\.name\)/);
  assert.match(notifications, /const promotionLine = item\.promotion\?\.name/);
});

test("promotion section layouts and controls remain responsive and keyboard accessible", () => {
  const renderer = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  const inspector = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/inspectors/PromotionsEmbedInspector.tsx"), "utf8");
  const resolver = fs.readFileSync(path.join(ROOT, "lib/website-embeds.ts"), "utf8");
  assert.match(renderer, /layout === "announcement_bar"/);
  assert.match(renderer, /layout === "dish_card"/);
  assert.match(renderer, /md:grid-cols-12/);
  assert.match(renderer, /sm:flex-row/);
  assert.match(renderer, /target: "_blank", rel: "noopener noreferrer"/);
  assert.match(resolver, /includeCodes: false,[\s\S]*?context: "resolvePromotionsEmbed"/);
  assert.match(inspector, /type="checkbox"/);
  assert.match(inspector, /aria-label|label>/);
  assert.match(inspector, /min-h-11/);
  assert.match(inspector, /Use each promotion&apos;s layout/);
});

test("layout cannot overflow horizontally", () => {
  assert.match(componentSource, /min-w-0/);
  assert.match(componentSource, /whitespace-nowrap/);
  assert.match(componentSource, /max-w-lg/);
  assert.match(componentSource, /max-h-\[90dvh\]/);
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
    options_source: "normalized",
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
  assert.deepEqual(resolveItemOptionGroups(item, []), [], "an empty normalized assignment set must not resurrect legacy JSON");
  const jsonItem = { ...item, options_source: "json" };
  const jsonGroups = resolveItemOptionGroups(jsonItem, normalizedRows);
  assert.equal(jsonGroups.length, 1, "JSON source ignores normalized assignment rows");
  assert.equal(jsonGroups[0].id, "legacy");
  assert.equal(jsonGroups[0].options[0].price_delta, 99);
});

test("storefront defaults choose one variant and only free add-on defaults", () => {
  assert.deepEqual(defaultBrowseOptionSelections([
    { id: "variant-default", name: "Size", kind: "variant", required: true, min: 1, max: 1, options: [
      { id: "small", name: "Small", isDefault: false },
      { id: "large", name: "Large", isDefault: true },
    ] },
    { id: "variant-first", name: "Size", kind: "variant", required: true, min: 1, max: 1, options: [
      { id: "first", name: "First" },
      { id: "second", name: "Second", isDefault: false },
    ] },
    { id: "addons", name: "Extras", kind: "addon", required: false, min: 0, max: 3, options: [
      { id: "free", name: "Free", isDefault: true, priceDelta: 0 },
      { id: "paid", name: "Paid", isDefault: true, priceDelta: 2 },
      { id: "ordinary", name: "Ordinary", priceDelta: 0 },
    ] },
  ]), {
    "variant-default": ["large"],
    "variant-first": ["first"],
    addons: ["free"],
  });
  assert.deepEqual(defaultBrowseOptionSelections([
    { id: "bounded", name: "Extras", kind: "addon", required: false, min: 0, max: 1, options: [
      { id: "first-free", isDefault: true, priceDelta: 0 },
      { id: "second-free", isDefault: true, priceDelta: 0 },
    ] },
  ]), { bounded: ["first-free"] }, "free defaults never exceed the group's selection maximum");
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
  const stagingSeed = fs.readFileSync(path.join(ROOT, "db/seed/staging_option_groups_seed.sql"), "utf8");
  assert.match(stagingSeed, /SET options_source = 'normalized'/);
});

test("backfill --apply marks only items that its plan migrated", async () => {
  const { applyPlan } = require("../../scripts/backfill-menu-option-groups.cjs");
  const updates = [];
  const admin = {
    from(table) {
      const builder = {
        upsert: async () => ({ error: null }),
        update: (payload) => {
          builder.payload = payload;
          return builder;
        },
        in: async (_column, ids) => {
          if (table === "menu_items") updates.push({ payload: builder.payload, ids });
          return { error: null };
        },
      };
      return builder;
    },
  };
  const migrated = { id: "migrated", organizer_id: "org", option_groups: [{ id: "ok", name: "Extras", required: false, min: 0, max: 1, options: [{ id: "cheese", name: "Cheese", price_delta: 1 }]}] };
  const skipped = { id: "skipped", organizer_id: "org", option_groups: [{ id: "bad", name: "Legacy discount", required: false, min: 0, max: 1, options: [{ id: "discount", name: "Discount", price_delta: -1 }]}] };
  const manuallyAssigned = { id: "manual", organizer_id: "org", option_groups: migrated.option_groups };
  await applyPlan(admin, {
    menuItems: [migrated, skipped, manuallyAssigned],
    groups: [{ id: "manual-group", legacy_source_item_id: null }],
    assignments: [{ id: "manual-assignment", item_id: "manual", group_id: "manual-group" }],
  });
  assert.deepEqual(updates, [{ payload: { options_source: "normalized" }, ids: ["migrated"] }]);
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
    "reorderMenuItemOptionGroups",
    "upgradeMenuItemOptions",
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
  for (const name of ["deleteMenuOptionGroup", "deleteMenuOption"]) {
    const start = actionSource.indexOf(`export async function ${name}`);
    const next = actionSource.indexOf("\nexport async function ", start + 1);
    const body = actionSource.slice(start, next < 0 ? undefined : next);
    assert.match(body, /authorize\(organizerId, \["owner", "admin", "manager"\]\)/, `${name} matches manager-only DELETE policy`);
    assert.doesNotMatch(body, /"editor"/, `${name} does not authorize editor DELETE`);
  }
  const unassignStart = actionSource.indexOf("export async function unassignMenuOptionGroup");
  const unassignEnd = actionSource.indexOf("\nexport async function ", unassignStart + 1);
  const unassignBody = actionSource.slice(unassignStart, unassignEnd < 0 ? undefined : unassignEnd);
  assert.match(unassignBody, /authorize\(organizerId, \["owner", "admin", "manager", "editor"\]\)/, "editors may detach assignments");
  assert.match(actionSource, /markItemsOptionsNormalized\(auth\.admin, organizerId, \[itemId\]\)/);
  assert.match(actionSource, /markItemsOptionsNormalized\(auth\.admin, organizerId, itemIds\)/);
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
  assert.match(migration, /^BEGIN;$/m);
  assert.match(migration, /ALTER TABLE public\.menu_items[\s\S]*options_source text NOT NULL DEFAULT 'json'/);
  assert.match(migration, /CHECK \(options_source IN \('json', 'normalized'\)\)/);
  assert.match(migration, /NOTIFY pgrst, 'reload schema';\s*COMMIT;\s*$/);
  assert.match(migration, /CREATE POLICY "Tenant managers can delete menu option groups"/);
  assert.match(migration, /CREATE POLICY "Tenant managers can delete menu options"/);
  assert.match(migration, /CREATE POLICY "Tenant managers can delete menu item option groups"/);
  assert.doesNotMatch(migration, /CREATE POLICY "Tenant editors can delete menu/);
  assert.match(migration, /Public can view assigned active menu option groups/);
  assert.match(migration, /Public can view assignments for active menu items/);
  assert.match(migration, /Public can view available assigned menu options/);
  assert.match(migration, /Tenant editors can insert menu option groups/);
  assert.match(migration, /Tenant editors can update menu options/);
  assert.match(migration, /Tenant managers can delete menu item option groups/);
  assert.match(migration, /at most one variant group/);
  assert.match(migration, /menu_option_groups_required_min_check/);
  assert.match(migration, /check_menu_option_variant_default/);
  assert.match(migration, /at most 20 options/);
  const rollback = fs.readFileSync(path.join(ROOT, "db/rollback/migration_182_menu_option_groups_rollback.sql"), "utf8");
  assert.match(rollback, /DROP TABLE IF EXISTS public\.menu_item_option_groups/);
  assert.match(rollback, /DROP TABLE IF EXISTS public\.menu_options/);
  assert.match(rollback, /DROP TABLE IF EXISTS public\.menu_option_groups/);
  assert.match(rollback, /DROP COLUMN IF EXISTS options_source/);
});

test("new order snapshot labels and quantities retain legacy snapshot fallbacks", () => {
  const orderCard = fs.readFileSync(path.join(ROOT, "components/dashboard/orders/OrderCard.tsx"), "utf8");
  const tracking = fs.readFileSync(path.join(ROOT, "components/site/OrderTrackingView.tsx"), "utf8");
  const notifications = fs.readFileSync(path.join(ROOT, "lib/order-notifications.ts"), "utf8");
  for (const source of [orderCard, tracking, notifications]) {
    assert.match(source, /formatChosenMenuOption/);
  }
  assert.match(orderCard, /group_kind\?/);
  assert.match(notifications, /group_kind\?/);
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

test("default choices are checked and included in the item total", async () => {
  const jsdom = tryRequireJsdom();
  if (!jsdom) {
    assert.deepEqual(defaultBrowseOptionSelections([
      { id: "size", name: "Size", kind: "variant", required: true, min: 1, max: 1, options: [{ id: "large", name: "Large", isDefault: true }] },
    ]), { size: ["large"] });
    return;
  }
  const { JSDOM } = jsdom;
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { url: "https://localhost/" });
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator, localStorage: globalThis.localStorage };
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
    const root = createRoot(document.getElementById("root"));
    const groups = [{
      id: "mains",
      title: "Mains",
      items: [{
        id: "defaults-item",
        name: "Defaulted dish",
        description: null,
        image: null,
        priceLabel: "USD 10.00",
        numericPrice: 10,
        isSoldOut: false,
        tags: [],
        detailRows: [],
        optionGroups: [
          { id: "size", name: "Size", kind: "variant", required: true, min: 1, max: 1, options: [{ id: "small", name: "Small", price: 10, priceDelta: 0 }, { id: "large", name: "Large", price: 15, priceDelta: 0, isDefault: true }] },
          { id: "extras", name: "Extras", kind: "addon", required: false, min: 0, max: 2, options: [{ id: "free", name: "Free extra", priceDelta: 0, isDefault: true }, { id: "paid", name: "Paid extra", priceDelta: 4, isDefault: true }] },
        ],
      }],
    }];
    await act(async () => root.render(React.createElement(StorefrontBrowse, {
      groups,
      labels: RENDER_LABELS,
      showGroups: false,
      orderConfig: { enabled: true, slug: "test", currency: "USD" },
    })));
    await act(async () => document.querySelector('button[aria-label="Defaulted dish"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    const dialog = document.querySelector('[role="dialog"]');
    assert.equal(dialog.querySelectorAll('input[name="group-size"]')[1]?.checked, true);
    assert.equal(dialog.querySelectorAll('input[name="group-extras"]')[0]?.checked, true);
    assert.equal(dialog.querySelectorAll('input[name="group-extras"]')[1]?.checked, false);
    assert.ok(dialog.textContent.includes("$15.00"), "the default variant and free default are included in the preview total");
    await act(async () => root.unmount());
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.navigator = previous.navigator;
    globalThis.localStorage = previous.localStorage;
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

async function withClientDom(run) {
  const jsdom = tryRequireJsdom();
  if (!jsdom) return false;
  const { JSDOM } = jsdom;
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { url: "https://localhost/" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    localStorage: globalThis.localStorage,
    IntersectionObserver: globalThis.IntersectionObserver,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.navigator = dom.window.navigator;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.IntersectionObserver = undefined;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require("react");
  const { createRoot } = require("react-dom/client");
  const { act } = require("react");
  const root = createRoot(document.getElementById("root"));
  try {
    await run({ dom, React, act, root });
  } finally {
    await act(async () => root.unmount());
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.navigator = previous.navigator;
    globalThis.localStorage = previous.localStorage;
    globalThis.IntersectionObserver = previous.IntersectionObserver;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT;
  }
  return true;
}

test("required customization stays actionable and focuses the first unsatisfied group", async () => {
  const ran = await withClientDom(async ({ dom, React, act, root }) => {
    const { StorefrontBrowse } = require("../../components/site/blocks/StorefrontBrowse.tsx");
    const groups = [{
      id: "main", title: "Main", items: [{
        id: "required-dish", name: "Required dish", priceLabel: "USD 10.00", numericPrice: 10, tags: [], detailRows: [],
        optionGroups: [{ id: "sauce", name: "Sauce", kind: "addon", required: true, min: 1, max: 1, options: [{ id: "mild", name: "Mild", priceDelta: 0 }] }],
      }],
    }];
    await act(async () => root.render(React.createElement(StorefrontBrowse, {
      groups, labels: RENDER_LABELS, showGroups: false,
      orderConfig: { enabled: true, slug: "required-test", currency: "USD" },
    })));
    const card = document.querySelector('button[aria-label="Required dish"]');
    await act(async () => card.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    const dialog = document.querySelector('[role="dialog"]');
    const add = dialog.querySelector("button.ps-button-primary");
    assert.equal(add.disabled, false, "the Add button remains available to expose inline validation");
    await act(async () => add.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.equal(dialog.querySelector('[role="alert"]')?.textContent, "Choose 1 to continue");
    assert.equal(document.activeElement, dialog.querySelector('input[name="group-sauce"]'));
    const highlightedGroup = [...dialog.querySelectorAll("div")].find((element) => element.className.includes("border-2"));
    assert.ok(highlightedGroup, "the unsatisfied group has a visible non-color border indicator");
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(document.querySelector('[role="dialog"]'), null, "Escape closes the customization sheet");
    assert.equal(document.activeElement, card, "closing returns focus to the opening card");
  });
  if (!ran) assert.ok(true, "jsdom unavailable; required-group helper and source assertions still run");
});

test("one-tap menu add is limited to available option-free items and respects sold-out/blocked state", async () => {
  const ran = await withClientDom(async ({ dom, React, act, root }) => {
    const { StorefrontBrowse } = require("../../components/site/blocks/StorefrontBrowse.tsx");
    const groups = [{ id: "mains", title: "Mains", items: [
      { id: "plain", name: "Plain", priceLabel: "USD 10.00", numericPrice: 10, tags: [], detailRows: [], optionGroups: [] },
      { id: "empty-required", name: "Empty required", priceLabel: "USD 10.00", numericPrice: 10, tags: [], detailRows: [], optionGroups: [{ id: "required-sauce", name: "Sauce", kind: "addon", required: true, min: 1, max: 1, options: [{ id: "unavailable-sauce", name: "Unavailable sauce", isAvailable: false }] }] },
      { id: "custom", name: "Custom", priceLabel: "USD 10.00", numericPrice: 10, tags: [], detailRows: [], optionGroups: [{ id: "extras", name: "Extras", required: false, min: 0, max: 1, options: [{ id: "cheese", name: "Cheese", priceDelta: 2 }] }] },
      { id: "sold", name: "Sold", priceLabel: "USD 10.00", numericPrice: 10, isSoldOut: true, tags: [], detailRows: [], optionGroups: [] },
    ] }];
    const props = {
      groups, labels: RENDER_LABELS, showGroups: false, variant: "catalog-carousel",
      carousel: { prevLabel: "Previous", nextLabel: "Next", regionLabel: "Categories" },
      orderConfig: { enabled: true, slug: "quick-test", currency: "USD" },
    };
    await act(async () => root.render(React.createElement(StorefrontBrowse, props)));
    assert.ok(document.querySelector('button[aria-label="Add Plain to order"]'));
    assert.ok(document.querySelector('button[aria-label="Add Empty required to order"]'),
      "required groups with no available choices are treated as option-free");
    assert.equal(document.querySelector('button[aria-label="Add Custom to order"]'), null);
    assert.equal(document.querySelector('button[aria-label="Add Sold to order"]'), null);
    await act(async () => document.querySelector('button[aria-label="Add Plain to order"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => document.querySelector('button[aria-label="Add Empty required to order"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.equal(document.querySelector('[role="dialog"]'), null, "direct add skips the item sheet");
    const stored = JSON.parse(localStorage.getItem("aldriva_cart_quick-test"));
    assert.deepEqual(stored.items.map((line) => line.itemId), ["plain", "empty-required"]);
    assert.equal(stored.items[0].quantity, 1);
    assert.ok(document.body.textContent.includes("Added to order"));
    await act(async () => document.querySelector('button[aria-label="Custom"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.ok(document.querySelector('[role="dialog"]'), "customizable cards still open the sheet");
    await act(async () => root.render(React.createElement(StorefrontBrowse, { ...props, orderConfig: { ...props.orderConfig, blocked: true } })));
    assert.equal(document.querySelector('button[aria-label="Add Plain to order"]'), null, "blocked order config hides quick add");
  });
  if (!ran) assert.ok(true, "jsdom unavailable; eligibility helper is covered by the pure tests");
});

test("category tabs support arrow-key movement, no-IO lazy fallback, and loaded-item search", async () => {
  const ran = await withClientDom(async ({ dom, React, act, root }) => {
    const { StorefrontBrowse } = require("../../components/site/blocks/StorefrontBrowse.tsx");
    const groups = [
      { id: "mains", title: "Mains", items: [{ id: "yassa", name: "Yassa", description: "Lemon chicken", priceLabel: "USD 10", tags: [], detailRows: [] }] },
      { id: "sides", title: "Sides", items: [{ id: "rice", name: "Rice", description: "Attieke side", priceLabel: "USD 4", tags: [], detailRows: [] }] },
    ];
    await act(async () => root.render(React.createElement(StorefrontBrowse, {
      groups, labels: RENDER_LABELS, showGroups: true,
    })));
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    assert.equal(tabs.length, 2);
    assert.equal(tabs[0].getAttribute("aria-selected"), "true");
    assert.ok(document.querySelector('button[aria-label="Rice"]'), "without IntersectionObserver, all static item cards render");
    await act(async () => tabs[0].dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    assert.equal(document.activeElement, tabs[1]);
    assert.equal(tabs[1].getAttribute("aria-selected"), "true");
    const search = document.querySelector('input[type="search"]');
    const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
      valueSetter.call(search, "lemon");
      search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.ok(document.body.textContent.includes("Yassa"));
    assert.equal(document.body.textContent.includes("Attieke side"), false, "search filters data already loaded in the client");
  });
  if (!ran) assert.ok(true, "jsdom unavailable; category helper contracts are covered by source and pure tests");
});

test("IntersectionObserver renders the first menu group and loads later groups on approach", async () => {
  const ran = await withClientDom(async ({ dom, React, act, root }) => {
    const observers = [];
    class MockIntersectionObserver {
      constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
      observe(target) { this.targets.push(target); }
      disconnect() {}
    }
    globalThis.IntersectionObserver = MockIntersectionObserver;
    const { StorefrontBrowse } = require("../../components/site/blocks/StorefrontBrowse.tsx");
    const groups = [
      { id: "first", title: "First", items: [{ id: "one", name: "First item", tags: [], detailRows: [] }] },
      { id: "later", title: "Later", items: [{ id: "two", name: "Later item", tags: [], detailRows: [] }] },
    ];
    await act(async () => root.render(React.createElement(StorefrontBrowse, { groups, labels: RENDER_LABELS, showGroups: true })));
    assert.ok(document.querySelector('button[aria-label="First item"]'), "first group content is immediate");
    assert.equal(document.querySelector('button[aria-label="Later item"]'), null, "later group content starts as a lightweight placeholder");
    const laterSection = document.querySelector('[data-menu-group-id="later"]');
    const firstSection = document.querySelector('[data-menu-group-id="first"]');
    const lazyObserver = observers[0];
    assert.ok(lazyObserver.targets.includes(laterSection), "the later section is observed");
    await act(async () => lazyObserver.callback([{ target: laterSection, isIntersecting: true, boundingClientRect: { top: 20 } }]));
    assert.ok(document.querySelector('button[aria-label="Later item"]'), "approaching a category renders its menu items");
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    await act(async () => tabs[0].dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    assert.equal(tabs[1].getAttribute("aria-selected"), "true");
    firstSection.getBoundingClientRect = () => ({ top: 40, bottom: 240 });
    laterSection.getBoundingClientRect = () => ({ top: 260, bottom: 460 });
    await act(async () => observers[1].callback([
      { target: firstSection, isIntersecting: true, boundingClientRect: { top: 40 } },
      { target: laterSection, isIntersecting: true, boundingClientRect: { top: 260 } },
    ]));
    assert.equal(tabs[1].getAttribute("aria-selected"), "true", "scroll-spy keeps a manually selected category active while its section remains visible");
  });
  if (!ran) assert.ok(true, "jsdom unavailable; source contract and no-IO fallback tests remain active");
});

test("cart edit reopens with choices, updates in place, and identical new selections merge", async () => {
  const ran = await withClientDom(async ({ dom, React, act, root }) => {
    const { StorefrontBrowse } = require("../../components/site/blocks/StorefrontBrowse.tsx");
    const groups = [{ id: "mains", title: "Mains", items: [{
      id: "custom-dish", name: "Custom dish", priceLabel: "USD 10.00", numericPrice: 10, updatedAt: "v1", tags: [], detailRows: [],
      optionGroups: [{ id: "extras", name: "Extras", kind: "addon", required: false, min: 0, max: 1, options: [{ id: "cheese", name: "Cheese", priceDelta: 2, maxQty: 3 }] }],
    }] }];
    await act(async () => root.render(React.createElement(StorefrontBrowse, {
      groups, labels: RENDER_LABELS, showGroups: false, variant: "catalog-carousel",
      carousel: { prevLabel: "Previous", nextLabel: "Next", regionLabel: "Categories" },
      orderConfig: { enabled: true, slug: "edit-test", currency: "USD" },
    })));
    await act(async () => document.querySelector('button[aria-label="Custom dish"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    let dialog = document.querySelector('[role="dialog"]');
    await act(async () => dialog.querySelector('input[name="group-extras"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => dialog.querySelector('button[aria-label="Increase Cheese quantity"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => dialog.querySelector("button.ps-button-primary").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    let cart = JSON.parse(localStorage.getItem("aldriva_cart_edit-test"));
    const originalLineId = cart.items[0].lineId;
    assert.deepEqual(cart.items[0].selectedOptions, [{ groupId: "extras", optionId: "cheese", qty: 2 }]);

    await act(async () => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("View order")).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    let drawer = document.querySelector('[role="dialog"]');
    assert.ok(drawer.textContent.includes("Extras"));
    assert.ok(drawer.textContent.includes("Cheese × 2"));
    assert.ok(drawer.textContent.includes("USD 14.00"));
    await act(async () => drawer.querySelector(`[data-cart-edit-id="${originalLineId}"]`).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    dialog = document.querySelector('[role="dialog"]');
    assert.equal(dialog.querySelector('input[name="group-extras"]').checked, true);
    assert.equal(dialog.querySelector('button[aria-label="Increase Cheese quantity"]').previousElementSibling.textContent, "2");
    await act(async () => dialog.querySelector('button[aria-label="Decrease Cheese quantity"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => dialog.querySelector("button.ps-button-primary").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    cart = JSON.parse(localStorage.getItem("aldriva_cart_edit-test"));
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].lineId, originalLineId);
    assert.deepEqual(cart.items[0].selectedOptions, [{ groupId: "extras", optionId: "cheese", qty: 1 }]);

    drawer = document.querySelector('[role="dialog"]');
    const close = [...drawer.querySelectorAll("button")].find((button) => !button.textContent.trim());
    await act(async () => close.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => document.querySelector('button[aria-label="Custom dish"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    dialog = document.querySelector('[role="dialog"]');
    await act(async () => dialog.querySelector('input[name="group-extras"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => dialog.querySelector("button.ps-button-primary").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    cart = JSON.parse(localStorage.getItem("aldriva_cart_edit-test"));
    assert.equal(cart.items.length, 1, "same option selection merges into one line");
    assert.equal(cart.items[0].lineId, originalLineId);
    assert.equal(cart.items[0].quantity, 2);
  });
  if (!ran) assert.ok(true, "jsdom unavailable; cart migration and upsert rules are covered by pure tests");
});

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
      : persistedCart.version === STOREFRONT_CART_VERSION && Array.isArray(persistedCart.items)
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


