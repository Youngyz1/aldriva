const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  calculateSelectedMenuUnitPrice,
  computeLineTotal,
} = require(path.join(ROOT, "lib/menu-pricing.ts"));
const {
  eligiblePromotionsForItem,
  findEligibleCodePromotion,
  isPromotionActive,
  resolveBasePrice,
  roundToCurrencyMinorUnit,
} = require(path.join(ROOT, "lib/menu-promotions.ts"));

const NOW = new Date("2026-10-20T12:00:00.000Z");
const TARGET = { item_id: "item-1", section_id: null };
function item(overrides = {}) {
  return { id: "item-1", organizer_id: "org-1", section_id: "section-1", price: 100, promo_price: null, option_groups: [], ...overrides };
}
function promotion(overrides = {}) {
  return {
    id: "promo-1", organizer_id: "org-1", name: "Twenty off", offer_type: "percent_off", percent_off: 20,
    status: "active", starts_at: null, ends_at: null, min_order_amount: null, priority: 0,
    created_at: "2026-10-01T00:00:00.000Z", targets: [TARGET], ...overrides,
  };
}

test("base-price table selects one lowest candidate and applies manual prices", () => {
  const scenarios = [
    { name: "regular price", item: item(), promos: [], expected: [100, "none"] },
    { name: "manual promo price", item: item({ promo_price: 80 }), promos: [], expected: [80, "promo_price"] },
    { name: "automatic percent", item: item(), promos: [promotion()], expected: [80, "promotion"] },
    { name: "special price", item: item(), promos: [promotion({ offer_type: "special_price", percent_off: null, special_price: 72 })], expected: [72, "promotion"] },
    { name: "free delivery is an eligible no-price-change candidate", item: item(), promos: [promotion({ offer_type: "free_delivery", percent_off: null })], expected: [100, "promotion"] },
    { name: "only the best candidate applies", item: item({ promo_price: 70 }), promos: [promotion({ offer_type: "special_price", percent_off: null, special_price: 60 })], expected: [60, "promotion"] },
  ];
  for (const scenario of scenarios) {
    const result = resolveBasePrice(scenario.item, scenario.promos, { now: NOW, subtotal: 500, currency: "USD" });
    assert.deepEqual([result.basePrice, result.source], scenario.expected, scenario.name);
  }
});

test("code offers require the supplied code and reject expired, wrong-tenant, and below-minimum offers", () => {
  const codePromo = promotion({ code: "SAVE10", percent_off: 10, min_order_amount: 50 });
  assert.equal(findEligibleCodePromotion("save10", [codePromo], { organizerId: "org-1", subtotal: 50, now: NOW })?.id, "promo-1");
  assert.equal(resolveBasePrice(item(), [codePromo], { code: "SAVE10", organizerId: "org-1", subtotal: 50, now: NOW }).basePrice, 90);
  assert.equal(resolveBasePrice(item(), [codePromo], { now: NOW, subtotal: 500 }).basePrice, 100, "code not sent");
  assert.equal(resolveBasePrice(item(), [codePromo], { code: "BAD", now: NOW, subtotal: 500 }).basePrice, 100, "wrong code ignored by pure resolver");
  assert.equal(findEligibleCodePromotion("SAVE10", [codePromo], { organizerId: "another-org", subtotal: 500, now: NOW }), null);
  assert.equal(findEligibleCodePromotion("SAVE10", [promotion({ ...codePromo, starts_at: "2026-10-21T00:00:00Z" })], { organizerId: "org-1", subtotal: 500, now: NOW }), null);
  assert.equal(findEligibleCodePromotion("SAVE10", [codePromo], { organizerId: "org-1", subtotal: 49.99, now: NOW }), null);
  assert.equal(findEligibleCodePromotion("SAVE10", [promotion({ ...codePromo, organizer_id: "another-org" })], { organizerId: "org-1", subtotal: 500, now: NOW }), null);
});

test("promotion eligibility checks window, status, item target, availability, tenant, and minimum subtotal", () => {
  const active = promotion({ starts_at: "2026-10-20T11:00:00Z", ends_at: "2026-10-20T13:00:00Z" });
  assert.equal(isPromotionActive(active, NOW), true);
  assert.equal(isPromotionActive(promotion({ status: "paused" }), NOW), false);
  assert.equal(isPromotionActive(promotion({ ends_at: "2026-10-20T11:59:00Z" }), NOW), false);
  assert.equal(eligiblePromotionsForItem(item(), [promotion({ min_order_amount: 200 })], { subtotal: 199, now: NOW }).length, 0);
  assert.equal(eligiblePromotionsForItem(item(), [promotion({ min_order_amount: 200 })], { subtotal: 200, now: NOW }).length, 1);
  assert.equal(eligiblePromotionsForItem(item({ organizer_id: "other" }), [promotion()], { now: NOW }).length, 0);
  assert.equal(eligiblePromotionsForItem(item({ id: "unrelated" }), [promotion()], { now: NOW }).length, 0);
  assert.equal(eligiblePromotionsForItem(item({ is_active: false }), [promotion()], { now: NOW }).length, 0);
  assert.equal(eligiblePromotionsForItem(item({ is_sold_out: true }), [promotion()], { now: NOW }).length, 0);
});

test("tie breaking uses priority, then earlier creation, then lexicographic id", () => {
  const first = promotion({ id: "z", offer_type: "special_price", percent_off: null, special_price: 50, priority: 4, created_at: "2026-10-01T00:00:00Z" });
  const higherPriority = promotion({ id: "a", offer_type: "special_price", percent_off: null, special_price: 50, priority: 8, created_at: "2026-10-10T00:00:00Z" });
  const earlier = promotion({ id: "b", offer_type: "special_price", percent_off: null, special_price: 50, priority: 4, created_at: "2026-09-01T00:00:00Z" });
  const idTie = promotion({ id: "a", offer_type: "special_price", percent_off: null, special_price: 50, priority: 4, created_at: "2026-10-01T00:00:00Z" });
  assert.equal(resolveBasePrice(item(), [first, higherPriority], { now: NOW }).appliedPromotion.id, "a");
  assert.equal(resolveBasePrice(item(), [first, earlier], { now: NOW }).appliedPromotion.id, "b");
  assert.equal(resolveBasePrice(item(), [first, idTie], { now: NOW }).appliedPromotion.id, "a");
});

test("variant prices ignore manual and special-price offers; percent requires explicit opt-in", () => {
  const variantGroup = { id: "size", name: "Size", kind: "variant", required: true, min: 1, max: 1, options: [
    { id: "large", name: "Large", price: 120, price_delta: 0 },
  ] };
  const variantItem = item({ price: 100, promo_price: 50, option_groups: [variantGroup] });
  const selection = [{ groupId: "size", optionIds: ["large"] }];
  const special = promotion({ offer_type: "special_price", percent_off: null, special_price: 40 });
  assert.equal(computeLineTotal({ item: variantItem, selection, promotions: [special], now: NOW, quantity: 1 }).unitPrice, 120);
  assert.equal(computeLineTotal({ item: variantItem, selection, promotions: [promotion({ apply_to_variants: false })], now: NOW, quantity: 1 }).unitPrice, 120);
  assert.equal(computeLineTotal({ item: variantItem, selection, promotions: [promotion({ apply_to_variants: true })], now: NOW, quantity: 1 }).unitPrice, 96);
});

test("add-ons stay full price after discounts and the final unit price has a zero floor", () => {
  const addonGroup = { id: "extras", name: "Extras", kind: "addon", required: false, min: 0, max: 1, options: [
    { id: "cheese", name: "Cheese", price_delta: 5 },
  ] };
  const addonItem = item({ option_groups: [addonGroup] });
  const selection = [{ groupId: "extras", optionIds: ["cheese"] }];
  const discounted = computeLineTotal({ item: addonItem, selection, promotions: [promotion()], now: NOW, quantity: 2 });
  assert.equal(discounted.unitPrice, 80, "snapshot unit_price stays the discounted base; option delta is separate");
  assert.equal(discounted.lineTotal, 170);
  const negative = { id: "negative", name: "Legacy negative", price_delta: -200 };
  const floorItem = item({ price: 10, option_groups: [{ ...addonGroup, options: [negative] }] });
  assert.equal(computeLineTotal({ item: floorItem, selection: [{ groupId: "extras", optionIds: ["negative"] }], now: NOW, quantity: 1 }).lineTotal, 0);
});

test("per-unit discount and line total use the currency minor unit for XOF and USD", () => {
  const xof = resolveBasePrice(item({ price: 105 }), [promotion({ percent_off: 10 })], { now: NOW, currency: "XOF" });
  assert.equal(xof.discountPerUnit, 11);
  assert.equal(xof.basePrice, 94);
  const usd = resolveBasePrice(item({ price: 10.03 }), [promotion()], { now: NOW, currency: "USD" });
  assert.equal(usd.discountPerUnit, 2.01);
  assert.equal(usd.basePrice, 8.02);
  assert.equal(roundToCurrencyMinorUnit(2.6, "XOF"), 3);
  assert.equal(roundToCurrencyMinorUnit(2.606, "USD"), 2.61);
  const one = computeLineTotal({ item: item({ price: 10.03 }), promotions: [promotion()], currency: "USD", now: NOW, quantity: 1 });
  const fifty = computeLineTotal({ item: item({ price: 10.03 }), promotions: [promotion()], currency: "USD", now: NOW, quantity: 50 });
  assert.equal(one.lineTotal, 8.02);
  assert.equal(fifty.lineTotal, 401);
});

test("client preview and authoritative line calculation use the same pricing helper", () => {
  const inputItem = item({ price: 10.03, option_groups: [{
    id: "extras", name: "Extras", kind: "addon", required: false, min: 0, max: 1,
    options: [{ id: "cheese", name: "Cheese", price_delta: 0.25 }],
  }] });
  const selection = [{ groupId: "extras", optionIds: ["cheese"] }];
  const context = { promotions: [promotion()], currency: "USD", now: NOW, subtotal: 500, organizerId: "org-1" };
  const clientPreview = calculateSelectedMenuUnitPrice(inputItem, selection, context);
  const serverTotal = computeLineTotal({ item: inputItem, selection, quantity: 3, ...context });
  assert.equal(serverTotal.unitPrice, clientPreview.baseUnitPrice);
  assert.equal(serverTotal.lineTotal, clientPreview.unitPrice * 3);
  assert.deepEqual([serverTotal.appliedPromotion?.id, serverTotal.discountPerUnit], ["promo-1", 2.01]);
});
