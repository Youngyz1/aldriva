/**
 * lib/__tests__/seating-adapter.test.cjs
 *
 * P0: pins the saved-plan → VenuePlan adapter contract against a realistic
 * saved-plan fixture (shapes mirror `GET /api/seats` rows + `venue_objects`):
 * top-left → centre conversion, seatRadius derivation, flags → category,
 * table_number join, unavailable + invitation-held → locked status.
 *
 * Follows the repo's node:test + TS-transpile convention.
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
  if (request === "@/lib/supabase-admin" || request.endsWith("lib/supabase-admin")) {
    return { createSupabaseAdmin: () => null };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  adaptPlan,
  adaptSeatCategory,
  adaptSeatStatus,
  adaptStatusLabel,
  shouldUse3DPicker,
  PICKER_MAX_SEATS,
  EXPIRED_GRACE_MS,
  SEAT_GLYPH_SIZE,
  SUGGESTED_SEAT_RADIUS,
} = require("@/lib/seating-adapter.ts");

// ─── Realistic saved-plan fixture ────────────────────────────────────────────
// One row seat, one round-table group (object + 2 chair rows), one stage, one
// GA zone, one label, plus locked/edge-case seats. Coordinates are TOP-LEFT,
// exactly as `generateSectionSeatsGrid` / `generateTableSeats` write them.

const LAYOUT_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";

function baseSeat(overrides) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    event_id: EVENT_ID,
    layout_id: LAYOUT_ID,
    section: "Orchestra",
    row_label: "C",
    seat_number: 7,
    table_number: null,
    table_name: null,
    table_capacity: null,
    is_vip: false,
    is_accessible: false,
    status: "available",
    reserved_until: null,
    price_override: null,
    ticket_id: null,
    ticket_type_id: null,
    assigned_invitation_id: null,
    x: 100,
    y: 200,
    width: 26,
    height: 26,
    rotation: 0,
    object_type: "seat",
    effective_price: 25,
    ...overrides,
  };
}

const TABLE_ID = "44444444-4444-4444-8444-444444444444";

const fixture = {
  id: LAYOUT_ID,
  event_id: EVENT_ID,
  name: "Gala Hall",
  canvas_width: 1200,
  canvas_height: 800,
  version: 1,
  is_published: true,
  published_at: null,
  sections: [{ name: "Orchestra" }],
  venue_objects: [
    {
      id: TABLE_ID,
      type: "table",
      name: "Gold 1",
      x: 500,
      y: 400,
      width: 100,
      height: 100,
      table_number: "1",
      table_name: "Gold 1",
      table_capacity: 8,
      table_shape: "round",
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      type: "stage",
      name: "Main Stage",
      x: 375,
      y: 55,
      width: 460,
      height: 80,
      label: "Main Stage",
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      type: "ga_area",
      name: "Dance Floor",
      x: 100,
      y: 600,
      width: 300,
      height: 120,
      label: "Dance Floor",
      capacity: 200,
    },
    { id: "label-1", type: "label", name: "Bar", x: 50, y: 50, width: 0, height: 0, label: "Bar" },
  ],
  seats: [
    baseSeat({}), // plain row seat
    baseSeat({
      id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      section: "Table 1",
      row_label: "T",
      seat_number: 1,
      table_number: "1",
      table_name: "Gold 1",
      table_capacity: 8,
      is_vip: true,
      x: 548,
      y: 428,
      width: 24,
      height: 24,
      object_type: "table_seat",
      effective_price: 80,
    }),
    baseSeat({
      id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      status: "unavailable",
      seat_number: 8,
    }),
    baseSeat({
      id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
      seat_number: 9,
      assigned_invitation_id: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
    }),
    baseSeat({
      id: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee",
      status: "reserved",
      reserved_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      seat_number: 10,
    }),
    baseSeat({
      id: "ffffffff-ffff-4fff-ffff-ffffffffffff",
      status: "reserved",
      reserved_until: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      seat_number: 11,
    }),
    baseSeat({
      id: "99999999-9999-4999-8999-999999999999",
      is_accessible: true,
      is_vip: true,
      seat_number: 12,
      effective_price: undefined,
    }),
  ],
};

test("top-left converts to centre using the seat box", () => {
  const plan = adaptPlan(fixture);
  const row = plan.seats[0];
  assert.equal(row.x, 100 + 26 / 2);
  assert.equal(row.y, 200 + 26 / 2);
  // 24px table chair honours its own box, not the 26 default
  const chair = plan.seats.find((s) => s.id === "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa");
  assert.equal(chair.x, 548 + 24 / 2);
  assert.equal(chair.y, 428 + 24 / 2);
});

test("seatRadius derives from our seat size (26 box → 13)", () => {
  assert.equal(SEAT_GLYPH_SIZE, 26);
  assert.equal(SUGGESTED_SEAT_RADIUS, 13);
});

test("VIP/accessible flags map to category (accessible wins)", () => {
  assert.equal(adaptSeatCategory({ is_vip: false, is_accessible: false }), "standard");
  assert.equal(adaptSeatCategory({ is_vip: true, is_accessible: false }), "vip");
  assert.equal(adaptSeatCategory({ is_vip: false, is_accessible: true }), "accessible");
  assert.equal(adaptSeatCategory({ is_vip: true, is_accessible: true }), "accessible");
  const plan = adaptPlan(fixture);
  assert.equal(plan.seats[0].category, "standard");
  assert.equal(
    plan.seats.find((s) => s.id === "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa").category,
    "vip"
  );
});

test("table_number joins the seat to its table object id", () => {
  const plan = adaptPlan(fixture);
  assert.equal(
    plan.seats.find((s) => s.id === "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa").tableId,
    TABLE_ID
  );
  assert.equal(plan.seats[0].tableId, undefined);
  // Round table: centre + radius from the rect box
  const table = plan.tables[0];
  assert.equal(table.x, 500 + 100 / 2);
  assert.equal(table.y, 400 + 100 / 2);
  assert.equal(table.radius, 50);
});

test("unavailable and invitation-held seats map to a locked status", () => {
  assert.equal(adaptSeatStatus({ status: "unavailable", assigned_invitation_id: null }), "sold");
  assert.equal(
    adaptSeatStatus({ status: "available", assigned_invitation_id: "dddddddd-dddd-4ddd-dddd-dddddddddddd" }),
    "sold"
  );
  assert.equal(adaptSeatStatus({ status: "sold", assigned_invitation_id: null }), "sold");
  assert.equal(adaptSeatStatus({ status: "available", assigned_invitation_id: null }), "available");
  // Active holds stay reserved; the hold RPC arbitrates at checkout.
  // (Expired holds map to available — pinned by the P2 expired-hold tests.)
  assert.equal(
    adaptSeatStatus({
      status: "reserved",
      reserved_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      assigned_invitation_id: null,
    }),
    "reserved"
  );
  const plan = adaptPlan(fixture);
  const byId = new Map(plan.seats.map((s) => [s.id, s]));
  assert.equal(byId.get("bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb").status, "sold");
  assert.equal(byId.get("cccccccc-cccc-4ccc-cccc-cccccccccccc").status, "sold");
  assert.equal(byId.get("eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee").status, "reserved");
});

test("labels follow the SeatMap tooltip convention", () => {
  const plan = adaptPlan(fixture);
  assert.equal(plan.seats[0].label, "Orchestra · Row C · Seat 7");
  assert.equal(
    plan.seats.find((s) => s.id === "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa").label,
    "Table 1 · Seat 1"
  );
  assert.equal(plan.seats[0].number, 7);
});

test("stages centre-convert, GA zones are read-only, labels rename", () => {
  const plan = adaptPlan(fixture);
  assert.deepEqual(plan.stages, [
    { id: "55555555-5555-4555-8555-555555555555", x: 375 + 460 / 2, y: 55 + 80 / 2, width: 460, height: 80 },
  ]);
  assert.equal(plan.gaZones.length, 1);
  assert.equal(plan.gaZones[0].readOnly, true);
  assert.equal(plan.gaZones[0].available, 200);
  assert.equal(plan.gaZones[0].x, 100 + 300 / 2);
  assert.deepEqual(plan.labels, [{ x: 50, y: 50, text: "Bar" }]);
});

test("price passes through enriched effective_price, else undefined", () => {
  const plan = adaptPlan(fixture);
  assert.equal(plan.seats[0].price, 25);
  assert.equal(
    plan.seats.find((s) => s.id === "99999999-9999-4999-8999-999999999999").price,
    undefined
  );
});

test("myHeldIds map my reserved seats back to available (display-only)", () => {
  const seat = {
    id: "held-1",
    status: "reserved",
    reserved_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    assigned_invitation_id: null,
  };
  // Others' holds stay locked…
  assert.equal(adaptSeatStatus(seat), "reserved");
  // …mine read as available, via Set or array…
  assert.equal(adaptSeatStatus(seat, { myHeldIds: new Set(["held-1"]) }), "available");
  assert.equal(adaptSeatStatus(seat, { myHeldIds: ["held-1"] }), "available");
  // …but never override hard locks.
  assert.equal(
    adaptSeatStatus({ ...seat, status: "sold" }, { myHeldIds: ["held-1"] }),
    "sold"
  );
  assert.equal(
    adaptSeatStatus({ ...seat, status: "unavailable" }, { myHeldIds: ["held-1"] }),
    "sold"
  );
  assert.equal(
    adaptSeatStatus(
      { ...seat, status: "available", assigned_invitation_id: "inv-1" },
      { myHeldIds: ["held-1"] }
    ),
    "sold"
  );
});

test("expired holds map to available, with a 30 s clock-skew grace", () => {
  const now = Date.now();
  const past = (ms) => new Date(now - ms).toISOString();
  const future = (ms) => new Date(now + ms).toISOString();
  // Missing or unparsable timestamps are treated as expired.
  assert.equal(adaptSeatStatus({ status: "reserved", reserved_until: null }, { now }), "available");
  assert.equal(adaptSeatStatus({ status: "reserved", reserved_until: "junk" }, { now }), "available");
  // Long past → available.
  assert.equal(
    adaptSeatStatus({ status: "reserved", reserved_until: past(5 * 60 * 1000) }, { now }),
    "available"
  );
  // Within the grace window after expiry → still reserved (safe side).
  assert.equal(
    adaptSeatStatus({ status: "reserved", reserved_until: past(EXPIRED_GRACE_MS - 5000) }, { now }),
    "reserved"
  );
  // Active hold → reserved.
  assert.equal(
    adaptSeatStatus({ status: "reserved", reserved_until: future(60 * 1000) }, { now }),
    "reserved"
  );
  // Fixture's expired seat flips through adaptPlan too.
  const plan = adaptPlan(fixture, { now });
  const byId = new Map(plan.seats.map((s) => [s.id, s]));
  assert.equal(byId.get("ffffffff-ffff-4fff-ffff-ffffffffffff").status, "available");
});

test("status labels name the lock reason without changing gating", () => {
  assert.equal(
    adaptStatusLabel({ status: "available", assigned_invitation_id: "inv-1" }),
    "Held for a guest"
  );
  assert.equal(adaptStatusLabel({ status: "unavailable" }), "Unavailable");
  assert.equal(
    adaptStatusLabel({ status: "reserved", reserved_until: new Date().toISOString() }),
    "On hold"
  );
  assert.equal(adaptStatusLabel({ status: "sold" }), undefined);
  assert.equal(adaptStatusLabel({ status: "available" }), undefined);
  const plan = adaptPlan(fixture);
  const byId = new Map(plan.seats.map((s) => [s.id, s]));
  assert.equal(byId.get("cccccccc-cccc-4ccc-cccc-cccccccccccc").statusLabel, "Held for a guest");
  assert.equal(byId.get("bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb").statusLabel, "Unavailable");
});

test("table capacity prefers the organizer object, falls back to chairs", () => {
  const plan = adaptPlan(fixture);
  assert.equal(plan.tables[0].capacity, 8);
  const noCap = adaptPlan({
    ...fixture,
    venue_objects: fixture.venue_objects.map((o) =>
      o.type === "table" ? { ...o, table_capacity: undefined } : o
    ),
  });
  assert.equal(
    noCap.tables[0].capacity,
    noCap.seats.filter((s) => s.tableId === TABLE_ID).length
  );
});

test("empty plan maps to an empty picker plan (tickets-only flow upstream)", () => {
  const plan = adaptPlan({ ...fixture, seats: [], venue_objects: [] });
  assert.deepEqual(plan.seats, []);
  assert.deepEqual(plan.tables, []);
  assert.deepEqual(plan.stages ?? [], []);
});

test("picker gate requires flag, plan, size cap and adapter success", () => {
  const ok = { flagOn: true, hasPlan: true, seatCount: 125, adapterOk: true };
  assert.equal(shouldUse3DPicker(ok), true);
  assert.equal(PICKER_MAX_SEATS, 2500);
  // Flag off → SeatMap (default state).
  assert.equal(shouldUse3DPicker({ ...ok, flagOn: false }), false);
  // No plan → SeatMap (tickets-only flow upstream; picker never mounts).
  assert.equal(shouldUse3DPicker({ ...ok, hasPlan: false }), false);
  // Oversized plan → SeatMap.
  assert.equal(shouldUse3DPicker({ ...ok, seatCount: 2500 }), true);
  assert.equal(shouldUse3DPicker({ ...ok, seatCount: 2501 }), false);
  // Adapter failure → SeatMap.
  assert.equal(shouldUse3DPicker({ ...ok, adapterOk: false }), false);
});
