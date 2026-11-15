/**
 * lib/staff/__tests__/phone-validation.test.cjs
 *
 * Pure unit tests for validateStaffPhone: no I/O, no network, no DB.
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

const { validateStaffPhone } = require("@/lib/staff/phone-validation.ts");

describe("validateStaffPhone", () => {
  test("null, undefined, and empty string are valid (phone is optional)", () => {
    assert.equal(validateStaffPhone(null), null);
    assert.equal(validateStaffPhone(undefined), null);
    assert.equal(validateStaffPhone(""), null);
  });

  test("whitespace-only is valid (trims to empty)", () => {
    assert.equal(validateStaffPhone("   "), null);
  });

  test("a plain international number with spaces and a leading + is valid", () => {
    assert.equal(validateStaffPhone("+1 555 123 4567"), null);
  });

  test("a number with dashes and parentheses is valid", () => {
    assert.equal(validateStaffPhone("(555) 123-4567"), null);
  });

  test("rejects +23481023587y -- a trailing letter is not digits/space/+/-/() -- code phone_invalid", () => {
    const result = validateStaffPhone("+23481023587y");
    assert.equal(result.code, "phone_invalid");
    assert.equal(result.message, "Phone can only contain digits, spaces, +, - and ( ).");
  });

  test("rejects letters anywhere in the number", () => {
    const result = validateStaffPhone("555-CALL-NOW");
    assert.equal(result.code, "phone_invalid");
    assert.equal(result.message, "Phone can only contain digits, spaces, +, - and ( ).");
  });

  test("rejects periods, which are not in the allowed character set", () => {
    const result = validateStaffPhone("555.123.4567");
    assert.equal(result.code, "phone_invalid");
  });

  test("rejects fewer than 7 digits -- same code, different message", () => {
    const result = validateStaffPhone("123456");
    assert.equal(result.code, "phone_invalid");
    assert.equal(result.message, "Phone must have 7 to 20 digits.");
  });

  test("accepts exactly 7 digits (lower boundary)", () => {
    assert.equal(validateStaffPhone("1234567"), null);
  });

  test("accepts exactly 20 digits (upper boundary)", () => {
    assert.equal(validateStaffPhone("12345678901234567890"), null);
  });

  test("rejects 21 digits (over the upper boundary)", () => {
    const result = validateStaffPhone("123456789012345678901");
    assert.equal(result.code, "phone_invalid");
    assert.equal(result.message, "Phone must have 7 to 20 digits.");
  });

  test("digit count ignores allowed punctuation -- only digits are counted", () => {
    // 6 digits plus a leading + and spaces: still only 6 digits, rejected.
    const result = validateStaffPhone("+1 23 45 6");
    assert.equal(result.code, "phone_invalid");
  });

  test("leading/trailing whitespace is trimmed before validation", () => {
    assert.equal(validateStaffPhone("  +1 555 123 4567  "), null);
  });

  test("both failure shapes (bad chars, bad length) share the single phone_invalid code", () => {
    const badChars = validateStaffPhone("555-CALL-NOW");
    const badLength = validateStaffPhone("123456");
    assert.equal(badChars.code, "phone_invalid");
    assert.equal(badLength.code, "phone_invalid");
    assert.notEqual(badChars.message, badLength.message);
  });
});
