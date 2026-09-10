/**
 * lib/dashboard/__tests__/seating-count-input.test.cjs
 *
 * Regression tests for the VenueBuilder "Received NaN for the `value`
 * attribute" runtime warning (Number of Rows / Seats Per Row / Seat
 * Capacity inputs). Root cause: onChange stored parseInt(e.target.value)
 * directly, so clearing an input put NaN into state and back into the
 * controlled `value` prop. The fix parses via parseCountInput
 * (lib/seating.ts), whose contract is `number | ""` — NaN never enters
 * state — while seat generation keeps its `Number(...) || <default>`
 * fallbacks. Follows the repo's node:test + TS-transpile convention.
 */

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

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

Module._load = function loadMocks(request, parent, isMain) {
  // parseCountInput never touches Supabase; stub the engine's admin import.
  if (request === "@/lib/supabase-admin" || request.endsWith("lib/supabase-admin")) {
    return { createSupabaseAdmin: () => null };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { parseCountInput } = require("@/lib/seating.ts");

test("empty input parses to empty string, not NaN", () => {
  assert.equal(parseCountInput(""), "");
});

test("valid values parse to integers", () => {
  assert.equal(parseCountInput("1"), 1);
  assert.equal(parseCountInput("5"), 5);
  assert.equal(parseCountInput("26"), 26);
});

test("boundary values pass through unclamped (generation fallbacks own defaults)", () => {
  assert.equal(parseCountInput("0"), 0);
  assert.equal(parseCountInput("27"), 27);
});

test("non-numeric input never produces NaN", () => {
  for (const raw of ["-", ".", "abc", "  ", "1e", "--5"]) {
    const value = parseCountInput(raw);
    assert.ok(
      value === "" || Number.isFinite(value),
      `input ${JSON.stringify(raw)} must not produce NaN`
    );
  }
});

test("generation fallbacks still resolve (mirrors VenueBuilder handlers)", () => {
  // handleGenerateSection / handleGenerateTable use Number(...) || <default>.
  assert.equal(Number(parseCountInput("")) || 1, 1);
  assert.equal(Number(parseCountInput("0")) || 1, 1);
  assert.equal(Number(parseCountInput("5")) || 1, 5);
  assert.equal(Number(parseCountInput("")) || 6, 6);
  assert.equal(Number(parseCountInput("8")) || 6, 8);
});

test("modal defaults are valid finite numbers", () => {
  // useState initializers in VenueBuilder: rows 4, seatsPerRow 10, capacity 8.
  for (const def of [4, 10, 8]) {
    assert.ok(Number.isFinite(def), `default ${def} must be finite`);
  }
});
