/**
 * lib/__tests__/seating-stress.test.cjs
 *
 * P2.1: the dev-preview stress generator clamps correctly and its output
 * passes adaptPlan with the right count. Synthetic only; no network, no DB.
 */

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: filename,
    }).outputText,
    filename
  );
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
  if (request === "@/lib/supabase-admin" || request.endsWith("lib/supabase-admin")) {
    return { createSupabaseAdmin: () => null };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  clampStressCount,
  generateStressSeats,
  STRESS_MAX,
} = require("@/app/dev/seating-preview/stress.ts");
const { adaptPlan } = require("@/lib/seating-adapter.ts");

test("stress count clamps to 5000 and rejects junk", () => {
  assert.equal(STRESS_MAX, 5000);
  assert.equal(clampStressCount("2500"), 2500);
  assert.equal(clampStressCount("99999"), 5000);
  assert.equal(clampStressCount("0"), null);
  assert.equal(clampStressCount("-5"), null);
  assert.equal(clampStressCount("abc"), null);
  assert.equal(clampStressCount(null), null);
  assert.equal(clampStressCount(""), null);
});

test("generator output passes adaptPlan with the right count", () => {
  const seats = generateStressSeats(2500);
  assert.equal(seats.length, 2500);
  const plan = adaptPlan({
    id: "stress",
    event_id: "stress",
    name: "Stress",
    canvas_width: 1200,
    canvas_height: 800,
    version: 1,
    is_published: true,
    published_at: null,
    sections: [{ name: "Stress" }],
    venue_objects: [],
    seats,
  });
  assert.equal(plan.seats.length, 2500);
  assert.ok(plan.seats.every((s) => s.status === "available"));
  assert.ok(
    plan.seats.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)),
    "no NaN coordinates"
  );
});
