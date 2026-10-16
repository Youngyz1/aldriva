const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
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
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { canEditWebsiteTemplate, TEMPLATE_EDIT_ROLES } = require("../website-template-switch.ts");
const { ENTITY_ROLES_CONTENT_WRITE } = require("../entity-auth.ts");
const {
  BUILDER_FEATURE_OFFERING_KEYS,
  getBuilderFeatureOfferings,
  validateBusinessOfferings,
} = require("../business-offerings.ts");
const {
  STOREFRONT_STATUS_REASONS,
  isFulfilmentMissing,
  resolveStorefrontFeatures,
} = require("../storefront-features.ts");
const { getCapabilitiesForBusinessType } = require("../business-taxonomy.ts");

const editorSource = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/V2WebsiteEditor.tsx"), "utf8");
const dialogSource = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/TemplateSwitchDialog.tsx"), "utf8");
const switchActionSource = fs.readFileSync(path.join(ROOT, "lib/actions/website-template-switch.ts"), "utf8");
const panelSource = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/OrderingPaymentsPanel.tsx"), "utf8");
const enReasons = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8")).BusinessOfferings.reasons;
const frReasons = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8")).BusinessOfferings.reasons;

test("one shared edit predicate: owner/manager/editor allowed, viewer denied, superadmin allowed", () => {
  assert.deepEqual([...TEMPLATE_EDIT_ROLES].sort(), [...ENTITY_ROLES_CONTENT_WRITE].sort());
  for (const role of ["owner", "admin", "manager", "editor"]) {
    assert.equal(canEditWebsiteTemplate(role), true, role);
  }
  for (const role of ["viewer", "finance", "", undefined]) {
    assert.equal(canEditWebsiteTemplate(role), false, String(role));
  }
  assert.equal(canEditWebsiteTemplate(null), true, "null role is the platform superadmin");
});

test("editor, dialog, and server action all use the shared predicate", () => {
  assert.match(editorSource, /canEditWebsiteTemplate\(initialState\.userRole\)/);
  assert.match(dialogSource, /title=\{publicT\("templateSwitchNoEdit"\)\}/);
  assert.match(switchActionSource, /canEditWebsiteTemplate\(access\.role\)/);
  assert.match(switchActionSource, /isAdmin\(\)/);
});

test("builder panel lists the same five offerings for every business type", () => {
  assert.deepEqual([...BUILDER_FEATURE_OFFERING_KEYS], [
    "online_ordering",
    "pickup",
    "delivery",
    "online_payment",
    "table_reservations",
  ]);
  assert.deepEqual(
    getBuilderFeatureOfferings().map((offering) => offering.key),
    [...BUILDER_FEATURE_OFFERING_KEYS]
  );
  assert.match(panelSource, /getBuilderFeatureOfferings\(\)/);
  assert.doesNotMatch(panelSource, /getBusinessOfferings\(business\.businessType/);
  assert.match(panelSource, /getReasonLabel\(statusDetail\.reason\)/);
});

test("ticking a missing-capability offering stores the choice but stays off publicly", () => {
  const rentalCaps = getCapabilitiesForBusinessType("Car Rental");
  assert.ok(!rentalCaps.includes("PICKUP"), "rental genuinely lacks PICKUP");
  const validated = validateBusinessOfferings(["online_ordering", "pickup"], "Car Rental", "Vehicle Rental");
  assert.equal(validated.valid, true, "owner choice must save");
  assert.deepEqual(validated.offerings, ["online_ordering", "pickup"]);
  const resolution = resolveStorefrontFeatures({
    capabilities: rentalCaps,
    offerings: ["online_ordering", "pickup"],
    built: { ordering: true, delivery: true, pickup: true, reservations: true, onlinePayment: true },
    currency: "XOF",
  });
  assert.equal(resolution.pickup, false, "public pickup gate stays closed");
  assert.equal(resolution.status.pickup.status, "needs_setup");
  assert.equal(resolution.status.pickup.reason, "missing_capability");
});

test("validation still rejects unknown, duplicate, over-limit, and malformed keys", () => {
  assert.equal(validateBusinessOfferings(["nope_not_real"], "Car Rental", "Vehicle Rental").valid, false);
  assert.equal(validateBusinessOfferings(["pickup", "pickup"], "Car Rental", "Vehicle Rental").valid, false);
  assert.equal(validateBusinessOfferings(new Array(21).fill("pickup"), "Car Rental", "Vehicle Rental").valid, false);
  assert.equal(validateBusinessOfferings(["Bad Key!"], "Car Rental", "Vehicle Rental").valid, false);
  assert.equal(validateBusinessOfferings(["table_reservations"], "Fast Food / Quick Service", "Restaurant").valid, true);
});

test("ticking pickup from the panel clears the fulfilment warning", () => {
  assert.equal(isFulfilmentMissing(["online_ordering"]), true);
  assert.equal(isFulfilmentMissing(["online_ordering", "pickup"]), false);
  assert.equal(isFulfilmentMissing(["online_ordering", "delivery"]), false);
});

test("no reason rendered by the panel is a raw key, in EN or FR", () => {
  for (const key of Object.keys(STOREFRONT_STATUS_REASONS)) {
    assert.equal(typeof enReasons[key], "string", `en reasons.${key}`);
    assert.equal(typeof frReasons[key], "string", `fr reasons.${key}`);
    assert.ok(enReasons[key].length > 0 && !enReasons[key].includes(key), `en reasons.${key} translated`);
    assert.ok(frReasons[key].length > 0 && !frReasons[key].includes(key), `fr reasons.${key} translated`);
    assert.notEqual(frReasons[key], enReasons[key], `fr reasons.${key} differs`);
  }
});
