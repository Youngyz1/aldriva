/**
 * Regression tests for the shared buyer/donor entitlement predicate used by
 * the H2 (send-ticket) and H3 (crypto/status) authorization fixes.
 *
 * Rule under test: only a non-empty, case-insensitive email match counts as
 * proof. Two empty values must never match (fail closed).
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
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
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { normalizeEmail, isEmailEntitled } = require("@/lib/security/entitlement");

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Buyer@Example.COM "), "buyer@example.com");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(undefined), "");
  assert.equal(normalizeEmail(42), "");
});

test("exact and case-insensitive matches are entitled", () => {
  assert.equal(isEmailEntitled("buyer@example.com", "buyer@example.com"), true);
  assert.equal(isEmailEntitled("Buyer@Example.com", "buyer@example.com"), true);
  assert.equal(isEmailEntitled("buyer@example.com", "  BUYER@EXAMPLE.COM "), true);
});

test("mismatched emails are denied", () => {
  assert.equal(isEmailEntitled("buyer@example.com", "attacker@example.com"), false);
  assert.equal(isEmailEntitled("buyer@example.com", "buyer@example.com.evil.com"), false);
});

test("empty sides fail closed (never match)", () => {
  assert.equal(isEmailEntitled("", ""), false);
  assert.equal(isEmailEntitled("buyer@example.com", ""), false);
  assert.equal(isEmailEntitled("", "buyer@example.com"), false);
  assert.equal(isEmailEntitled(null, null), false);
  assert.equal(isEmailEntitled("buyer@example.com", null), false);
  assert.equal(isEmailEntitled(undefined, "   "), false);
});
