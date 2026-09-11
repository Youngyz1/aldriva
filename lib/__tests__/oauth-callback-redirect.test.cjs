/**
 * P2 F-06 regression tests: OAuth callback `next` must resolve same-origin.
 *
 * Previous exposure: `next.startsWith("/")` passed protocol-relative
 * (`//evil.com`) and backslash (`/\evil.com`) targets, enabling a phishing
 * redirect after a real login. resolveSafeNextPath() rejects anything that
 * does not parse to the request's own origin and returns only path+query+
 * fragment, falling back to "/" — absolute URLs were never accepted here
 * and still are not.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const ts = require("typescript");

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

const { resolveSafeNextPath } = require("../safe-redirect.ts");

const ORIGIN = "https://site.com";

test("rejects protocol-relative redirect targets", () => {
  assert.equal(resolveSafeNextPath("//evil.com", ORIGIN), "/");
  assert.equal(resolveSafeNextPath("//evil.com/login", ORIGIN), "/");
});

test("rejects backslash variants", () => {
  assert.equal(resolveSafeNextPath("/\\evil.com", ORIGIN), "/");
  assert.equal(resolveSafeNextPath("/\\/evil.com", ORIGIN), "/");
});

test("rejects absolute URLs, including same-origin ones (never accepted)", () => {
  assert.equal(resolveSafeNextPath("https://evil.com/x", ORIGIN), "/");
  assert.equal(resolveSafeNextPath("https://site.com/dashboard", ORIGIN), "/");
  assert.equal(resolveSafeNextPath("javascript:alert(1)", ORIGIN), "/");
});

test("rejects missing/empty targets", () => {
  assert.equal(resolveSafeNextPath(null, ORIGIN), "/");
  assert.equal(resolveSafeNextPath("", ORIGIN), "/");
});

test("allows normal relative paths with query and fragment intact", () => {
  assert.equal(resolveSafeNextPath("/dashboard", ORIGIN), "/dashboard");
  assert.equal(resolveSafeNextPath("/events/my-event", ORIGIN), "/events/my-event");
  assert.equal(resolveSafeNextPath("/search?q=a&tab=e#top", ORIGIN), "/search?q=a&tab=e#top");
});
