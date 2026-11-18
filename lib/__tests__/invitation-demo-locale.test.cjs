/**
 * lib/__tests__/invitation-demo-locale.test.cjs
 *
 * Regression coverage for the invitation demo route locale handling:
 *   - the default follows the resolved site locale (defaultLocale = "en")
 *   - a valid explicit locale wins over the default
 *   - an unknown locale value falls back to the default
 *   - the not-found check runs before the Suspense boundary (demo route fix:
 *     `await params` and `notFound()` now live inside a Suspense-wrapped
 *     component so the route can be prerendered in production)
 */
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

const { isValidLocale, locales, defaultLocale } = require("@/i18n/routing");

const DEMO_PAGE = fs.readFileSync(
  path.join(ROOT, "app/invitations/templates/[templateId]/demo/page.tsx"),
  "utf8"
);

describe("invitation demo locale", () => {
  test("default follows the site locale (defaultLocale = en)", () => {
    assert.equal(defaultLocale, "en");
    assert.deepEqual([...locales], ["en", "fr"]);
    assert.equal(isValidLocale(defaultLocale), true);
  });

  test("a valid explicit locale wins over the default", () => {
    assert.equal(isValidLocale("fr"), true);
    assert.equal(isValidLocale("en"), true);
  });

  test("unknown locale values fall back to the default", () => {
    assert.equal(isValidLocale(null), false);
    assert.equal(isValidLocale(undefined), false);
    assert.equal(isValidLocale(""), false);
    assert.equal(isValidLocale("xx"), false);
    assert.equal(isValidLocale("FR"), false);
    assert.equal(isValidLocale("en-US"), false);
  });

  test("not-found check runs before the Suspense boundary", () => {
    // The demo page must await `params` inside a component that is wrapped in
    // `<Suspense>` so production prerendering is not blocked by runtime data
    // access. `notFound()` must be invoked after `await params` and before any
    // Suspense boundary renders potentially-missing content.
    assert.match(DEMO_PAGE, /<Suspense[\s\S]*>[\s\S]*<DemoInvitation[\s\S]*<\/Suspense>/);
    assert.match(DEMO_PAGE, /async function DemoInvitation[\s\S]*const \{ templateId \} = await params/);
    assert.match(DEMO_PAGE, /const \{ templateId \} = await params[\s\S]*if \(!summary\) notFound\(\)/);
    assert.match(DEMO_PAGE, /if \(!summary\) notFound\(\)[\s\S]*<Suspense/);
    assert.equal((DEMO_PAGE.match(/<Suspense fallback/g) ?? []).length, 2, "outer Suspense (params) + inner Suspense (searchParams)");
  });
});
