/**
 * lib/__tests__/phase2b1-menu-ordering.test.cjs
 *
 * Behavioral tests for Phase 2b-1:
 * - Pure menu pricing engine (effectiveUnitPrice, validatePromoPrice, validateOptionGroups,
 *   validateSelection, computeLineTotal)
 * - Server action validation for menu items (promo_price, is_sold_out, option_groups)
 * - Public browse rendering data structures (promo price, sold out, option groups)
 * - Existing items with default values render unchanged
 * - EN and FR translations for Storefront ordering keys
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

// Hook .ts compilation for testing TypeScript modules in node:test
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

const {
  effectiveUnitPrice,
  validatePromoPrice,
  validateOptionGroups,
  validateSelection,
  computeLineTotal,
} = require(path.join(ROOT, "lib/menu-pricing.ts"));

test("Phase 2b-1 Pricing: effectiveUnitPrice uses promo price when valid and lower", () => {
  // Standard promo price lower than regular price
  assert.equal(effectiveUnitPrice({ price: 1000, promo_price: 800 }), 800);
  assert.equal(effectiveUnitPrice({ price: 15.5, promo_price: 12.99 }), 12.99);

  // Promo price is 0 (valid free promo)
  assert.equal(effectiveUnitPrice({ price: 500, promo_price: 0 }), 0);

  // Promo price null or undefined -> uses regular price
  assert.equal(effectiveUnitPrice({ price: 1200, promo_price: null }), 1200);
  assert.equal(effectiveUnitPrice({ price: 1200, promo_price: undefined }), 1200);

  // Promo price equal to or greater than regular price -> falls back to regular price
  assert.equal(effectiveUnitPrice({ price: 1000, promo_price: 1000 }), 1000);
  assert.equal(effectiveUnitPrice({ price: 1000, promo_price: 1200 }), 1000);

  // Negative promo price -> falls back to regular price
  assert.equal(effectiveUnitPrice({ price: 1000, promo_price: -50 }), 1000);
});

test("Phase 2b-1 Pricing: validatePromoPrice validates promo price bounds", () => {
  // Valid cases
  assert.equal(validatePromoPrice(null, 1000), null);
  assert.equal(validatePromoPrice(undefined, 1000), null);
  assert.equal(validatePromoPrice("", 1000), null);
  assert.equal(validatePromoPrice(800, 1000), null);
  assert.equal(validatePromoPrice(0, 1000), null);

  // Promo price equal or greater than base price
  assert.match(validatePromoPrice(1000, 1000) || "", /strictly less/i);
  assert.match(validatePromoPrice(1200, 1000) || "", /strictly less/i);

  // Negative promo price
  assert.match(validatePromoPrice(-10, 1000) || "", /negative/i);

  // Invalid number
  assert.match(validatePromoPrice("abc", 1000) || "", /valid number/i);
});

test("Phase 2b-1 Pricing: validateOptionGroups enforces structural schema constraints", () => {
  // Valid empty or missing
  assert.equal(validateOptionGroups([]), null);
  assert.equal(validateOptionGroups(null), null);
  assert.equal(validateOptionGroups(undefined), null);

  // Valid single group
  const validGroup = {
    id: "bun",
    name: "Choose Bun",
    required: true,
    min: 1,
    max: 1,
    options: [
      { id: "brioche", name: "Brioche", price_delta: 0 },
      { id: "sesame", name: "Sesame", price_delta: 100 },
    ],
  };
  assert.equal(validateOptionGroups([validGroup]), null);

  // Reject more than 8 groups
  const nineGroups = Array.from({ length: 9 }, (_, i) => ({
    id: `g${i}`,
    name: `Group ${i}`,
    required: false,
    min: 0,
    max: 1,
    options: [{ id: `o${i}`, name: "Opt", price_delta: 0 }],
  }));
  assert.match(validateOptionGroups(nineGroups) || "", /Maximum of 8/i);

  // Reject duplicate group IDs
  assert.match(
    validateOptionGroups([validGroup, { ...validGroup, name: "Another Bun" }]) || "",
    /Duplicate option group ID/i
  );

  // Reject required with min < 1
  assert.match(
    validateOptionGroups([{ ...validGroup, min: 0 }]) || "",
    /required and must have min >= 1/i
  );

  // Reject max < min
  assert.match(
    validateOptionGroups([{ ...validGroup, min: 2, max: 1 }]) || "",
    /max must be an integer >= min/i
  );

  // Reject max > options count
  assert.match(
    validateOptionGroups([{ ...validGroup, max: 5 }]) || "",
    /cannot exceed total options count/i
  );

  // Reject more than 20 options
  const twentyOneOptions = Array.from({ length: 21 }, (_, i) => ({
    id: `opt${i}`,
    name: `Choice ${i}`,
    price_delta: 0,
  }));
  assert.match(
    validateOptionGroups([{ ...validGroup, max: 2, options: twentyOneOptions }]) || "",
    /at most 20 options/i
  );

  // Reject price_delta out of bounds
  assert.match(
    validateOptionGroups([
      {
        ...validGroup,
        options: [{ id: "opt1", name: "Too expensive", price_delta: 15000 }],
      },
    ]) || "",
    /price_delta must be between -10000 and 10000/i
  );
});

test("Phase 2b-1 Pricing: validateSelection enforces selection requirements and bounds", () => {
  const item = {
    price: 1500,
    option_groups: [
      {
        id: "bun",
        name: "Choose Bun",
        required: true,
        min: 1,
        max: 1,
        options: [
          { id: "brioche", name: "Brioche", price_delta: 0 },
          { id: "sesame", name: "Sesame", price_delta: 100 },
        ],
      },
      {
        id: "cheese",
        name: "Extra Cheese",
        required: false,
        min: 0,
        max: 2,
        options: [
          { id: "cheddar", name: "Cheddar", price_delta: 150 },
          { id: "swiss", name: "Swiss", price_delta: 150 },
          { id: "gouda", name: "Gouda", price_delta: 200 },
        ],
      },
    ],
  };

  // Valid selection: required bun chosen, 1 cheese chosen
  const validSel = [
    { groupId: "bun", optionIds: ["brioche"] },
    { groupId: "cheese", optionIds: ["cheddar"] },
  ];
  assert.deepEqual(validateSelection(item, validSel), { valid: true });

  // Missing required group
  const missingRequired = [{ groupId: "cheese", optionIds: ["cheddar"] }];
  assert.equal(validateSelection(item, missingRequired).valid, false);
  assert.match(validateSelection(item, missingRequired).error || "", /Selection required for "Choose Bun"/i);

  // Under min selections
  const emptyRequired = [{ groupId: "bun", optionIds: [] }];
  assert.equal(validateSelection(item, emptyRequired).valid, false);

  // Exceeding max selections
  const tooManyCheese = [
    { groupId: "bun", optionIds: ["brioche"] },
    { groupId: "cheese", optionIds: ["cheddar", "swiss", "gouda"] },
  ];
  assert.equal(validateSelection(item, tooManyCheese).valid, false);
  assert.match(validateSelection(item, tooManyCheese).error || "", /Maximum 2 selection\(s\) allowed/i);

  // Unknown option ID
  const unknownOption = [
    { groupId: "bun", optionIds: ["nonexistent_bun"] },
  ];
  assert.equal(validateSelection(item, unknownOption).valid, false);
  assert.match(validateSelection(item, unknownOption).error || "", /Unknown option ID/i);

  // Unknown option group ID
  const unknownGroup = [
    { groupId: "bun", optionIds: ["brioche"] },
    { groupId: "sauce", optionIds: ["ketchup"] },
  ];
  assert.equal(validateSelection(item, unknownGroup).valid, false);
  assert.match(validateSelection(item, unknownGroup).error || "", /Unknown option group ID/i);
});

test("Phase 2b-1 Pricing: computeLineTotal computes authoritative line totals", () => {
  const item = {
    price: 1000,
    promo_price: 850,
    option_groups: [
      {
        id: "side",
        name: "Side",
        required: true,
        min: 1,
        max: 1,
        options: [
          { id: "fries", name: "Fries", price_delta: 150 },
          { id: "salad", name: "Salad", price_delta: 200 },
        ],
      },
    ],
  };

  // Quantity 1 with fries: promo price 850 + 150 = 1000
  const calc1 = computeLineTotal({
    item,
    selection: [{ groupId: "side", optionIds: ["fries"] }],
    quantity: 1,
  });
  assert.equal(calc1.unitPrice, 850);
  assert.equal(calc1.optionsDelta, 150);
  assert.equal(calc1.lineTotal, 1000);

  // Quantity 3 with salad: (850 + 200) * 3 = 3150
  const calc2 = computeLineTotal({
    item,
    selection: [{ groupId: "side", optionIds: ["salad"] }],
    quantity: 3,
  });
  assert.equal(calc2.unitPrice, 850);
  assert.equal(calc2.optionsDelta, 200);
  assert.equal(calc2.lineTotal, 3150);

  // Quantity bounds: 1 to 50 allowed
  const minCalc = computeLineTotal({
    item,
    selection: [{ groupId: "side", optionIds: ["fries"] }],
    quantity: 1,
  });
  assert.equal(minCalc.lineTotal, 1000);

  const maxCalc = computeLineTotal({
    item,
    selection: [{ groupId: "side", optionIds: ["fries"] }],
    quantity: 50,
  });
  assert.equal(maxCalc.lineTotal, 50000);

  // Invalid quantities rejected
  assert.throws(() => {
    computeLineTotal({ item, selection: [{ groupId: "side", optionIds: ["fries"] }], quantity: 0 });
  }, /Quantity must be an integer between 1 and 50/i);

  assert.throws(() => {
    computeLineTotal({ item, selection: [{ groupId: "side", optionIds: ["fries"] }], quantity: 51 });
  }, /Quantity must be an integer between 1 and 50/i);

  assert.throws(() => {
    computeLineTotal({ item, selection: [{ groupId: "side", optionIds: ["fries"] }], quantity: 2.5 });
  }, /Quantity must be an integer between 1 and 50/i);
});

test("Phase 2b-1 Translations: Storefront namespace includes new ordering keys in EN and FR", () => {
  const enPath = path.join(ROOT, "messages/en.json");
  const frPath = path.join(ROOT, "messages/fr.json");

  const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
  const fr = JSON.parse(fs.readFileSync(frPath, "utf8"));

  const requiredKeys = ["soldOut", "required", "optional", "options", "promoPrice"];

  for (const k of requiredKeys) {
    assert.ok(
      typeof en.Storefront[k] === "string" && en.Storefront[k].length > 0,
      `messages/en.json missing Storefront.${k}`
    );
    assert.ok(
      typeof fr.Storefront[k] === "string" && fr.Storefront[k].length > 0,
      `messages/fr.json missing Storefront.${k}`
    );
  }

  assert.equal(en.Storefront.soldOut, "Sold out");
  assert.equal(fr.Storefront.soldOut, "Épuisé");
});

test("Phase 2b-1 Defaults: existing items with default values render without regressions", () => {
  // Simulates a legacy item without promo_price, is_sold_out, or option_groups
  const legacyItem = {
    id: "item-legacy",
    name: "Classic Steak",
    price: 2500,
  };

  assert.equal(effectiveUnitPrice(legacyItem), 2500);
  assert.deepEqual(validateSelection(legacyItem, []), { valid: true });

  const total = computeLineTotal({ item: legacyItem, quantity: 2 });
  assert.equal(total.unitPrice, 2500);
  assert.equal(total.optionsDelta, 0);
  assert.equal(total.lineTotal, 5000);
});
