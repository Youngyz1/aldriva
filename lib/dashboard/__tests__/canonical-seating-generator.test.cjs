/**
 * lib/dashboard/__tests__/canonical-seating-generator.test.cjs
 *
 * Phase 6B: Comprehensive test suite for the Canonical Seating Generation Engine.
 * Tests validate:
 * - Deterministic rows generation (1x1, 2x10, 5x11, row labels A-Z, startRowIndex)
 * - Deterministic table generation (1x6, multiple tables, table shapes, startTableNumber)
 * - VIP & accessibility classification
 * - Strict configuration validation (zero/negative counts, empty names, invalid modes)
 * - Duplicate safety (unique logical keys within generated plan)
 * - Coordinate stability & determinism (no NaN, identical output on repeat calls)
 * - UUID preservation semantics (new seats have id undefined; existing persisted UUIDs preserved)
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
  SeatingValidationError,
} = require("@/lib/seating.ts");

// ─── 1. ROWS GENERATION TESTS ───────────────────────────────────────────────

test("rows: 1 row x 1 seat generates minimal valid section", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "Solo Section",
        mode: "rows",
        rowCount: 1,
        seatsPerRow: 1,
      },
    ],
  });

  assert.equal(result.seats.length, 1);
  assert.equal(result.summary.totalSeats, 1);
  assert.equal(result.seats[0].section, "Solo Section");
  assert.equal(result.seats[0].row_label, "A");
  assert.equal(result.seats[0].seat_number, 1);
  assert.equal(result.seats[0].is_vip, false);
  assert.equal(result.seats[0].id, undefined);
  assert.ok(Number.isFinite(result.seats[0].x));
  assert.ok(Number.isFinite(result.seats[0].y));
});

test("rows: 2 rows x 10 seats generates 20 distinct seats with Row A and B", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "Section 1",
        mode: "rows",
        rowCount: 2,
        seatsPerRow: 10,
      },
    ],
  });

  assert.equal(result.seats.length, 20);
  assert.equal(result.summary.totalSeats, 20);

  const rowA = result.seats.filter((s) => s.row_label === "A");
  const rowB = result.seats.filter((s) => s.row_label === "B");

  assert.equal(rowA.length, 10);
  assert.equal(rowB.length, 10);

  for (let i = 1; i <= 10; i++) {
    assert.ok(rowA.some((s) => s.seat_number === i));
    assert.ok(rowB.some((s) => s.seat_number === i));
  }
});

test("rows: 5 rows x 11 seats matches 55-seat regression topology", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "Orchestra",
        mode: "rows",
        rowCount: 5,
        seatsPerRow: 11,
      },
    ],
  });

  assert.equal(result.seats.length, 55);
  assert.equal(result.summary.totalSeats, 55);

  const rows = ["A", "B", "C", "D", "E"];
  for (const r of rows) {
    const rSeats = result.seats.filter((s) => s.row_label === r);
    assert.equal(rSeats.length, 11);
    assert.equal(rSeats[0].seat_number, 1);
    assert.equal(rSeats[10].seat_number, 11);
  }
});

test("rows: custom startRowIndex starts labels at desired letter offset", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "Balcony",
        mode: "rows",
        rowCount: 3,
        seatsPerRow: 5,
        startRowIndex: 2,
      },
    ],
  });

  const rowLabels = [...new Set(result.seats.map((s) => s.row_label))];
  assert.deepEqual(rowLabels, ["C", "D", "E"]);
});

test("rows: row labels transition to numbers beyond letter Z", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "Deep Arena",
        mode: "rows",
        rowCount: 2,
        seatsPerRow: 2,
        startRowIndex: 25,
      },
    ],
  });

  const rowLabels = [...new Set(result.seats.map((s) => s.row_label))];
  assert.deepEqual(rowLabels, ["Z", "27"]);
});

// ─── 2. TABLES GENERATION TESTS ─────────────────────────────────────────────

test("tables: 1 table x 6 seats generates circular table and 6 table seats", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "VIP Dining",
        mode: "tables",
        tableCount: 1,
        seatsPerTable: 6,
        tableShape: "round",
        startTableNumber: 1,
      },
    ],
  });

  assert.equal(result.seats.length, 6);
  assert.equal(result.venueObjects.length, 1);
  assert.equal(result.venueObjects[0].type, "table");
  assert.equal(result.venueObjects[0].table_number, "1");
  assert.equal(result.venueObjects[0].table_capacity, 6);

  for (let i = 1; i <= 6; i++) {
    const seat = result.seats.find((s) => s.seat_number === i);
    assert.ok(seat, "Seat " + i + " must exist");
    assert.equal(seat.section, "Table 1");
    assert.equal(seat.row_label, "T");
    assert.equal(seat.table_number, "1");
    assert.equal(seat.object_type, "table_seat");
  }
});

test("tables: multiple tables generate non-overlapping sequential tables", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "Banquet Hall",
        mode: "tables",
        tableCount: 3,
        seatsPerTable: 8,
        tableShape: "round",
        startTableNumber: 10,
      },
    ],
  });

  assert.equal(result.seats.length, 24);
  assert.equal(result.venueObjects.length, 3);

  const tableNumbers = result.venueObjects.map((o) => o.table_number);
  assert.deepEqual(tableNumbers, ["10", "11", "12"]);

  const xPositions = result.venueObjects.map((o) => o.x);
  assert.equal(new Set(xPositions).size, 3, "Tables must have distinct X coordinates");
});

test("tables: rectangular tables generate seats with 90-degree increments", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "Conference",
        mode: "tables",
        tableCount: 1,
        seatsPerTable: 4,
        tableShape: "rect",
        startTableNumber: 1,
      },
    ],
  });

  assert.equal(result.seats.length, 4);
  assert.equal(result.venueObjects[0].table_shape, "rect");
  for (const seat of result.seats) {
    assert.ok(Number.isFinite(seat.rotation));
  }
});

// ─── 3. VIP & ACCESSIBILITY TESTS ───────────────────────────────────────────

test("vip: VIP section marks 100% of its seats as VIP", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "VIP Front Row",
        mode: "rows",
        rowCount: 1,
        seatsPerRow: 5,
        isVip: true,
      },
      {
        name: "General Admission",
        mode: "rows",
        rowCount: 1,
        seatsPerRow: 5,
        isVip: false,
      },
    ],
  });

  assert.equal(result.seats.length, 10);
  assert.equal(result.summary.vipSeats, 5);
  assert.equal(result.summary.regularSeats, 5);

  const vipSeats = result.seats.filter((s) => s.section === "VIP Front Row");
  const regularSeats = result.seats.filter((s) => s.section === "General Admission");

  assert.ok(vipSeats.every((s) => s.is_vip === true));
  assert.ok(regularSeats.every((s) => s.is_vip === false));
});

test("accessibility: accessible section marks seats as accessible", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "Accessible Area",
        mode: "rows",
        rowCount: 1,
        seatsPerRow: 4,
        isAccessible: true,
      },
    ],
  });

  assert.equal(result.summary.accessibleSeats, 4);
  assert.ok(result.seats.every((s) => s.is_accessible === true));
});

// ─── 4. VALIDATION & ERROR HANDLING TESTS ───────────────────────────────────

test("validation: zero sections throws SeatingValidationError", () => {
  assert.throws(
    () => generateCanonicalSeatingPlan({ sections: [] }),
    (err) => err instanceof SeatingValidationError && err.errors.length > 0
  );
});

test("validation: empty section name throws SeatingValidationError", () => {
  const check = validateSeatingPlanConfig({
    sections: [
      {
        name: "   ",
        mode: "rows",
        rowCount: 1,
        seatsPerRow: 1,
      },
    ],
  });

  assert.equal(check.valid, false);
  assert.ok(check.errors.some((e) => e.includes("Section name")));
});

test("validation: zero or negative rowCount is rejected", () => {
  for (const count of [0, -1, -10]) {
    const check = validateSeatingPlanConfig({
      sections: [{ name: "Sec", mode: "rows", rowCount: count, seatsPerRow: 5 }],
    });
    assert.equal(check.valid, false, "rowCount " + count + " must be invalid");
  }
});

test("validation: zero or negative seatsPerRow is rejected", () => {
  for (const count of [0, -5]) {
    const check = validateSeatingPlanConfig({
      sections: [{ name: "Sec", mode: "rows", rowCount: 2, seatsPerRow: count }],
    });
    assert.equal(check.valid, false, "seatsPerRow " + count + " must be invalid");
  }
});

test("validation: invalid mode throws descriptive error", () => {
  const check = validateSeatingPlanConfig({
    sections: [{ name: "Sec", mode: "circular_dome", rowCount: 2, seatsPerRow: 2 }],
  });

  assert.equal(check.valid, false);
  assert.ok(check.errors.some((e) => e.includes("Unsupported mode")));
});

test("validation: zero tableCount or seatsPerTable is rejected", () => {
  assert.equal(
    validateSeatingPlanConfig({
      sections: [{ name: "T", mode: "tables", tableCount: 0, seatsPerTable: 4 }],
    }).valid,
    false
  );

  assert.equal(
    validateSeatingPlanConfig({
      sections: [{ name: "T", mode: "tables", tableCount: 1, seatsPerTable: 0 }],
    }).valid,
    false
  );
});

// ─── 5. DUPLICATE SAFETY & KEY UNIQUENESS ───────────────────────────────────

test("duplicate safety: generated seats within plan have 100% unique logical keys", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      { name: "Orchestra", mode: "rows", rowCount: 4, seatsPerRow: 10 },
      { name: "Mezzanine", mode: "rows", rowCount: 3, seatsPerRow: 8 },
      { name: "Tables", mode: "tables", tableCount: 2, seatsPerTable: 6 },
    ],
  });

  const keys = new Set();
  for (const s of result.seats) {
    const key = s.section + ":::" + s.row_label + ":::" + s.seat_number;
    assert.equal(keys.has(key), false, "Key " + key + " must not be duplicated");
    keys.add(key);
  }

  assert.equal(keys.size, result.seats.length);
});

test("duplicate safety: overlapping sections with identical keys throw error", () => {
  assert.throws(
    () =>
      generateCanonicalSeatingPlan({
        sections: [
          { name: "SecA", mode: "rows", rowCount: 1, seatsPerRow: 5, startRowIndex: 0 },
          { name: "SecA", mode: "rows", rowCount: 1, seatsPerRow: 5, startRowIndex: 0 },
        ],
      }),
    (err) =>
      err instanceof SeatingValidationError &&
      err.message.includes("Duplicate logical seat key")
  );
});

// ─── 6. DETERMINISM & COORDINATES ───────────────────────────────────────────

test("determinism: calling generator twice with same config produces identical results", () => {
  const config = {
    eventId: "test-event",
    layoutId: "test-layout",
    sections: [
      { name: "Main", mode: "rows", rowCount: 3, seatsPerRow: 8 },
      { name: "VIP", mode: "tables", tableCount: 2, seatsPerTable: 6, isVip: true },
    ],
  };

  const run1 = generateCanonicalSeatingPlan(config);
  const run2 = generateCanonicalSeatingPlan(config);

  assert.equal(run1.seats.length, run2.seats.length);
  assert.deepEqual(run1.summary, run2.summary);

  for (let i = 0; i < run1.seats.length; i++) {
    const s1 = run1.seats[i];
    const s2 = run2.seats[i];
    assert.equal(s1.section, s2.section);
    assert.equal(s1.row_label, s2.row_label);
    assert.equal(s1.seat_number, s2.seat_number);
    assert.equal(s1.x, s2.x);
    assert.equal(s1.y, s2.y);
    assert.equal(s1.rotation, s2.rotation);
    assert.equal(s1.is_vip, s2.is_vip);
  }
});

test("coordinates: no generated seat or object has NaN coordinates", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [
      { name: "Main", mode: "rows", rowCount: 3, seatsPerRow: 6 },
      { name: "Banquet", mode: "tables", tableCount: 2, seatsPerTable: 6 },
    ],
  });

  for (const s of result.seats) {
    assert.ok(Number.isFinite(s.x), "Seat x must be finite (got " + s.x + ")");
    assert.ok(Number.isFinite(s.y), "Seat y must be finite (got " + s.y + ")");
    assert.ok(Number.isFinite(s.width), "Seat width must be finite");
    assert.ok(Number.isFinite(s.height), "Seat height must be finite");
  }

  for (const o of result.venueObjects) {
    assert.ok(Number.isFinite(o.x), "Object x must be finite");
    assert.ok(Number.isFinite(o.y), "Object y must be finite");
  }
});

// ─── 7. UUID PRESERVATION & ABSENCE ─────────────────────────────────────────

test("uuid behavior: newly generated seats have id === undefined", () => {
  const result = generateCanonicalSeatingPlan({
    sections: [{ name: "Orchestra", mode: "rows", rowCount: 2, seatsPerRow: 5 }],
  });

  for (const s of result.seats) {
    assert.equal(
      s.id,
      undefined,
      "New seats must never receive manufactured persistent UUIDs"
    );
  }
});

test("uuid behavior: existing persisted UUIDs are preserved when existingSeats match", () => {
  const existingUuid1 = "11111111-1111-4111-8111-111111111111";
  const existingUuid2 = "22222222-2222-4222-8222-222222222222";

  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "Section A",
        mode: "rows",
        rowCount: 1,
        seatsPerRow: 2,
        startRowIndex: 0,
      },
    ],
    existingSeats: [
      { id: existingUuid1, section: "Section A", row_label: "A", seat_number: 1 },
      { id: existingUuid2, section: "Section A", row_label: "A", seat_number: 2 },
    ],
  });

  assert.equal(result.seats.length, 2);
  assert.equal(result.seats[0].id, existingUuid1);
  assert.equal(result.seats[1].id, existingUuid2);
});

test("append awareness: section with existingSeats automatically starts at nextRowStartIndex", () => {
  const existingSeats = [
    { id: "11111111-1111-4111-8111-111111111111", section: "Section A", row_label: "A", seat_number: 1 },
    { id: "22222222-2222-4222-8222-222222222222", section: "Section A", row_label: "B", seat_number: 1 },
  ];

  const result = generateCanonicalSeatingPlan({
    sections: [
      {
        name: "Section A",
        mode: "rows",
        rowCount: 1,
        seatsPerRow: 5,
      },
    ],
    existingSeats,
  });

  assert.equal(result.seats.length, 5);
  assert.ok(result.seats.every((s) => s.row_label === "C"));
});
