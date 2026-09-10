/**
 * lib/dashboard/__tests__/manual-seating-builder.test.cjs
 *
 * Phase 6C: Comprehensive test suite for the Manual Seating Builder.
 * Tests validate:
 * - Layout protection logic (protecting sold or guest-assigned seats against destruction)
 * - Safe layout combination (Append vs. Replace seat diffing, deleteIds computation)
 * - Multi-section manual builder configurations (Auditorium Rows + Banquet Tables)
 * - Configuration validation integration (zero counts, empty names, duplicate names)
 * - UUID preservation semantics across appended manual sections
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
  if (request === "@/lib/supabase-admin" || request.endsWith("lib/supabase-admin")) {
    return { createSupabaseAdmin: () => null };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  generateCanonicalSeatingPlan,
  validateSeatingPlanConfig,
  checkLayoutProtection,
  combineSeatingForSave,
} = require("@/lib/seating");

// Helper to create mock seat
function createMockSeat(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    event_id: "evt-test-1",
    layout_id: "lay-test-1",
    section: "Main Floor",
    row_label: "A",
    seat_number: 1,
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
    y: 100,
    width: 32,
    height: 32,
    rotation: 0,
    object_type: "seat",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Protection Tests (Sold & Assigned Seat Safety)
// ─────────────────────────────────────────────────────────────────────────────

test("checkLayoutProtection allows replacement when no seats exist", () => {
  const result = checkLayoutProtection([], "replace");
  assert.equal(result.canReplace, true);
  assert.equal(result.protectedCount, 0);
  assert.equal(result.warningMessage, undefined);
});

test("checkLayoutProtection allows replacement when existing seats are all unassigned available", () => {
  const seats = [
    createMockSeat({ id: "22222222-2222-4222-8222-222222222222", status: "available" }),
    createMockSeat({ id: "33333333-3333-4333-8333-333333333333", status: "reserved" }),
  ];
  const result = checkLayoutProtection(seats, "replace");
  assert.equal(result.canReplace, true);
  assert.equal(result.protectedCount, 0);
});

test("checkLayoutProtection blocks replacement when seats are sold", () => {
  const seats = [
    createMockSeat({ id: "44444444-4444-4444-8444-444444444444", status: "sold" }),
    createMockSeat({ id: "55555555-5555-4555-8555-555555555555", status: "available" }),
  ];
  const result = checkLayoutProtection(seats, "replace");
  assert.equal(result.canReplace, false);
  assert.equal(result.protectedCount, 1);
  assert.match(result.warningMessage || "", /Cannot replace layout: 1 seat\(s\) are already sold/);
});

test("checkLayoutProtection blocks replacement when seats are assigned to guests", () => {
  const seats = [
    createMockSeat({
      id: "66666666-6666-4666-8666-666666666666",
      status: "available",
      assigned_invitation_id: "inv-uuid-1",
    }),
  ];
  const result = checkLayoutProtection(seats, "replace");
  assert.equal(result.canReplace, false);
  assert.equal(result.protectedCount, 1);
  assert.match(result.warningMessage || "", /assigned to active guests/);
});

test("checkLayoutProtection always permits append mode even with sold and assigned seats", () => {
  const seats = [
    createMockSeat({ id: "77777777-7777-4777-8777-777777777777", status: "sold" }),
    createMockSeat({
      id: "88888888-8888-4888-8888-888888888888",
      assigned_invitation_id: "inv-guest-2",
    }),
  ];
  const result = checkLayoutProtection(seats, "append");
  assert.equal(result.canReplace, true);
  assert.equal(result.protectedCount, 2);
  assert.equal(result.warningMessage, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Safe Layout Combination (Append vs Replace)
// ─────────────────────────────────────────────────────────────────────────────

test("combineSeatingForSave: Replace mode collects all persisted deleteIds and replaces layout", () => {
  const existingSeats = [
    createMockSeat({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    createMockSeat({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
    createMockSeat({ id: "client-temp-123" }), // Non-persisted should NOT be in deleteIds
  ];
  const generatedPlan = generateCanonicalSeatingPlan({
    eventId: "evt-1",
    sections: [{ name: "New Balcony", mode: "rows", rowCount: 1, seatsPerRow: 5 }],
  });

  const combined = combineSeatingForSave({
    saveMode: "replace",
    existingSeats,
    existingVenueObjects: [{ id: "old-stage", type: "stage", name: "Old Stage", label: "Stage", x: 0, y: 0, width: 100, height: 50 }],
    generatedSeats: generatedPlan.seats,
    generatedVenueObjects: generatedPlan.venueObjects,
    generatedSections: generatedPlan.sections,
  });

  assert.equal(combined.deleteIds.length, 2);
  assert.ok(combined.deleteIds.includes("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
  assert.ok(combined.deleteIds.includes("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"));
  assert.equal(combined.seats.length, 5);
  assert.equal(combined.seats[0].section, "New Balcony");
});

test("combineSeatingForSave: Append mode does not delete any seats and preserves existing items", () => {
  const existingSeats = [
    createMockSeat({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", section: "Main", row_label: "A", seat_number: 1 }),
    createMockSeat({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", section: "Main", row_label: "A", seat_number: 2 }),
  ];
  const existingVenueObjects = [
    { id: "stage-1", type: "stage", name: "Stage", label: "STAGE", x: 100, y: 50, width: 200, height: 60 },
  ];

  const generatedPlan = generateCanonicalSeatingPlan({
    eventId: "evt-1",
    existingSeats,
    existingVenueObjects,
    sections: [{ name: "Main", mode: "rows", rowCount: 1, seatsPerRow: 3 }],
  });

  const combined = combineSeatingForSave({
    saveMode: "append",
    existingSeats,
    existingVenueObjects,
    generatedSeats: generatedPlan.seats,
    generatedVenueObjects: generatedPlan.venueObjects,
    generatedSections: generatedPlan.sections,
  });

  assert.equal(combined.deleteIds.length, 0);
  assert.equal(combined.seats.length, 5); // 2 existing + 3 newly appended
  assert.equal(combined.venueObjects.length, 1);
  assert.equal(combined.venueObjects[0].id, "stage-1");

  // Verify existing seat UUIDs are preserved
  const seatA1 = combined.seats.find((s) => s.row_label === "A" && s.seat_number === 1);
  assert.equal(seatA1.id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");

  // Verify newly appended row B seats have id undefined (ready for DB insertion)
  const seatB1 = combined.seats.find((s) => s.row_label === "B" && s.seat_number === 1);
  assert.ok(seatB1);
  assert.equal(seatB1.id, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Multi-Section Manual Configuration Validation
// ─────────────────────────────────────────────────────────────────────────────

test("validateSeatingPlanConfig rejects non-positive rowCount in rows mode", () => {
  const validation = validateSeatingPlanConfig({
    eventId: "evt-1",
    sections: [{ name: "Orchestra", mode: "rows", rowCount: 0, seatsPerRow: 10 }],
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("Row count must be a positive integer")));
});

test("validateSeatingPlanConfig rejects non-positive tableCount in tables mode", () => {
  const validation = validateSeatingPlanConfig({
    eventId: "evt-1",
    sections: [{ name: "VIP Tables", mode: "tables", tableCount: 0, seatsPerTable: 8 }],
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("Table count must be a positive integer")));
});

test("validateSeatingPlanConfig rejects empty section name", () => {
  const validation = validateSeatingPlanConfig({
    eventId: "evt-1",
    sections: [{ name: "   ", mode: "rows", rowCount: 2, seatsPerRow: 5 }],
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("Section name must be a non-empty string")));
});

test("generateCanonicalSeatingPlan rejects colliding manual section configs", () => {
  assert.throws(
    () =>
      generateCanonicalSeatingPlan({
        eventId: "evt-1",
        sections: [
          { name: "Balcony", mode: "rows", rowCount: 1, seatsPerRow: 5, startRowIndex: 0 },
          { name: "Balcony", mode: "rows", rowCount: 1, seatsPerRow: 5, startRowIndex: 0 },
        ],
      }),
    (err) => err.message.includes("Duplicate logical seat key")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Complex Mixed Manual Seating Plan Generation
// ─────────────────────────────────────────────────────────────────────────────

test("Generates complex mixed plan with VIP rows, General rows, and Banquet tables", () => {
  const plan = generateCanonicalSeatingPlan({
    eventId: "evt-1",
    sections: [
      {
        name: "VIP Orchestra",
        mode: "rows",
        rowCount: 2,
        seatsPerRow: 10,
        isVip: true,
      },
      {
        name: "General Balcony",
        mode: "rows",
        rowCount: 3,
        seatsPerRow: 20,
        isVip: false,
      },
      {
        name: "Gala Banquet",
        mode: "tables",
        tableCount: 4,
        seatsPerTable: 6,
        tableShape: "round",
        isVip: false,
      },
    ],
  });

  // VIP rows: 2 * 10 = 20 seats
  // General rows: 3 * 20 = 60 seats
  // Gala banquet: 4 * 6 = 24 seats
  // Total = 104 seats
  assert.equal(plan.summary.totalSeats, 104);
  assert.equal(plan.summary.vipSeats, 20);
  assert.equal(plan.summary.regularSeats, 84);
  assert.equal(plan.summary.tableCount, 4);
  assert.equal(plan.summary.sectionCount, 3);

  // Table venue objects
  assert.equal(plan.venueObjects.length, 4);
  assert.equal(plan.venueObjects[0].type, "table");
  assert.equal(plan.venueObjects[0].table_capacity, 6);
  assert.equal(plan.venueObjects[0].table_shape, "round");

  // Seats geometry and uniqueness
  const seatKeys = new Set(plan.seats.map((s) => `${s.section}:::${s.row_label}:::${s.seat_number}`));
  assert.equal(seatKeys.size, 104);
});
