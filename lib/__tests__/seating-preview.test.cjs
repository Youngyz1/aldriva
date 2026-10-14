/**
 * lib/__tests__/seating-preview.test.cjs
 *
 * P1 render smoke test (no browser, no network):
 * 1. The real staging fixtures load and match the adapter's input shape.
 * 2. The adapter maps the 125-seat fixture (spot checks).
 * 3. VenueSeatPicker3D server-renders the adapted plan (demo off) with no
 *    console.error output — the closest mount check available without a
 *    browser (canvas effects do not run under renderToString).
 */

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

const TS_OPTIONS = {
  esModuleInterop: true,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
};

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: TS_OPTIONS,
      fileName: filename,
    }).outputText,
    filename
  );
};

require.extensions[".tsx"] = function compileTsx(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: { ...TS_OPTIONS, jsx: ts.JsxEmit.ReactJSX },
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

const venueFixture = require(path.join(ROOT, "lib/__tests__/fixtures/venue-layout.json"));
const seatsFixture = require(path.join(ROOT, "lib/__tests__/fixtures/seats-response.json"));
const { adaptPlan } = require("@/lib/seating-adapter.ts");

test("real fixtures match the adapter input shape", () => {
  assert.ok(venueFixture.layout, "venue-layout.json has .layout");
  assert.ok(Array.isArray(venueFixture.layout.venue_objects), "layout has venue_objects");
  assert.ok(Array.isArray(seatsFixture.seats), "seats-response.json has .seats");
  assert.equal(seatsFixture.seats.length, 125);
  const first = seatsFixture.seats[0];
  for (const key of ["id", "section", "row_label", "seat_number", "status", "x", "y"]) {
    assert.ok(first[key] !== undefined, `seat has ${key}`);
  }
});

test("adapter maps the 125-seat fixture (spot checks)", () => {
  const plan = adaptPlan({ ...venueFixture.layout, seats: seatsFixture.seats });
  assert.equal(plan.seats.length, 125);
  assert.equal(plan.tables.length, 5);
  // Grid origin seat: top-left (80,150) box 26 → centre (93,163).
  const origin = plan.seats.find((s) => s.label === "Regular · Row A · Seat 1");
  assert.ok(origin, "row-A seat label mapped");
  assert.equal(origin.x, 93);
  assert.equal(origin.y, 163);
  assert.equal(origin.status, "available");
  // Table chairs joined to their table object.
  const chairs = plan.seats.filter((s) => s.tableId);
  assert.equal(chairs.length, 25);
  // Fixture has VIP flags but no accessible flags, stages, GA or labels.
  assert.equal(plan.seats.filter((s) => s.category === "vip").length, 25);
  assert.deepEqual(plan.stages ?? [], []);
  assert.deepEqual(plan.gaZones ?? [], []);
  assert.deepEqual(plan.labels ?? [], []);
});

test("picker server-renders the adapted plan with no console errors", () => {
  const React = require("react");
  const { renderToString } = require("react-dom/server");
  const { VenueSeatPicker3D } = require("@/components/ui/venue-seat-picker-3d.tsx");
  const plan = adaptPlan({ ...venueFixture.layout, seats: seatsFixture.seats });
  const errors = [];
  const origError = console.error;
  console.error = (...args) => {
    errors.push(args.map(String).join(" "));
  };
  try {
    const html = renderToString(
      React.createElement(VenueSeatPicker3D, { venue: plan, seatRadius: 13 })
    );
    assert.ok(html.includes("<canvas"), "renders the map canvas");
    assert.ok(html.includes("125 seats"), "aria label carries the seat count");
  } finally {
    console.error = origError;
  }
  assert.deepEqual(errors, []);
});
