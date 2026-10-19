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
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  calculateMenuLineTotal,
  calculateOptionAdjustedUnitPrice,
  computeLineTotal,
  effectiveUnitPrice,
  isOptionGroupSelectionSatisfied,
  MAX_LINE_QUANTITY,
  MIN_ORDER_QUANTITY,
  validateSelection,
} = require(path.join(ROOT, "lib/menu-pricing.ts"));

const storefrontSource = fs.readFileSync(path.join(ROOT, "components/site/blocks/StorefrontBrowse.tsx"), "utf8");
const orderSubmitSource = fs.readFileSync(path.join(ROOT, "lib/order-submit.ts"), "utf8");
const websiteEmbedsSource = fs.readFileSync(path.join(ROOT, "lib/website-embeds.ts"), "utf8");
const blockRendererSource = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");

function optionGroup({ id = "group", required = false, min = 0, max = 2 } = {}) {
  return {
    id,
    name: id,
    required,
    min,
    max,
    options: [
      { id: `${id}-a`, name: "A", price_delta: 0 },
      { id: `${id}-b`, name: "B", price_delta: 0 },
    ],
  };
}

function clientGroupsAreSatisfied(groups, selections) {
  const selectedByGroup = new Map((selections || []).map((selection) => [selection.groupId, selection.optionIds]));
  return groups.every((group) =>
    isOptionGroupSelectionSatisfied(group, (selectedByGroup.get(group.id) || []).length)
  );
}

test("quantity controls and server validation share the 1–50 line limit", () => {
  assert.equal(MAX_LINE_QUANTITY, 50);
  assert.match(storefrontSource, /Math\.min\(MAX_LINE_QUANTITY, q \+ 1\)/);
  assert.match(storefrontSource, /disabled=\{quantity >= MAX_LINE_QUANTITY\}/);
  assert.match(storefrontSource, /disabled=\{line\.quantity >= MAX_LINE_QUANTITY\}/);
  assert.match(storefrontSource, /labels\.quantityLimit/);
  assert.match(orderSubmitSource, /line\.quantity > MAX_LINE_QUANTITY/);

  const item = { price: 100, option_groups: [] };
  for (const quantity of [1, 50, 51, 99]) {
    const clientAccepts = Number.isInteger(quantity) && quantity >= MIN_ORDER_QUANTITY && quantity <= MAX_LINE_QUANTITY;
    let serverAccepts = true;
    try {
      computeLineTotal({ item, quantity });
    } catch {
      serverAccepts = false;
    }
    assert.equal(clientAccepts, serverAccepts, `quantity ${quantity} must have matching client/server validity`);
  }
});

test("client and server agree on required, optional-minimum, and max-reached groups", () => {
  const cases = [
    { name: "required missing", groups: [optionGroup({ id: "required", required: true, min: 1, max: 1 })], selected: [] },
    { name: "optional minimum missing", groups: [optionGroup({ id: "optional-min", min: 1 })], selected: [] },
    { name: "optional minimum met", groups: [optionGroup({ id: "optional-met", min: 1 })], selected: ["optional-met-a"] },
    { name: "max reached", groups: [optionGroup({ id: "maxed", min: 0, max: 2 })], selected: ["maxed-a", "maxed-b"] },
  ];

  for (const scenario of cases) {
    const selections = scenario.selected.length
      ? [{ groupId: scenario.groups[0].id, optionIds: scenario.selected }]
      : [];
    const clientValid = clientGroupsAreSatisfied(scenario.groups, selections);
    const serverValid = validateSelection({ price: 100, option_groups: scenario.groups }, selections).valid;
    assert.equal(clientValid, serverValid, scenario.name);
  }
});

test("client preview and authoritative totals match for promo and negative deltas", () => {
  const scenarios = [
    { price: 100, promo_price: 80, delta: 20, quantity: 1 },
    { price: 50, promo_price: null, delta: -75, quantity: 1 },
    { price: 100, promo_price: 80, delta: -100, quantity: 50 },
  ];

  for (const scenario of scenarios) {
    const group = {
      id: "extras",
      name: "Extras",
      required: false,
      min: 0,
      max: 1,
      options: [{ id: "choice", name: "Choice", price_delta: scenario.delta }],
    };
    const item = { price: scenario.price, promo_price: scenario.promo_price, option_groups: [group] };
    const selection = [{ groupId: "extras", optionIds: ["choice"] }];
    const clientUnitPrice = calculateOptionAdjustedUnitPrice(effectiveUnitPrice(item), scenario.delta);
    const clientTotal = calculateMenuLineTotal(clientUnitPrice, scenario.quantity);
    const serverTotal = computeLineTotal({ item, selection, quantity: scenario.quantity }).lineTotal;
    assert.equal(clientTotal, serverTotal);
  }
});

test("embedded menu caps are bounded and truncation has a full-menu path", () => {
  assert.match(websiteEmbedsSource, /MENU_ITEMS_PER_SECTION_LIMIT = 100/);
  assert.match(websiteEmbedsSource, /MENU_ITEMS_OVERALL_LIMIT = 500/);
  assert.match(websiteEmbedsSource, /\.limit\(MENU_ITEMS_OVERALL_LIMIT \+ 1\)/);
  assert.match(blockRendererSource, /section\.hasMoreItems \|\| section\.hasMoreItemsOverall/);
  assert.match(blockRendererSource, /t\("menuItemLimitNotice"\)/);
  assert.match(blockRendererSource, /hasPublishedMenuPage \?/);
  assert.match(blockRendererSource, /href=\{`\/site\/\$\{encodeURIComponent\(siteSlug\)\}\/menu`\}/);
  assert.match(blockRendererSource, /const isPromo = !hasVariant &&/);
});
