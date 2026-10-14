const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

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

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  BUSINESS_OFFERINGS_BY_TYPE,
  BUSINESS_OFFERINGS_BY_CATEGORY,
  GENERIC_BUSINESS_OFFERINGS,
  MAX_BUSINESS_OFFERINGS,
  getBusinessOfferings,
  getDefaultBusinessOfferings,
  validateBusinessOfferings,
} = require("@/lib/business-offerings");
const { getCapabilitiesForBusinessType } = require("@/lib/business-taxonomy");
const { resolveStorefrontFeatures, getBuiltStorefrontFeatures, getBuiltStorefrontFeaturesFromTemplates } = require("@/lib/storefront-features");
const { FLAGSHIP_TEMPLATES, RESTAURANT_TABLE_FLAME, RENTAL_DRIVELINE } = require("@/lib/website-template-v2");
const { resolveWebsiteCategoryForOrganizer } = require("@/lib/website-category");
const { getModulesForBusiness } = require("@/lib/business-dashboard-modules");

test("offering catalogs use stable unique keys and translated labels in EN and FR", () => {
  const catalogs = [
    ...Object.values(BUSINESS_OFFERINGS_BY_TYPE),
    ...Object.values(BUSINESS_OFFERINGS_BY_CATEGORY),
    GENERIC_BUSINESS_OFFERINGS,
  ];
  const en = require(path.join(ROOT, "messages/en.json")).BusinessOfferings.labels;
  const fr = require(path.join(ROOT, "messages/fr.json")).BusinessOfferings.labels;
  for (const catalog of catalogs) {
    const keys = catalog.map((offering) => offering.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const offering of catalog) {
      assert.match(offering.key, /^[a-z][a-z0-9_]{1,39}$/);
      assert.equal(offering.key, offering.labelKey);
      assert.equal(typeof en[offering.labelKey], "string");
      assert.equal(typeof fr[offering.labelKey], "string");
      assert.ok(["fact", "feature"].includes(offering.kind));
    }
  }
  assert.ok(!getBusinessOfferings("Fast Food / Quick Service", "Restaurant").some((item) => item.key === "table_reservations"));
  assert.ok(!getBusinessOfferings("Custom Business", "Other").some((item) => item.key === "catering"));
  assert.ok(!getBusinessOfferings("Custom Business", "Restaurant").some((item) => item.key === "table_reservations"));
  assert.ok(!getBusinessOfferings("Custom Business", "Restaurant").some((item) => item.key === "catering"));
  assert.ok(getBusinessOfferings("Custom Business", "Restaurant").some((item) => item.key === "online_ordering"));
  assert.ok(getBusinessOfferings("Unknown Type", "Unknown Category").some((item) => item.key === "online_ordering"));
  assert.equal(MAX_BUSINESS_OFFERINGS, 20);
});

test("creation defaults select supported feature choices but leave fact choices unchecked", () => {
  const fullService = getDefaultBusinessOfferings("Food & Beverage", "Restaurant", "Full-Service Restaurant");
  assert.deepEqual(fullService.sort(), ["delivery", "online_ordering", "online_payment", "pickup", "table_reservations"]);
  assert.ok(!fullService.includes("dine_in"));
  assert.ok(!getDefaultBusinessOfferings("Food & Beverage", "Restaurant", "Fast Food / Quick Service").includes("table_reservations"));
  assert.ok(!getDefaultBusinessOfferings("Other", "Other", "Custom Business").includes("online_ordering"));
  assert.ok(!getDefaultBusinessOfferings("Food & Beverage", "Restaurant", "Custom Business").includes("online_ordering"));
});

test("server offering validation rejects malformed, unknown, duplicate, and over-limit selections", () => {
  assert.equal(validateBusinessOfferings(["dine_in"], "Full-Service Restaurant", "Restaurant").valid, true);
  assert.match(validateBusinessOfferings(["made_up"], "Full-Service Restaurant", "Restaurant").error, /Unknown offering/);
  assert.match(validateBusinessOfferings(["table_reservations"], "Custom Business", "Restaurant").error, /Unknown offering/);
  assert.match(validateBusinessOfferings(["bad-key"], "Full-Service Restaurant", "Restaurant").error, /stable keys/);
  assert.match(validateBusinessOfferings(["dine_in", "dine_in"], "Full-Service Restaurant", "Restaurant").error, /Duplicate/);
  assert.match(validateBusinessOfferings(Array(MAX_BUSINESS_OFFERINGS + 1).fill("parking"), "Custom Business", "Other").error, /at most/);
});

test("capability, owner selection, and emitted implementation must all allow a storefront feature", () => {
  const allBuilt = { ordering: true, delivery: true, pickup: true, reservations: true, onlinePayment: true };
  const fullCaps = getCapabilitiesForBusinessType("Full-Service Restaurant");
  // Note: resolveStorefrontFeatures now returns extra status/reasons fields (Phase 4 addendum);
  // assert individual feature flags rather than whole-object equality.
  const fullResult = resolveStorefrontFeatures({
    capabilities: fullCaps,
    offerings: ["online_ordering", "delivery", "pickup", "table_reservations"],
    built: allBuilt,
  });
  assert.equal(fullResult.ordering, true, "full-service ordering live with online_ordering + pickup/delivery");
  assert.equal(fullResult.delivery, true);
  assert.equal(fullResult.pickup, true);
  assert.equal(fullResult.reservations, true);
  assert.equal(fullResult.onlinePayment, false, "online payment requires a supported currency");

  const fastFoodCaps = getCapabilitiesForBusinessType("Fast Food / Quick Service");
  const ffResult = resolveStorefrontFeatures({ capabilities: fastFoodCaps, offerings: ["online_ordering", "delivery", "pickup", "table_reservations"], built: allBuilt });
  assert.equal(ffResult.ordering, false, "fast food cannot do online ordering (no ONLINE_ORDERING cap)");
  assert.equal(ffResult.delivery, true);
  assert.equal(ffResult.pickup, false);
  assert.equal(ffResult.reservations, false);
  assert.equal(ffResult.onlinePayment, false);

  const fineDiningCaps = getCapabilitiesForBusinessType("Fine Dining");
  const fdResult = resolveStorefrontFeatures({ capabilities: fineDiningCaps, offerings: ["table_reservations"], built: allBuilt });
  assert.equal(fdResult.ordering, false);
  assert.equal(fdResult.delivery, false);
  assert.equal(fdResult.pickup, false);
  assert.equal(fdResult.reservations, true);
  assert.equal(fdResult.onlinePayment, false);

  const rentalCaps = getCapabilitiesForBusinessType("Car Rental");
  assert.equal(resolveStorefrontFeatures({ capabilities: rentalCaps, offerings: ["delivery_to_customer"], built: allBuilt }).delivery, true);

  const customResult = resolveStorefrontFeatures({ capabilities: getCapabilitiesForBusinessType("Custom Business"), offerings: ["online_ordering", "delivery", "pickup", "table_reservations"], built: allBuilt });
  assert.equal(customResult.ordering, false);
  assert.equal(customResult.delivery, false);
  assert.equal(customResult.pickup, false);
  assert.equal(customResult.reservations, false);
  assert.equal(customResult.onlinePayment, false);

  const emptyResult = resolveStorefrontFeatures({ capabilities: fullCaps, offerings: [], built: allBuilt });
  assert.equal(emptyResult.ordering, false);
  assert.equal(emptyResult.delivery, false);
  assert.equal(emptyResult.pickup, false);
  assert.equal(emptyResult.reservations, false);
  assert.equal(emptyResult.onlinePayment, false);
});

test("current flagship commerce readiness comes from real blocks, not pending manifest sections", () => {
  const built = getBuiltStorefrontFeaturesFromTemplates(FLAGSHIP_TEMPLATES);
  // Phase 2b-2: ordering, delivery and pickup are now built via menu_order in RESTAURANT_TABLE_FLAME
  assert.deepEqual(built, { ordering: true, delivery: true, pickup: true, reservations: false, onlinePayment: true });
  assert.deepEqual(getBuiltStorefrontFeatures({ sections: [{ block: "order_summary" }] }), {
    ordering: true, delivery: false, pickup: true, reservations: false, onlinePayment: true,
  });
  assert.deepEqual(getBuiltStorefrontFeatures({ sections: [{ pendingBlock: "order_summary" }] }), {
    ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false,
  });
  assert.ok(RESTAURANT_TABLE_FLAME.sections.some((section) => section.block === "menu_order"), "menu_order is built");
  assert.ok(RESTAURANT_TABLE_FLAME.sections.some((section) => section.pendingBlock === "order_summary"), "order_summary is pending");
  assert.ok(RENTAL_DRIVELINE.sections.some((section) => section.pendingBlock === "booking_bar"));
});

test("business category derives restaurant and rental website families deterministically", () => {
  assert.equal(resolveWebsiteCategoryForOrganizer("business", "Restaurant"), "restaurant");
  assert.equal(resolveWebsiteCategoryForOrganizer("business", "Vehicle Rental"), "retail");
  const route = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/website/new/page.tsx"), "utf8");
  const action = fs.readFileSync(path.join(ROOT, "lib/actions/website-v2.ts"), "utf8");
  for (const source of [route, action]) {
    assert.match(source, /\.order\("created_at",\s*\{\s*ascending:\s*true\s*\}\)/);
    assert.match(source, /resolveWebsiteCategoryForOrganizer/);
  }
});

test("business dashboard never shows the unbuilt Reservations route", () => {
  const modules = getModulesForBusiness("Food & Beverage", "Restaurant", "Full-Service Restaurant", ["table_reservations"]);
  assert.ok(!modules.some((module) => module.key === "reservations"));
});

test("business dashboard never shows the stub Orders route (same as Reservations)", () => {
  const modules = getModulesForBusiness("Food & Beverage", "Restaurant", "Full-Service Restaurant", ["online_ordering"]);
  assert.ok(!modules.some((module) => module.key === "orders"), "business Orders stays hidden until a real route ships");
});

test("Table & Flame menu.order-buttons is a real block; unticked sites resolve unchanged", () => {
  const section = RESTAURANT_TABLE_FLAME.sections.find((s) => s.id === "menu.order-buttons");
  assert.ok(section, "menu.order-buttons section must exist");
  assert.equal(section.block, "menu_order", "menu.order-buttons carries the real menu_order block");
  assert.ok(!section.pendingBlock, "menu.order-buttons must not be a pendingBlock");
  const { resolveTemplateContent } = require("@/lib/website-template-resolver");
  const withOrdering = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    business: { industry: "", category: "Restaurant", businessType: "Full-Service Restaurant", offerings: ["online_ordering", "pickup"] },
  });
  const homeWith = withOrdering.pages.find((p) => p.purpose === "home");
  assert.ok(homeWith.blocks.some((b) => b.type === "menu_order"), "ordering site emits menu_order");
  const withoutOrdering = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    business: { industry: "", category: "Restaurant", businessType: "Full-Service Restaurant", offerings: [] },
  });
  const homeWithout = withoutOrdering.pages.find((p) => p.purpose === "home");
  assert.ok(!homeWithout.blocks.some((b) => b.type === "menu_order"), "unticked site omits menu_order and is otherwise unchanged");
});

test("CI business without metadata currency prices and stores orders in XOF", () => {
  const { resolveStorefrontCurrency } = require("@/lib/website-v2-theme");
  assert.equal(resolveStorefrontCurrency({}, "Cote d'Ivoire"), "XOF");
  assert.equal(resolveStorefrontCurrency({}, null), "USD");
});

test("business RLS remains row-scoped and migration is additive with bounded stable keys", () => {
  const migration = fs.readFileSync(path.join(ROOT, "db/migration_169_business_offerings.sql"), "utf8");
  const base = fs.readFileSync(path.join(ROOT, "db/migration_36_business_listings.sql"), "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS offerings text\[\] NOT NULL DEFAULT '\{\}'::text\[\]/i);
  assert.match(migration, /cardinality\(offerings\) <= 20/i);
  assert.match(migration, /array_to_string\(offerings, ','\).*\[a-z0-9_\]/is);
  assert.doesNotMatch(migration, /CREATE\s+POLICY|ENABLE\s+ROW\s+LEVEL/i);
  assert.match(base, /CREATE POLICY "Owners can update their own businesses"[\s\S]+?WITH CHECK \(auth\.uid\(\) = owner_id\)/i);
});
