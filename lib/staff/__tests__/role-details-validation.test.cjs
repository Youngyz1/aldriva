/**
 * lib/staff/__tests__/role-details-validation.test.cjs
 *
 * Pure unit tests for validateRoleDetails: no I/O, no DB. Confirms the
 * whitelist (licence_class, licence_expiry, issuing_country, notes), the
 * length limits, the date-format check, and that no licence-number field
 * is ever accepted (there is no such field in the whitelist at all).
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

const { validateRoleDetails } = require("@/lib/staff/role-details-validation.ts");

describe("validateRoleDetails", () => {
  test("accepts a full valid payload with all 4 whitelisted fields", () => {
    const result = validateRoleDetails({
      licence_class: "C1",
      licence_expiry: "2027-06-30",
      issuing_country: "Nigeria",
      notes: "Renews annually",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, {
      licence_class: "C1",
      licence_expiry: "2027-06-30",
      issuing_country: "Nigeria",
      notes: "Renews annually",
    });
  });

  test("null or undefined input is valid and clears all fields", () => {
    assert.deepEqual(validateRoleDetails(null), { ok: true, value: {} });
    assert.deepEqual(validateRoleDetails(undefined), { ok: true, value: {} });
  });

  test("an empty object is valid", () => {
    assert.deepEqual(validateRoleDetails({}), { ok: true, value: {} });
  });

  test("rejects an unknown key", () => {
    const result = validateRoleDetails({ licence_number: "ABC123" });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "role_details_unknown_key");
  });

  test("licence_number is never accepted, even alongside valid fields", () => {
    const result = validateRoleDetails({ licence_class: "C1", licence_number: "ABC123" });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "role_details_unknown_key");
  });

  test("rejects licence_class longer than 20 characters", () => {
    const result = validateRoleDetails({ licence_class: "X".repeat(21) });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "role_details_licence_class_length");
  });

  test("accepts licence_class at exactly 20 characters", () => {
    const result = validateRoleDetails({ licence_class: "X".repeat(20) });
    assert.equal(result.ok, true);
  });

  test("rejects a malformed licence_expiry date", () => {
    for (const bad of ["30-06-2027", "2027/06/30", "not-a-date", "2027-6-3"]) {
      const result = validateRoleDetails({ licence_expiry: bad });
      assert.equal(result.ok, false, `expected rejection for ${bad}`);
      assert.equal(result.error.code, "role_details_licence_expiry_format");
    }
  });

  test("accepts a well-formed licence_expiry date", () => {
    const result = validateRoleDetails({ licence_expiry: "2027-06-30" });
    assert.equal(result.ok, true);
  });

  test("rejects issuing_country longer than 60 characters", () => {
    const result = validateRoleDetails({ issuing_country: "X".repeat(61) });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "role_details_issuing_country_length");
  });

  test("rejects notes longer than 200 characters", () => {
    const result = validateRoleDetails({ notes: "X".repeat(201) });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "role_details_notes_length");
  });

  test("accepts notes at exactly 200 characters", () => {
    const result = validateRoleDetails({ notes: "X".repeat(200) });
    assert.equal(result.ok, true);
  });

  test("rejects a non-object payload", () => {
    for (const bad of ["a string", 42, true, ["array"]]) {
      const result = validateRoleDetails(bad);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "role_details_invalid");
    }
  });

  test("trims whitespace and drops a field that becomes empty after trimming", () => {
    const result = validateRoleDetails({ notes: "   " });
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, {});
  });
});
