const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { safeRedirectPath } = require(path.resolve(__dirname, "../safe-redirect.ts"));

describe("safeRedirectPath", () => {
  test("accepts same-origin relative paths, including query strings", () => {
    assert.equal(safeRedirectPath("/dashboard", "/"), "/dashboard");
    assert.equal(safeRedirectPath("/staff/accept?token=abc-123", "/"), "/staff/accept?token=abc-123");
  });
  test("rejects absolute and protocol-relative URLs", () => {
    assert.equal(safeRedirectPath("https://evil.example/x", "/"), "/");
    assert.equal(safeRedirectPath("http://evil.example", "/"), "/");
    assert.equal(safeRedirectPath("//evil.example", "/"), "/");
    assert.equal(safeRedirectPath("javascript:alert(1)", "/"), "/");
  });
  test("rejects backslash and control-character tricks", () => {
    assert.equal(safeRedirectPath("/\\evil.example", "/"), "/");
    assert.equal(safeRedirectPath("/ok\nHeader: x", "/"), "/");
  });
  test("null, undefined, empty, non-string and oversized fall back", () => {
    assert.equal(safeRedirectPath(null, "/d"), "/d");
    assert.equal(safeRedirectPath(undefined, "/d"), "/d");
    assert.equal(safeRedirectPath("", "/d"), "/d");
    assert.equal(safeRedirectPath("   ", "/d"), "/d");
    assert.equal(safeRedirectPath(42, "/d"), "/d");
    assert.equal(safeRedirectPath("/" + "a".repeat(2001), "/d"), "/d");
  });
  test("fallback is returned as given", () => {
    assert.equal(safeRedirectPath("nope", "/dashboard"), "/dashboard");
  });
});
