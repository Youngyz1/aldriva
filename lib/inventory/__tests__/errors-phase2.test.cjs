const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { mapInventoryError } = require(path.resolve(__dirname, "../errors.ts"));

test("inventory_default_location_archive maps to default_location_archive", () => {
  assert.equal(mapInventoryError({ code: "23514", hint: "inventory_default_location_archive" }).code, "default_location_archive");
});
test("inventory_location_has_stock maps to location_has_stock", () => {
  assert.equal(mapInventoryError({ code: "23514", hint: "inventory_location_has_stock" }).code, "location_has_stock");
});
test("inventory_transfer_same_location maps to transfer_same_location", () => {
  assert.equal(mapInventoryError({ code: "23514", hint: "inventory_transfer_same_location" }).code, "transfer_same_location");
});
test("the new messages never contain database wording", () => {
  for (const hint of ["inventory_default_location_archive", "inventory_location_has_stock", "inventory_transfer_same_location"]) {
    const m = mapInventoryError({ code: "23514", hint, message: "violates check constraint foo" }).message;
    assert.ok(!/constraint|violates|sql/i.test(m), m);
  }
});