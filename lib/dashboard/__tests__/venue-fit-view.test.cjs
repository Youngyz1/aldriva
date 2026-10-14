/**
 * lib/dashboard/__tests__/venue-fit-view.test.cjs
 *
 * B1: pure fit-to-content math for the organizer builder viewport.
 * Follows the repo's node:test + TS-transpile convention.
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
  collectContentBounds,
  computeFitTransform,
  FIT_MIN_SCALE,
  FIT_MAX_SCALE,
} = require("@/app/dashboard/events/[id]/seating/fit-view.ts");

// 20-seat row as the builder generates it: x=80, 34px pitch, 26px box.
function twentySeatRow() {
  const seats = [];
  for (let i = 0; i < 20; i++) {
    seats.push({ x: 80 + i * 34, y: 150, width: 26, height: 26 });
  }
  return seats;
}

function projectAllInside(seats, t, vw, vh) {
  return seats.every((s) => {
    const x0 = t.pan.x + s.x * t.scale;
    const x1 = t.pan.x + (s.x + s.width) * t.scale;
    const y0 = t.pan.y + s.y * t.scale;
    const y1 = t.pan.y + (s.y + s.height) * t.scale;
    return x0 >= -1 && x1 <= vw + 1 && y0 >= -1 && y1 <= vh + 1;
  });
}

test("empty seats produce the identity transform (mount-before-load)", () => {
  assert.equal(collectContentBounds([], []), null);
  assert.deepEqual(computeFitTransform(null, { width: 343, height: 600 }), {
    scale: 1,
    pan: { x: 0, y: 0 },
  });
});

test("20-seat row fits a ~343px phone viewport", () => {
  const seats = twentySeatRow();
  const bounds = collectContentBounds(seats, []);
  assert.deepEqual(bounds, { minX: 80, minY: 150, maxX: 752, maxY: 176 });
  const t = computeFitTransform(bounds, { width: 343, height: 600 });
  // Content span 672 + 48 pad = 720 → 343/720 ≈ 0.48.
  assert.equal(t.scale, 0.48);
  assert.ok(projectAllInside(seats, t, 343, 600), "every seat on screen");
});

test("very wide content clamps to the 0.25 floor", () => {
  assert.equal(FIT_MIN_SCALE, 0.25);
  const t = computeFitTransform(
    { minX: 0, minY: 0, maxX: 3000, maxY: 100 },
    { width: 343, height: 600 }
  );
  assert.equal(t.scale, 0.25);
});

test("small content clamps to the 1.5 ceiling", () => {
  assert.equal(FIT_MAX_SCALE, 1.5);
  const t = computeFitTransform(
    { minX: 0, minY: 0, maxX: 50, maxY: 50 },
    { width: 1200, height: 800 }
  );
  assert.equal(t.scale, 1.5);
});

test("venue objects extend the bounds; invalid entries are skipped", () => {
  const bounds = collectContentBounds(
    [{ x: 80, y: 150, width: 26, height: 26 }],
    [
      { x: 375, y: 55, width: 460, height: 80 },
      { x: "bad", y: 0, width: 10, height: 10 },
    ]
  );
  assert.deepEqual(bounds, { minX: 80, minY: 55, maxX: 835, maxY: 176 });
});
