/**
 * lib/__tests__/slug.test.cjs
 *
 * Phase 3, Step 0: the shared slug helper. Regression for the production
 * "Sams Abidjan" -> "ams-bidjan" bug (strip-before-lowercase in the SQL
 * trigger, migrations 58/127): lowercase MUST come first.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { slugify, createSlug, appendSlugSuffix, MAX_SLUG_LENGTH } = require(path.join(ROOT, "lib/slug.ts"));

test("slug helper keeps capitals (Sams Abidjan regression)", () => {
  assert.equal(slugify("Sams Abidjan"), "sams-abidjan");
  assert.equal(slugify("ABC DEF"), "abc-def");
});

test("slug helper strips accents (Café Étoile)", () => {
  assert.equal(slugify("Café Étoile"), "cafe-etoile");
  assert.equal(slugify("Fête d'Été"), "fete-d-ete");
  assert.equal(slugify("Côte d'Ivoire"), "cote-d-ivoire");
});

test("slug helper collapses spaces, apostrophes and punctuation", () => {
  assert.equal(slugify("  a  --  b  "), "a-b");
  assert.equal(slugify("l'Atelier & Cie!"), "l-atelier-cie");
  assert.equal(slugify("--hello--"), "hello");
});

test("slug helper falls back on symbols-only input", () => {
  assert.equal(slugify("!!!"), "");
  assert.equal(createSlug("!!!"), "item");
  assert.equal(createSlug("!!!", "business"), "business");
  assert.equal(createSlug(""), "item");
});

test("slug helper caps very long input", () => {
  const long = slugify("a".repeat(200));
  assert.ok(long.length <= MAX_SLUG_LENGTH, `length ${long.length} <= ${MAX_SLUG_LENGTH}`);
  assert.ok(!long.endsWith("-"), "no trailing dash after truncation");
  assert.equal(slugify("word ".repeat(50)).length <= MAX_SLUG_LENGTH, true);
});

test("slug helper appends suffixes for collisions", () => {
  assert.equal(appendSlugSuffix("sams-abidjan", 2), "sams-abidjan-2");
  assert.equal(appendSlugSuffix("sams-abidjan", "sams abidjan"), "sams-abidjan-sams-abidjan");
});

test("reserved words still slugify to themselves (reservation stays at call sites)", () => {
  assert.equal(slugify("Dashboard"), "dashboard");
  assert.equal(slugify("Create Event"), "create-event");
});

test("every entity-slug generator routes through the shared helper", () => {
  const generators = [
    "lib/event-slug.ts",
    "lib/city-slug.ts",
    "app/create-organizer/page.tsx",
    "app/create-fundraiser/page.tsx",
    "app/fundraisers/edit/[id]/page.tsx",
    "app/import/ImportClient.tsx",
    "app/api/gofundme-sync/route.ts",
  ];
  for (const rel of generators) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.ok(
      src.includes("@/lib/slug") || src.includes("./slug") || src.includes('"./slug"'),
      `${rel} must import the shared slug helper`
    );
    assert.doesNotMatch(src, /\.toLowerCase\(\)\s*\n?\s*\.trim\(\)\s*\n?\s*\.replace\(\/\[\^a-z0-9/, `${rel} must not keep an inline strip chain`);
  }
});
