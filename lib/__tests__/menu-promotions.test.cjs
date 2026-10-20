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
  calculatePromotionCartPricing,
  computeLineTotal,
} = require(path.join(ROOT, "lib/menu-pricing.ts"));
const {
  eligiblePromotionsForItem,
  findEligibleCodePromotion,
  getMenuPromotionDisplayStatus,
  isPromotionActive,
  resolveBasePrice,
  roundToCurrencyMinorUnit,
} = require(path.join(ROOT, "lib/menu-promotions.ts"));
const { loadMenuPromotions } = require(path.join(ROOT, "lib/menu-promotion-data.ts"));
const { promotionRoleCan } = require(path.join(ROOT, "lib/menu-promotion-authorization.ts"));

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

test("promotion display status covers draft, scheduled, active, expired, and paused", () => {
  assert.equal(getMenuPromotionDisplayStatus(promotion({ status: "draft" }), NOW), "draft");
  assert.equal(getMenuPromotionDisplayStatus(promotion({ starts_at: "2026-10-21T00:00:00Z" }), NOW), "scheduled");
  assert.equal(getMenuPromotionDisplayStatus(promotion(), NOW), "active");
  assert.equal(getMenuPromotionDisplayStatus(promotion({ ends_at: "2026-10-20T11:00:00Z" }), NOW), "expired");
  assert.equal(getMenuPromotionDisplayStatus(promotion({ status: "paused" }), NOW), "paused");
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

test("shared cart pricing validates codes and computes minimums from the pre-discount subtotal", () => {
  const lines = [
    { item: item({ price: 60 }), selection: [], quantity: 1 },
    { item: item({ id: "item-2", section_id: "section-1", price: 40 }), selection: [], quantity: 1 },
  ];
  const code = promotion({ id: "code-promo", code: "ORDER10", percent_off: 10, min_order_amount: 100, targets: [{ section_id: "section-1" }] });
  const valid = calculatePromotionCartPricing(lines, [code], { code: "ORDER10", now: NOW, currency: "USD", organizerId: "org-1" });
  assert.equal(valid.validCode, true);
  assert.equal(valid.preDiscountSubtotal, 100);
  assert.equal(valid.subtotal, 90);
  assert.equal(valid.lines[0].discountPerUnit, 6);
  const tooSmall = calculatePromotionCartPricing([lines[0]], [code], { code: "ORDER10", now: NOW, currency: "USD", organizerId: "org-1" });
  assert.equal(tooSmall.validCode, false);
});

test("missing promotion schema fails soft with one warning and public projection omits codes", async () => {
  let warnings = 0;
  const warn = console.warn;
  console.warn = () => { warnings++; };
  const missingClient = {
    from() {
      const query = {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        then(resolve) { return Promise.resolve({ data: null, error: { code: "PGRST205", message: "promotions was not found in schema cache" } }).then(resolve); },
      };
      return query;
    },
  };
  try {
    const first = await loadMenuPromotions(missingClient, "org-1", { context: "test", status: "active", includeCodes: false });
    const second = await loadMenuPromotions(missingClient, "org-1", { context: "test", status: "active", includeCodes: false });
    assert.deepEqual(first.promotions, []);
    assert.deepEqual(second.promotions, []);
    assert.equal(first.error, null);
    assert.equal(warnings, 1);
  } finally {
    console.warn = warn;
  }

  const selections = [];
  const publicClient = {
    from(table) {
      const result = table === "promotions"
        ? { data: [promotion({ code: "SECRET" })], error: null }
        : { data: [{ id: "target-1", organizer_id: "org-1", promotion_id: "promo-1", item_id: "item-1", section_id: null }], error: null };
      const query = {
        select(fields) { selections.push([table, fields]); return this; },
        eq() { return this; },
        is(column, value) { selections.push([table, column, value]); return this; },
        in() { return this; },
        then(resolve) { return Promise.resolve(result).then(resolve); },
      };
      return query;
    },
  };
  const publicResult = await loadMenuPromotions(publicClient, "org-1", { context: "test", status: "active", includeCodes: false });
  assert.ok(!selections.find(([table]) => table === "promotions")[1].split(", ").includes("code"));
  assert.deepEqual(selections.find(([table, column]) => table === "promotions" && column === "code"), ["promotions", "code", null]);
  assert.equal(Object.hasOwn(publicResult.promotions[0], "code"), false);
});

test("promotion action role matrix matches dashboard permissions and rejects cross-tenant writes", async () => {
  const originalLoad = Module._load;
  const state = { role: "owner", tenantAccess: true, platformAdmin: false };
  const unusedAdmin = { from() { throw new Error("database should not be queried for invalid input"); } };
  Module._load = function loadPromotionActionMocks(request, parent, isMain) {
    if (request === "next/cache") return { revalidatePath() {} };
    if (request === "@/lib/supabase-admin") return { createSupabaseAdmin: () => unusedAdmin };
    if (request === "@/lib/supabase-server") return { createSupabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }) };
    if (request === "@/lib/auth") return { isAdmin: async () => state.platformAdmin };
    if (request === "@/lib/tenant-context") return { requireTenantContext: async (_userId, _organizerId, roles) => {
      if (!state.tenantAccess || !roles.includes(state.role)) throw new Error("tenant access denied");
    } };
    if (request === "@/lib/image-url") return { safeImageSrc: () => true };
    if (request === "@/lib/menu-option-schema") return { isMissingMenuOptionSchema: () => false, warnMissingMenuOptionSchemaOnce() {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  let actions;
  try {
    delete require.cache[require.resolve(path.join(ROOT, "lib/actions/promotions.ts"))];
    actions = require(path.join(ROOT, "lib/actions/promotions.ts"));
  } finally {
    Module._load = originalLoad;
  }

  for (const [role, expected] of [
    ["owner", [true, true, true]],
    ["admin", [true, true, true]],
    ["manager", [true, true, true]],
    ["editor", [true, true, false]],
    ["finance", [true, false, false]],
    ["viewer", [true, false, false]],
  ]) {
    assert.deepEqual([
      promotionRoleCan(role, "read"),
      promotionRoleCan(role, "write"),
      promotionRoleCan(role, "delete"),
    ], expected, `${role} permissions`);
  }

  for (const role of ["owner", "admin", "manager", "editor"]) {
    state.role = role;
    state.tenantAccess = true;
    const result = await actions.createPromotion("org-1", {});
    assert.match(result.error, /Name is required/, `${role} is authorized to enter the create validation path`);
  }
  for (const role of ["finance", "viewer"]) {
    state.role = role;
    const result = await actions.createPromotion("org-1", {});
    assert.equal(result.error, "Forbidden", `${role} cannot write promotions`);
  }
  state.role = "owner";
  state.tenantAccess = false;
  state.platformAdmin = false;
  assert.equal((await actions.createPromotion("other-org", {})).error, "Forbidden", "membership on a different organizer cannot authorize this tenant");
  state.platformAdmin = true;
  assert.match((await actions.createPromotion("org-1", {})).error, /Name is required/, "active platform admin fallback can write");
});

test("promotion actions reject special prices on variants and report stale concurrent updates", async () => {
  const originalLoad = Module._load;
  const state = { currentPromotion: null, insertCalled: false };
  const itemId = "10000000-0000-4000-8000-000000000001";
  const promotionId = "20000000-0000-4000-8000-000000000002";
  const variantItem = {
    id: itemId, section_id: null, options_source: "json",
    option_groups: [{ id: "size", kind: "variant", options: [{ id: "large", price: 120 }] }],
  };
  const admin = {
    from(table) {
      const query = { table, selectColumns: "", operation: "select", payload: null };
      const builder = {
        select(columns) { query.selectColumns = columns || ""; return builder; },
        eq() { return builder; },
        in() { return builder; },
        range() { return builder; },
        order() { return builder; },
        insert(payload) { query.operation = "insert"; query.payload = payload; state.insertCalled = true; return builder; },
        update(payload) { query.operation = "update"; query.payload = payload; return builder; },
        delete() { query.operation = "delete"; return builder; },
        maybeSingle: async () => {
          if (table === "promotions" && query.operation === "select") return { data: state.currentPromotion, error: null };
          if (table === "promotions" && query.operation === "update") return { data: null, error: null };
          return { data: null, error: null };
        },
        single: async () => ({ data: { id: promotionId, ...query.payload }, error: null }),
        then(resolve, reject) {
          let data = [];
          if (table === "menu_items") data = query.selectColumns.includes("options_source") ? [variantItem] : [{ id: itemId }];
          if (table === "promotion_targets") data = [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const authState = { role: "owner", tenantAccess: true, platformAdmin: false };
  Module._load = function loadActionMocks(request, parent, isMain) {
    if (request === "next/cache") return { revalidatePath() {} };
    if (request === "@/lib/supabase-admin") return { createSupabaseAdmin: () => admin };
    if (request === "@/lib/supabase-server") return { createSupabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }) };
    if (request === "@/lib/auth") return { isAdmin: async () => authState.platformAdmin };
    if (request === "@/lib/tenant-context") return { requireTenantContext: async (_userId, _organizerId, roles) => {
      if (!authState.tenantAccess || !roles.includes(authState.role)) throw new Error("tenant access denied");
    } };
    if (request === "@/lib/image-url") return { safeImageSrc: () => true };
    if (request === "@/lib/menu-option-schema") return { isMissingMenuOptionSchema: () => false, warnMissingMenuOptionSchemaOnce() {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  let actions;
  try {
    delete require.cache[require.resolve(path.join(ROOT, "lib/actions/promotions.ts"))];
    actions = require(path.join(ROOT, "lib/actions/promotions.ts"));
  } finally {
    Module._load = originalLoad;
  }

  const rejected = await actions.createPromotion("org-1", {
    name: "Large special",
    offer_type: "special_price",
    special_price: 40,
    status: "draft",
    targets: [{ item_id: itemId }],
  });
  assert.match(rejected.error, /cannot target variant items/i);
  assert.equal(state.insertCalled, false, "invalid promotion is rejected before insert");

  state.currentPromotion = {
    id: promotionId, organizer_id: "org-1", name: "Twenty off", headline: null, description: null,
    image_url: null, offer_type: "percent_off", percent_off: 20, special_price: null,
    apply_to_variants: false, code: null, min_order_amount: null, status: "active",
    starts_at: null, ends_at: null, priority: 0, layout: "banner", cta_label: null,
    destination_type: "none", destination_item_id: null, destination_section_id: null,
    destination_url: null, updated_at: "version-1",
  };
  const stale = await actions.updatePromotion(promotionId, "org-1", { name: "New name", updated_at: "version-1" });
  assert.equal(stale.success, false);
  assert.match(stale.error, /changed by someone else/i);
});
