/**
 * lib/__tests__/services-route-resolver.test.cjs
 *
 * Pure, DB-free tests for the /services virtual route resolver
 * (lib/services-route-resolver.ts) and the related-services ranking helper
 * (lib/services-public-data.ts's getRelatedServices, also pure).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
  const output = ts.transpileModule(raw, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(ROOT, request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  resolveServicesRoute,
  buildCategoryPath,
  buildServicePath,
} = require(path.join(ROOT, "lib/services-route-resolver.ts"));

const { getRelatedServices } = require(path.join(ROOT, "lib/services-public-data.ts"));

const CLEANING = { id: "cat-1", slug: "cleaning", is_active: true };
const GARDENING = { id: "cat-2", slug: "gardening", is_active: true };
const INACTIVE_CAT = { id: "cat-3", slug: "legacy", is_active: false };

const DEEP_CLEAN = { id: "svc-1", slug: "deep-clean", category_id: "cat-1", is_active: true };
const MOW_LAWN = { id: "svc-2", slug: "mow-lawn", category_id: "cat-2", is_active: true };
const CONSULT = { id: "svc-3", slug: "consult", category_id: null, is_active: true };
const INACTIVE_SVC = { id: "svc-4", slug: "retired", category_id: null, is_active: false };
const ORPHAN_IN_INACTIVE_CAT = { id: "svc-5", slug: "orphan", category_id: "cat-3", is_active: true };

const CATALOG = {
  categories: [CLEANING, GARDENING, INACTIVE_CAT],
  services: [DEEP_CLEAN, MOW_LAWN, CONSULT, INACTIVE_SVC, ORPHAN_IN_INACTIVE_CAT],
};

test("index: zero segments resolves to index", () => {
  assert.deepEqual(resolveServicesRoute([], CATALOG), { kind: "index" });
});

test("category: single segment matching an active category slug", () => {
  const result = resolveServicesRoute(["cleaning"], CATALOG);
  assert.equal(result.kind, "category");
  assert.equal(result.category.id, "cat-1");
});

test("service-in-category: two segments resolve the service scoped to its category", () => {
  const result = resolveServicesRoute(["cleaning", "deep-clean"], CATALOG);
  assert.equal(result.kind, "service");
  assert.equal(result.service.id, "svc-1");
  assert.equal(result.category.id, "cat-1");
});

test("uncategorized service: single segment matching an uncategorized service slug", () => {
  const result = resolveServicesRoute(["consult"], CATALOG);
  assert.equal(result.kind, "service");
  assert.equal(result.service.id, "svc-3");
  assert.equal(result.category, null);
});

test("mismatched category: service exists but under a different category -> notFound", () => {
  const result = resolveServicesRoute(["cleaning", "mow-lawn"], CATALOG);
  assert.deepEqual(result, { kind: "notFound" });
});

test("inactive category: slug matches but category is not active -> notFound", () => {
  const result = resolveServicesRoute(["legacy"], CATALOG);
  assert.deepEqual(result, { kind: "notFound" });
});

test("inactive service: slug matches an uncategorized service that is not active -> notFound", () => {
  const result = resolveServicesRoute(["retired"], CATALOG);
  assert.deepEqual(result, { kind: "notFound" });
});

test("service under an inactive category is unreachable via either route shape", () => {
  assert.deepEqual(resolveServicesRoute(["legacy", "orphan"], CATALOG), { kind: "notFound" });
  assert.deepEqual(resolveServicesRoute(["orphan"], CATALOG), { kind: "notFound" });
});

test("unknown: slug matches nothing -> notFound", () => {
  assert.deepEqual(resolveServicesRoute(["nonexistent"], CATALOG), { kind: "notFound" });
});

test("extra segments: more than two segments after services -> notFound", () => {
  assert.deepEqual(resolveServicesRoute(["cleaning", "deep-clean", "extra"], CATALOG), { kind: "notFound" });
});

test("uppercase slug: matched case-insensitively", () => {
  const result = resolveServicesRoute(["CLEANING"], CATALOG);
  assert.equal(result.kind, "category");
  assert.equal(result.category.id, "cat-1");
});

test("trailing slash: an empty trailing segment is ignored", () => {
  const result = resolveServicesRoute(["cleaning", ""], CATALOG);
  assert.equal(result.kind, "category");
  assert.equal(result.category.id, "cat-1");
});

test("category-vs-service slug precedence: a category wins over a same-slug uncategorized service", () => {
  const catalog = {
    categories: [{ id: "cat-x", slug: "shared", is_active: true }],
    services: [{ id: "svc-x", slug: "shared", category_id: null, is_active: true }],
  };
  const result = resolveServicesRoute(["shared"], catalog);
  assert.equal(result.kind, "category");
  assert.equal(result.category.id, "cat-x");
});

test("empty category: a category with zero services still resolves (page renders hero/CTA, no empty grid)", () => {
  const catalog = {
    categories: [{ id: "cat-empty", slug: "empty", is_active: true }],
    services: [],
  };
  const result = resolveServicesRoute(["empty"], catalog);
  assert.equal(result.kind, "category");
  assert.equal(result.category.id, "cat-empty");
});

// ── Path builders ────────────────────────────────────────────────────────

test("buildCategoryPath returns relative services/<slug> segments", () => {
  assert.deepEqual(buildCategoryPath(CLEANING), ["services", "cleaning"]);
});

test("buildServicePath nests under its category when categorized", () => {
  assert.deepEqual(buildServicePath(DEEP_CLEAN, CLEANING), ["services", "cleaning", "deep-clean"]);
});

test("buildServicePath is flat for an uncategorized service", () => {
  assert.deepEqual(buildServicePath(CONSULT, null), ["services", "consult"]);
});

// ── getRelatedServices ───────────────────────────────────────────────────

test("getRelatedServices: same category first, then others, excluding itself and inactive", () => {
  const all = [
    { id: "a", category_id: "cat-1", is_active: true },
    { id: "b", category_id: "cat-1", is_active: true },
    { id: "c", category_id: "cat-2", is_active: true },
    { id: "d", category_id: "cat-1", is_active: false },
  ];
  const result = getRelatedServices({ id: "a", category_id: "cat-1" }, all, 3);
  assert.deepEqual(result.map((s) => s.id), ["b", "c"]);
});

test("getRelatedServices: caps at the given limit", () => {
  const all = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, category_id: "cat-1", is_active: true }));
  const result = getRelatedServices({ id: "s0", category_id: "cat-1" }, all, 3);
  assert.equal(result.length, 3);
});
