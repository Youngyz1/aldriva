/**
 * lib/inventory/__tests__/errors.test.cjs
 *
 * Pure unit tests for mapInventoryError: no I/O, no network, no DB. Checks
 * every machine-readable hint raised by migration 268, the constraint-name
 * fallbacks, the SQLSTATE fallbacks, and that raw database text never leaks
 * into the returned message.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
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

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { mapInventoryError, INVENTORY_NOT_FOUND_OR_DENIED } = require("@/lib/inventory/errors.ts");

describe("hints raised by migration 268", () => {
  const cases = [
    ["inventory_forbidden", "42501", "not_allowed"],
    ["inventory_insufficient_stock", "23514", "insufficient_stock"],
    ["inventory_bad_quantity", "23514", "bad_quantity"],
    ["inventory_bad_sign", "23514", "bad_sign"],
    ["inventory_bad_type", "23514", "bad_type"],
    ["inventory_location_archived", "23514", "location_archived"],
    ["inventory_item_not_found", "23514", "item_not_found"],
    ["inventory_item_inactive", "23514", "item_inactive"],
    ["inventory_default_location_conflict", "23514", "default_location_conflict"],
    ["inventory_immutable_owner", "23514", "generic_error"],
  ];
  for (const [hint, sqlstate, expected] of cases) {
    test(`${hint} maps to ${expected}`, () => {
      const r = mapInventoryError({ code: sqlstate, message: "raw database text", hint });
      assert.equal(r.code, expected);
      assert.ok(r.message.length > 0);
      assert.ok(!r.message.includes("raw database text"));
    });
  }

  test("a hint wins over the SQLSTATE fallback", () => {
    const r = mapInventoryError({ code: "23514", message: "x", hint: "inventory_insufficient_stock" });
    assert.equal(r.code, "insufficient_stock");
  });

  test("a hint with surrounding whitespace still matches", () => {
    const r = mapInventoryError({ code: "42501", message: "x", hint: "  inventory_forbidden  " });
    assert.equal(r.code, "not_allowed");
  });
});

describe("unique constraints (23505)", () => {
  test("duplicate SKU", () => {
    const r = mapInventoryError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "inventory_items_business_sku_uidx"',
    });
    assert.equal(r.code, "sku_exists");
  });
  test("duplicate location name", () => {
    const r = mapInventoryError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "inventory_locations_business_name_uidx"',
    });
    assert.equal(r.code, "location_name_exists");
  });
  test("second default location", () => {
    const r = mapInventoryError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "inventory_locations_one_default_uidx"',
    });
    assert.equal(r.code, "default_location_exists");
  });
  test("an unknown unique constraint falls back to generic_error", () => {
    const r = mapInventoryError({ code: "23505", message: 'duplicate key value violates unique constraint "something_else"' });
    assert.equal(r.code, "generic_error");
  });
});

describe("SQLSTATE fallbacks", () => {
  test("23514 check violation", () => {
    assert.equal(mapInventoryError({ code: "23514", message: "check constraint" }).code, "invalid_input");
  });
  test("23503 foreign key violation", () => {
    assert.equal(mapInventoryError({ code: "23503", message: "fk" }).code, "branch_mismatch");
  });
  test("42501 plain RLS violation", () => {
    const r = mapInventoryError({ code: "42501", message: 'new row violates row-level security policy for table "inventory_items"' });
    assert.equal(r.code, "not_allowed");
    assert.ok(!r.message.includes("row-level security"));
  });
  test("unknown errors and empty errors are generic", () => {
    assert.equal(mapInventoryError({ code: "XX000", message: "boom" }).code, "generic_error");
    assert.equal(mapInventoryError({}).code, "generic_error");
    assert.equal(mapInventoryError({ code: null, message: null, hint: null }).code, "generic_error");
  });
});

describe("never leaks raw text", () => {
  test("no mapped message contains database wording", () => {
    const raws = [
      { code: "23505", message: 'duplicate key value violates unique constraint "inventory_items_business_sku_uidx"' },
      { code: "42501", message: "permission denied for table inventory_balances" },
      { code: "23514", message: "new row for relation violates check constraint" },
      { code: "XX000", message: "internal error" },
    ];
    for (const raw of raws) {
      const r = mapInventoryError(raw);
      assert.ok(!/violates|constraint|permission denied|relation|internal error/i.test(r.message), r.message);
    }
  });
  test("the not-found-or-denied constant has a stable code", () => {
    assert.equal(INVENTORY_NOT_FOUND_OR_DENIED.code, "not_found_or_denied");
  });
});