/**
 * lib/__tests__/invite-phone-validation.test.cjs
 *
 * F6 (Guest Scanner Fix Round): isValidInvitePhone is a pure function
 * (lib/staff/invite-phone-validation.ts), unit-tested directly.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");
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

const { isValidInvitePhone } = require("@/lib/staff/invite-phone-validation.ts");

test("valid E.164 numbers pass", () => {
  assert.equal(isValidInvitePhone("+2348012345678"), true);
  assert.equal(isValidInvitePhone("+15551234567"), true);
  assert.equal(isValidInvitePhone("  +2348012345678  "), true, "surrounding whitespace is trimmed");
});

test("local-format numbers (no country code, no +) fail - no auto-prefixing or default country is ever applied", () => {
  assert.equal(isValidInvitePhone("08012345678"), false);
  assert.equal(isValidInvitePhone("0803 123 4567"), false);
});

test("malformed numbers fail", () => {
  assert.equal(isValidInvitePhone("not-a-phone"), false);
  assert.equal(isValidInvitePhone("+0123456789"), false, "leading digit after + cannot be 0");
  assert.equal(isValidInvitePhone("+1"), false, "too short");
  assert.equal(isValidInvitePhone(""), false);
  assert.equal(isValidInvitePhone("+2348012345678 ext 2"), false, "trailing junk is rejected, not stripped");
});
