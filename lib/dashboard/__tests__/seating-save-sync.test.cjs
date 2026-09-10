/**
 * lib/dashboard/__tests__/seating-save-sync.test.cjs
 *
 * Regression tests for the seating save failure where a second added row
 * was not persisted (and saves surfaced mixed 200/500s).
 *
 * Root causes fixed:
 * 1. The save endpoint split seats into updates vs inserts by id PREFIX
 *    (`temp-`/`new-`), so `dup-…` duplicated seats fell into the update
 *    path and were silently never inserted.
 * 2. The canvas never adopted server-issued ids after a save, so the next
 *    full-layout save re-sent already-persisted rows as brand-new inserts,
 *    colliding with UNIQUE(layout_id, section, row_label, seat_number).
 * 3. Seat insert/update database errors were swallowed and reported as
 *    success, hiding the loss.
 *
 * Fix contract (lib/seating.ts): any id that is not a UUID is an insert;
 * only UUIDs address existing rows. These tests pin that contract plus the
 * generation fallbacks the client relies on. Follows the repo's node:test +
 * TS-transpile convention.
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
  // Partition helpers never touch Supabase; stub the engine's admin import.
  if (request === "@/lib/supabase-admin" || request.endsWith("lib/supabase-admin")) {
    return { createSupabaseAdmin: () => null };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { isPersistedSeatId, partitionSeatSaves } = require("@/lib/seating.ts");
const {
  rowLabelToIndex,
  nextRowStartIndex,
  sectionBottomEdge,
  nextTableNumber,
} = require("@/lib/seating.ts");

const UUID_A = "b43e4ceb-118b-4106-9754-b604060e9d6a";
const UUID_B = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

test("real UUIDs address persisted rows", () => {
  assert.equal(isPersistedSeatId(UUID_A), true);
  assert.equal(isPersistedSeatId(UUID_B), true);
});

test("every client temp-id shape is an insert, never an update target", () => {
  for (const id of [
    "new-1756543200000-0",
    "new-table-1756543200000-3",
    "dup-1756543200000-abc12",
    "temp-1",
    "",
    undefined,
    null,
    42,
  ]) {
    assert.equal(isPersistedSeatId(id), false, `id ${JSON.stringify(id)} must be an insert`);
  }
});

test("full-layout payload partitions by id shape, not prefix", () => {
  const row1 = { id: UUID_A, section: "Section A", row_label: "A", seat_number: 1 };
  const row1dup = { id: "dup-1-abc", section: "Section A", row_label: "A", seat_number: 1 };
  const row2 = { id: "new-2-0", section: "Section B", row_label: "A", seat_number: 1 };
  const { updates, inserts } = partitionSeatSaves([row1, row1dup, row2]);
  assert.deepEqual(updates, [row1]);
  assert.deepEqual(inserts, [row1dup, row2]);
});

test("second-save scenario: adopted UUIDs update, fresh temp ids insert", () => {
  // After save 1 + server-truth adoption, Row 1 carries real UUIDs; newly
  // added Row 2 carries temp ids. Nothing is re-inserted as a duplicate.
  const savedRow1 = { id: UUID_A, section: "Section A", row_label: "A", seat_number: 1 };
  const freshRow2 = { id: "new-99-0", section: "Section B", row_label: "A", seat_number: 1 };
  const { updates, inserts } = partitionSeatSaves([savedRow1, freshRow2]);
  assert.equal(updates.length, 1);
  assert.equal(inserts.length, 1);
  assert.equal(updates[0].id, UUID_A);
  assert.equal(inserts[0].id, "new-99-0");
});

test("empty payload partitions cleanly", () => {
  assert.deepEqual(partitionSeatSaves([]), { updates: [], inserts: [] });
});

test("row labels map back to generation indexes", () => {
  assert.equal(rowLabelToIndex("A"), 0);
  assert.equal(rowLabelToIndex("C"), 2);
  assert.equal(rowLabelToIndex("Z"), 25);
  assert.equal(rowLabelToIndex("27"), 26);
  assert.equal(rowLabelToIndex(""), null);
  assert.equal(rowLabelToIndex(null), null);
  assert.equal(rowLabelToIndex("VIP"), null);
});

test("appending rows continues past existing labels (no regenerated collision)", () => {
  const sectionA = [];
  for (const row of ["A", "B", "C"]) {
    for (let n = 1; n <= 10; n++) sectionA.push({ section: "Section A", row_label: row, seat_number: n });
  }
  assert.equal(nextRowStartIndex(sectionA, "Section A"), 3);
  // A new section name starts from row A.
  assert.equal(nextRowStartIndex(sectionA, "Section B"), 0);
  // Other sections do not affect the computation.
  assert.equal(
    nextRowStartIndex([...sectionA, { section: "Section B", row_label: "Z", seat_number: 1 }], "Section A"),
    3
  );
});

test("appended rows land below existing rows", () => {
  assert.equal(
    sectionBottomEdge([
      { section: "Section A", y: 150, height: 26 },
      { section: "Section A", y: 188, height: 26 },
    ]),
    214
  );
  assert.equal(sectionBottomEdge([]), null);
});

test("table numbers default to the next free number", () => {
  assert.equal(nextTableNumber([], []), "1");
  assert.equal(
    nextTableNumber(
      [{ table_number: "1" }, { table_number: "2" }],
      [{ type: "table", table_number: "2" }]
    ),
    "3"
  );
  // Non-numeric custom numbers are ignored; non-table objects are ignored.
  assert.equal(
    nextTableNumber([{ table_number: "VIP" }], [{ type: "stage", table_number: "9" }]),
    "1"
  );
});

test("end-to-end: Row 1 save, then Row 2 append produces no duplicate keys", () => {
  // Save 1: fresh Section A, rows A-C x 10 seats (all temp ids).
  const batch1 = [];
  for (const row of ["A", "B", "C"]) {
    for (let n = 1; n <= 10; n++) {
      batch1.push({ id: `new-1-${row}-${n}`, section: "Section A", row_label: row, seat_number: n });
    }
  }
  // Server persists; client adopts UUIDs (simulated).
  const persisted = batch1.map((s, i) => ({
    ...s,
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  }));
  // Save 2: user re-opens the modal for Section A; labels continue at D.
  const start = nextRowStartIndex(persisted, "Section A");
  assert.equal(start, 3);
  const labels = ["D", "E", "F"];
  const batch2 = [];
  labels.forEach((row) => {
    for (let n = 1; n <= 10; n++) {
      batch2.push({ id: `new-2-${row}-${n}`, section: "Section A", row_label: row, seat_number: n });
    }
  });
  const payload = [...persisted, ...batch2];
  const keys = payload.map((s) => `${s.section}/${s.row_label}/${s.seat_number}`);
  assert.equal(new Set(keys).size, keys.length, "no duplicate logical keys across saves");
  const { updates, inserts } = partitionSeatSaves(payload);
  assert.equal(updates.length, 30);
  assert.equal(inserts.length, 30);
});

test("delete and re-add in same session: deleteIds correctly computes doomed UUIDs", () => {
  const persistedSeat = { id: UUID_A, section: "Section A", row_label: "A", seat_number: 1 };
  const lastSavedIds = new Set([UUID_A, UUID_B]);
  
  // User deleted seat B and recreated seat B with temp id
  const currentSeats = [
    persistedSeat,
    { id: "new-readded-b-1", section: "Section A", row_label: "B", seat_number: 1 },
  ];
  
  const currentIds = new Set(currentSeats.map((s) => s.id));
  const deleteIds = [...lastSavedIds].filter(
    (id) => isPersistedSeatId(id) && !currentIds.has(id)
  );
  
  assert.deepEqual(deleteIds, [UUID_B]);
  const { updates, inserts } = partitionSeatSaves(currentSeats);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, UUID_A);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].id, "new-readded-b-1");
});

test("property edits preserve persistent UUIDs and strictly partition as updates", () => {
  const seat = {
    id: UUID_A,
    section: "Main Section",
    row_label: "A",
    seat_number: 1,
    is_vip: false,
    x: 100,
    y: 100,
  };
  
  // User moves seat and marks it as VIP
  const editedSeat = {
    ...seat,
    is_vip: true,
    x: 150,
    y: 150,
    price_override: 150.0,
  };
  
  const { updates, inserts } = partitionSeatSaves([editedSeat]);
  assert.equal(updates.length, 1);
  assert.equal(inserts.length, 0);
  assert.equal(updates[0].id, UUID_A);
  assert.equal(updates[0].is_vip, true);
  assert.equal(updates[0].price_override, 150.0);
});

test("duplicate logical keys in insert payload are detected", () => {
  const insertRows = [
    { section: "Section A", row_label: "A", seat_number: 1 },
    { section: "Section A", row_label: "A", seat_number: 2 },
    { section: "Section A", row_label: "A", seat_number: 1 }, // duplicate!
  ];
  
  const seenKeys = new Set();
  let duplicateFound = false;
  for (const row of insertRows) {
    const key = `${row.section}:::${row.row_label}:::${row.seat_number}`;
    if (seenKeys.has(key)) {
      duplicateFound = true;
      break;
    }
    seenKeys.add(key);
  }
  
  assert.equal(duplicateFound, true);
});

