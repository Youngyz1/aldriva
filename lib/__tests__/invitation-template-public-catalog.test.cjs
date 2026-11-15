/**
 * lib/__tests__/invitation-template-public-catalog.test.cjs
 *
 * Invitation Marketplace Phase 1 — Foundation.
 * - Public-safe catalog helper exposes only the intended fields, reads
 *   directly from the registry (no parallel data source).
 * - Template id audit: every registry key is stable/URL-safe, self-
 *   consistent with its own `id` field, and unique.
 * - Demo data: every template resolves to a template-specific sample
 *   dataset in zero-context (public, unauthenticated) preview assembly —
 *   regression guard for the boho-floral-brown mismatched-fallback fix.
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

require.extensions[".ts"] = function compileTestTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8").replace(/^import ["']server-only["'];?\s*/m, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(compiled, filename);
};

const registryModule = require("../invitation-template-registry.ts");
const catalog = require("../invitation-template-public-catalog.ts");
const previewData = require("../invitation-template-preview-data.ts");

const { INVITATION_TEMPLATE_REGISTRY } = registryModule;
const REGISTRY_IDS = Object.keys(INVITATION_TEMPLATE_REGISTRY);

const ALLOWED_PUBLIC_KEYS = new Set([
  "id", "name", "description", "category", "categoryLabel", "features", "preview",
]);
const FORBIDDEN_INTERNAL_KEYS = [
  "pageRenderer", "composition", "defaultThemePreset", "requiredBlockTypes",
  "defaultBlockTypes", "defaultEffects", "publicationStatus", "version", "detailsPresentation",
];

describe("invitation template public catalog (Phase 1 foundation)", () => {
  test("getPublicTemplateCatalog returns every published template, no more no less", () => {
    const publishedIds = REGISTRY_IDS.filter(
      (id) => INVITATION_TEMPLATE_REGISTRY[id].publicationStatus === "published"
    );
    const result = catalog.getPublicTemplateCatalog();
    assert.equal(result.length, publishedIds.length);
    assert.deepEqual(result.map((entry) => entry.id).sort(), publishedIds.sort());
  });

  test("public summaries expose only the intended fields, never internal implementation details", () => {
    for (const summary of catalog.getPublicTemplateCatalog()) {
      const keys = Object.keys(summary);
      for (const key of keys) {
        assert.ok(ALLOWED_PUBLIC_KEYS.has(key), `unexpected public field "${key}" on ${summary.id}`);
      }
      for (const forbidden of FORBIDDEN_INTERNAL_KEYS) {
        assert.ok(!(forbidden in summary), `"${forbidden}" leaked into the public summary for ${summary.id}`);
      }
      assert.equal(typeof summary.id, "string");
      assert.equal(typeof summary.name, "string");
      assert.equal(typeof summary.description, "string");
      assert.ok(summary.preview && summary.preview.kind === "rendered-sample");
    }
  });

  test("getPublicTemplateSummary returns undefined for unknown or falsy ids", () => {
    assert.equal(catalog.getPublicTemplateSummary("not-a-real-template"), undefined);
    assert.equal(catalog.getPublicTemplateSummary(null), undefined);
    assert.equal(catalog.getPublicTemplateSummary(undefined), undefined);
    assert.equal(catalog.getPublicTemplateSummary(""), undefined);
  });

  // boho-floral-brown is retired (publicationStatus), so the public lookup correctly
  // returns undefined now — check the registry field directly to keep guarding the
  // original duplicated-categoryLabel regression independent of publication status.
  test("registry entry for boho-floral-brown has the fixed categoryLabel, not the duplicated-name bug", () => {
    const definition = INVITATION_TEMPLATE_REGISTRY["boho-floral-brown"];
    assert.ok(definition);
    assert.equal(definition.category, "wedding");
    assert.equal(definition.categoryLabel, "Wedding");
  });

  test("getPublicTemplateCategories returns a de-duplicated list covering every published category", () => {
    const categories = catalog.getPublicTemplateCategories();
    assert.equal(new Set(categories).size, categories.length, "must be de-duplicated");
    const expected = new Set(
      REGISTRY_IDS
        .filter((id) => INVITATION_TEMPLATE_REGISTRY[id].publicationStatus === "published")
        .map((id) => INVITATION_TEMPLATE_REGISTRY[id].category)
    );
    assert.deepEqual(new Set(categories), expected);
  });

  test("every registry id is stable, URL-safe kebab-case, and self-consistent with its own id field", () => {
    const urlSafe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const key of REGISTRY_IDS) {
      assert.match(key, urlSafe, `registry key "${key}" is not URL-safe kebab-case`);
      assert.equal(INVITATION_TEMPLATE_REGISTRY[key].id, key, `registry key "${key}" does not match its own id field`);
    }
  });

  test("no two registry entries share an id value (copy-paste guard)", () => {
    const idValues = REGISTRY_IDS.map((key) => INVITATION_TEMPLATE_REGISTRY[key].id);
    assert.equal(new Set(idValues).size, idValues.length);
  });

  test("boho-floral-brown resolves to its own dedicated sample dataset, not the gala/corporate fallback", () => {
    const sample = previewData.getInvitationTemplateSampleData("boho-floral-brown");
    assert.equal(sample.partner1Name, "Noor Hassan");
    assert.equal(sample.partner2Name, "Idris Khalil");
    assert.ok(Array.isArray(sample.gallery) && sample.gallery.length >= 5, "needs enough gallery items to demo the 3D coverflow layout");
    // Regression guard: must not equal the gala/corporate dataset it used to silently fall back to.
    const galaFallback = previewData.getInvitationTemplateSampleData("gala-editorial");
    assert.notEqual(sample.title, galaFallback.title);
  });

  test("every registered template builds non-throwing, non-empty preview data with zero draft/event context", () => {
    for (const id of REGISTRY_IDS) {
      const result = previewData.buildInvitationTemplatePreviewData(id, {}, {});
      assert.ok(result.data, `buildInvitationTemplatePreviewData threw or returned nothing for ${id}`);
      assert.ok(typeof result.data.title === "string" && result.data.title.trim().length > 0, `${id} produced an empty title in a zero-context preview`);
    }
  });
});
