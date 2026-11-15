/**
 * components/ui/__tests__/local-branded-placeholder.test.cjs
 *
 * Pure unit tests for getInitials: no I/O, no DOM, no DB. This is the
 * fallback logic StaffAvatar (components/staff/StaffAvatar.tsx) renders via
 * LocalBrandedPlaceholder variant="avatar" whenever a staff member has no
 * photo_url, or their photo_url fails to load. The component itself isn't
 * rendered here -- this repo has no DOM/JSX test renderer -- but the exact
 * text it would show is this pure function's return value.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;

function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
}
require.extensions[".ts"] = compileTs;
require.extensions[".tsx"] = compileTs;

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { getInitials } = require("@/components/ui/LocalBrandedPlaceholder.tsx");

describe("getInitials (staff avatar photo-fallback text)", () => {
  test("two-word name returns both first letters, uppercased", () => {
    assert.equal(getInitials("ada lovelace"), "AL");
  });

  test("single-word name returns just its first letter", () => {
    assert.equal(getInitials("Madonna"), "M");
  });

  test("empty/null/undefined name returns empty string (icon fallback renders instead)", () => {
    assert.equal(getInitials(""), "");
    assert.equal(getInitials(null), "");
    assert.equal(getInitials(undefined), "");
  });

  test("whitespace-only name returns empty string, not a crash", () => {
    assert.equal(getInitials("   "), "");
  });

  test("extra internal whitespace between name parts is ignored", () => {
    assert.equal(getInitials("Grace   Hopper"), "GH");
  });

  test("three or more words only uses the first two", () => {
    assert.equal(getInitials("Mary Jane Watson"), "MJ");
  });
});
