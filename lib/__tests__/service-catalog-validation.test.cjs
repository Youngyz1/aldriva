/**
 * lib/__tests__/service-catalog-validation.test.cjs
 *
 * Pure, DB-free unit tests for lib/validation/service-catalog.ts: the
 * includes bullet-list limit, the slug-candidate helper used for
 * service_categories uniqueness retries, and the summary/tagline/description
 * clamp functions ("use default" semantics — never reject a save).
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
  SUMMARY_MAX,
  INCLUDES_MAX_ITEMS,
  INCLUDE_ITEM_MAX,
  CATEGORY_TITLE_MAX,
  normalizeSlugCandidate,
  slugCandidateForAttempt,
  clampSummary,
  sanitizeIncludes,
  clampCategoryTitle,
  clampCategoryTagline,
  clampCategoryDescription,
} = require(path.join(ROOT, "lib/validation/service-catalog.ts"));

// ── sanitizeIncludes: the max-12 / max-80 "includes" limit ─────────────────

test("sanitizeIncludes: drops non-array input instead of rejecting", () => {
  assert.deepEqual(sanitizeIncludes(null), []);
  assert.deepEqual(sanitizeIncludes(undefined), []);
  assert.deepEqual(sanitizeIncludes("not an array"), []);
  assert.deepEqual(sanitizeIncludes(42), []);
});

test("sanitizeIncludes: trims, drops blanks and non-strings", () => {
  assert.deepEqual(sanitizeIncludes(["  Free parking  ", "", "   ", 42, null, "Includes towel"]), [
    "Free parking",
    "Includes towel",
  ]);
});

test("sanitizeIncludes: caps each item at INCLUDE_ITEM_MAX characters", () => {
  const long = "x".repeat(INCLUDE_ITEM_MAX + 50);
  const [result] = sanitizeIncludes([long]);
  assert.equal(result.length, INCLUDE_ITEM_MAX);
});

test("sanitizeIncludes: caps the list at INCLUDES_MAX_ITEMS", () => {
  const items = Array.from({ length: INCLUDES_MAX_ITEMS + 10 }, (_, i) => `item ${i}`);
  const result = sanitizeIncludes(items);
  assert.equal(result.length, INCLUDES_MAX_ITEMS);
  assert.equal(result[0], "item 0");
});

// ── clampSummary: "use default" (null) instead of rejecting ────────────────

test("clampSummary: blank or non-string input means null, never an error", () => {
  assert.equal(clampSummary(""), null);
  assert.equal(clampSummary("   "), null);
  assert.equal(clampSummary(null), null);
  assert.equal(clampSummary(undefined), null);
  assert.equal(clampSummary(42), null);
});

test("clampSummary: trims and clamps to SUMMARY_MAX instead of rejecting", () => {
  const long = "a".repeat(SUMMARY_MAX + 100);
  const result = clampSummary(long);
  assert.equal(result.length, SUMMARY_MAX);
});

test("clampSummary: valid input is trimmed and returned as-is", () => {
  assert.equal(clampSummary("  Great haircuts  "), "Great haircuts");
});

// ── category title/tagline/description: same clamp-not-reject convention ──

test("clampCategoryTitle / clampCategoryTagline / clampCategoryDescription clamp instead of reject", () => {
  assert.equal(clampCategoryTitle(""), null);
  assert.equal(clampCategoryTitle("a".repeat(CATEGORY_TITLE_MAX + 20)).length, CATEGORY_TITLE_MAX);
  assert.equal(clampCategoryTagline(""), null);
  assert.equal(clampCategoryDescription(""), null);
});

// ── slug helpers used for service_categories uniqueness retries ────────────

test("normalizeSlugCandidate: produces a valid, bounded slug from free text", () => {
  const slug = normalizeSlugCandidate("Deep Cleaning & Sanitizing!", "category", 120);
  assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(slug, "deep-cleaning-sanitizing");
});

test("normalizeSlugCandidate: falls back when input sanitizes to nothing", () => {
  assert.equal(normalizeSlugCandidate("!!!", "category", 120), "category");
  assert.equal(normalizeSlugCandidate("", "category", 120), "category");
});

test("normalizeSlugCandidate: respects maxLen without leaving a trailing dash", () => {
  const slug = normalizeSlugCandidate("a-very-long-category-title-that-goes-on", "category", 10);
  assert.ok(slug.length <= 10);
  assert.ok(!slug.endsWith("-"));
});

test("slugCandidateForAttempt: attempt 0 is the bare base", () => {
  assert.equal(slugCandidateForAttempt("deep-cleaning", 0, 120), "deep-cleaning");
});

test("slugCandidateForAttempt: attempts 1-8 append -2.. -9 (uniqueness retry sequence)", () => {
  assert.equal(slugCandidateForAttempt("deep-cleaning", 1, 120), "deep-cleaning-2");
  assert.equal(slugCandidateForAttempt("deep-cleaning", 8, 120), "deep-cleaning-9");
});

test("slugCandidateForAttempt: never exceeds maxLen", () => {
  const base = "x".repeat(200);
  const candidate = slugCandidateForAttempt(base, 1, 20);
  assert.ok(candidate.length <= 20);
});
