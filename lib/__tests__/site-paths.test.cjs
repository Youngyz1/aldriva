/**
 * lib/__tests__/site-paths.test.cjs
 *
 * resolveServiceDetailBookHref: the service detail page's Book button
 * end-to-end wiring (2A built the caller, 2B fixed the primary-action bug
 * that made the /book branch unreachable). No DB.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
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

const { resolveServiceDetailBookHref, getSiteSegmentsHref } = require(
  path.join(ROOT, "lib/site-paths.ts")
);

test("resolveServiceDetailBookHref: appends ?service=<id> when the primary action targets /book", () => {
  const href = resolveServiceDetailBookHref("fresh-home-demo", "svc-123", {
    href: getSiteSegmentsHref("fresh-home-demo", ["book"]),
  });
  assert.equal(href, "/site/fresh-home-demo/book?service=svc-123");
});

test("resolveServiceDetailBookHref: passes through unchanged when the primary action is Contact (bug still live before Phase 1)", () => {
  const href = resolveServiceDetailBookHref("fresh-home-demo", "svc-123", {
    href: "/site/fresh-home-demo/contact",
  });
  assert.equal(href, "/site/fresh-home-demo/contact");
});

test("resolveServiceDetailBookHref: encodes the service id", () => {
  const href = resolveServiceDetailBookHref("fresh-home-demo", "svc/needs encoding", {
    href: getSiteSegmentsHref("fresh-home-demo", ["book"]),
  });
  assert.equal(href, "/site/fresh-home-demo/book?service=svc%2Fneeds%20encoding");
});

test("resolveServiceDetailBookHref: no primary action resolves to null", () => {
  const href = resolveServiceDetailBookHref("fresh-home-demo", "svc-123", undefined);
  assert.equal(href, null);
});
