/**
 * lib/__tests__/general-booking-form-registration.test.cjs
 *
 * Asserts that general_booking_form is registered everywhere reservation_form is,
 * so the block is addable manually by an owner through the block picker.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
  const output = ts.transpileModule(raw, {
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
    request = path.join(ROOT, request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// ── Source reads (no Next.js module resolution needed) ──────────────────────

const blocksSrc = fs.readFileSync(path.join(ROOT, "lib/website-blocks.ts"), "utf8");
const featuresSrc = fs.readFileSync(path.join(ROOT, "lib/storefront-features.ts"), "utf8");
const schemaSrc = fs.readFileSync(path.join(ROOT, "lib/website-block-edit-schema.ts"), "utf8");
const rendererSrc = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
const enMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
const frMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));

// ── Imports for runtime checks ──────────────────────────────────────────────

const { KNOWN_BLOCK_TYPES, validateBlock, parseBlock } = require("../website-blocks.ts");
const { BLOCK_CATALOG } = require("../../components/dashboard/website/builder/defaultBlocks");

// ── Tests ───────────────────────────────────────────────────────────────────

test("general_booking_form is in KNOWN_BLOCK_TYPES", () => {
  assert.ok(KNOWN_BLOCK_TYPES.includes("general_booking_form"),
    "general_booking_form must be in KNOWN_BLOCK_TYPES");
});

test("general_booking_form is in BLOCK_CATALOG (picker entry)", () => {
  const item = BLOCK_CATALOG.find((c) => c.type === "general_booking_form");
  assert.ok(item, "BLOCK_CATALOG must contain general_booking_form");
  assert.ok(item.label, "general_booking_form catalog item must have a label");
  assert.ok(item.iconName, "general_booking_form catalog item must have an iconName");
  assert.ok(item.createDefault, "general_booking_form catalog item must have a createDefault factory");
  const def = item.createDefault();
  assert.equal(def.type, "general_booking_form");
});

test("general_booking_form validateBlock succeeds", () => {
  const res = validateBlock({ type: "general_booking_form" });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.type, "general_booking_form");
});

test("general_booking_form parseBlock returns correct type", () => {
  const parsed = parseBlock({ type: "general_booking_form" });
  assert.strictEqual(parsed.type, "general_booking_form");
});

test("general_booking_form has a validation case in website-blocks.ts", () => {
  assert.ok(blocksSrc.includes('case "general_booking_form":'),
    "website-blocks.ts must have a general_booking_form validation case");
  assert.ok(blocksSrc.includes('"Validation failed for general_booking_form block."'),
    "website-blocks.ts must have a general_booking_form validation error message");
});

test("general_booking_form has a parse case in website-blocks.ts", () => {
  const parseStart = blocksSrc.indexOf("function parseBlock");
  const parseBody = blocksSrc.slice(parseStart);
  assert.ok(parseBody.includes('case "general_booking_form":'),
    "parseBlock must have a general_booking_form case");
});

test("general_booking_form is in website-block-edit-schema.ts", () => {
  assert.ok(schemaSrc.includes("general_booking_form: {}"),
    "website-block-edit-schema.ts must register general_booking_form");
});

test("general_booking_form has a render case in BlockRenderer.tsx", () => {
  assert.ok(rendererSrc.includes('case "general_booking_form":'),
    "BlockRenderer.tsx must have a general_booking_form render case");
  assert.ok(rendererSrc.includes("GeneralBookingFormBlockRenderer"),
    "BlockRenderer.tsx must render GeneralBookingFormBlockRenderer for general_booking_form");
});

test("general_booking_form is in storefront-features.ts reservations array", () => {
  assert.ok(featuresSrc.includes('"general_booking_form"'),
    "storefront-features.ts must include general_booking_form in reservations feature array");
});

test("general_booking_form has EN i18n label", () => {
  assert.ok(enMessages.Storefront.generalBookingBlockLabel,
    "messages/en.json Storefront must have generalBookingBlockLabel");
  assert.equal(typeof enMessages.Storefront.generalBookingBlockLabel, "string");
});

test("general_booking_form has FR i18n label", () => {
  assert.ok(frMessages.Storefront.generalBookingBlockLabel,
    "messages/fr.json Storefront must have generalBookingBlockLabel");
  assert.equal(typeof frMessages.Storefront.generalBookingBlockLabel, "string");
});

test("general_booking_form is registered everywhere reservation_form is (source-level)", () => {
  const reservationRegistrations = [
    blocksSrc.includes('case "reservation_form":') && blocksSrc.includes('case "general_booking_form":'),
    rendererSrc.includes('case "reservation_form":') && rendererSrc.includes('case "general_booking_form":'),
    schemaSrc.includes("reservation_form: {}") && schemaSrc.includes("general_booking_form: {}"),
    featuresSrc.includes('"reservation_form"') && featuresSrc.includes('"general_booking_form"'),
  ];
  assert.ok(reservationRegistrations.every(Boolean),
    "general_booking_form must be registered everywhere reservation_form is");
});
