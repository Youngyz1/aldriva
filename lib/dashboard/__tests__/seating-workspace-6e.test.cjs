"use strict";

// Phase 6E — Unified seating workspace: shared plan summary.
//
// The workspace (Manual / AI / Visual) describes one SeatGeometry[] through
// summarizeSeatingPlan(). These tests pin its semantics and prove parity with
// the long-standing SeatingManagerClient inline computation it replaces, so
// the 6E refactor cannot silently change organizer-facing counts.

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { describe, it } = require("node:test");
const ts = require("typescript");

// --- TypeScript + @/ alias resolver (mirrors ai-seating-assistant.test.cjs) ---
const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;
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

const { summarizeSeatingPlan } = require("@/lib/seating-summary.ts");

const FUTURE = new Date(Date.now() + 3600_000).toISOString();
const PAST = new Date(Date.now() - 3600_000).toISOString();

function seat(over = {}) {
  return {
    status: "available",
    reserved_until: null,
    assigned_invitation_id: null,
    is_vip: false,
    is_accessible: false,
    ...over,
  };
}

// The pre-6E inline computation from SeatingManagerClient (must stay identical).
function legacyStats(seats) {
  const isActive = (s) =>
    s.status === "reserved" && !!s.reserved_until && new Date(s.reserved_until) > new Date();
  return {
    total: seats.length,
    sold: seats.filter((s) => s.status === "sold").length,
    reserved: seats.filter(isActive).length,
    guestAssigned: seats.filter((s) => !!s.assigned_invitation_id).length,
    vip: seats.filter((s) => s.is_vip).length,
    accessible: seats.filter((s) => s.is_accessible).length,
    available: seats.filter(
      (s) => s.status === "available" && !s.assigned_invitation_id && !isActive(s)
    ).length,
  };
}

const FIXTURE = [
  seat(),
  seat(),
  seat({ status: "sold" }),
  seat({ status: "reserved", reserved_until: FUTURE }),
  seat({ status: "reserved", reserved_until: PAST }),
  seat({ assigned_invitation_id: "inv-1" }),
  seat({ is_vip: true }),
  seat({ is_vip: true, is_accessible: true }),
  seat({ status: "unavailable" }),
];

describe("Phase 6E — unified seating summary", () => {
  it("A: mixed fixture produces exact counts", () => {
    const s = summarizeSeatingPlan(FIXTURE);
    assert.equal(s.total, 9);
    assert.equal(s.sold, 1);
    assert.equal(s.reserved, 1, "only the future-dated hold counts as reserved");
    assert.equal(s.guestAssigned, 1);
    assert.equal(s.vip, 2);
    assert.equal(s.accessible, 1);
    assert.equal(s.regular, 7);
  });

  it("B: available excludes assigned, sold, reserved and unavailable", () => {
    const s = summarizeSeatingPlan(FIXTURE);
    // 9 total - 1 sold - 1 active-reserved - 1 assigned - 1 unavailable - 1 expired-hold
    // expired holds keep status reserved so they are not available either
    assert.equal(s.available, 4);
  });

  it("C: parity with legacy inline computation on fixture and edge cases", () => {
    for (const seats of [
      FIXTURE,
      [],
      [seat()],
      [seat({ status: "sold", assigned_invitation_id: "x", is_vip: true })],
      [seat({ status: "reserved", reserved_until: FUTURE, assigned_invitation_id: "y" })],
    ]) {
      const next = summarizeSeatingPlan(seats);
      const prev = legacyStats(seats);
      for (const k of Object.keys(prev)) assert.equal(next[k], prev[k], `field ${k}`);
    }
  });

  it("D: empty / null inputs are safe", () => {
    assert.deepEqual(summarizeSeatingPlan([]), {
      total: 0, available: 0, reserved: 0, sold: 0, guestAssigned: 0,
      vip: 0, accessible: 0, regular: 0, tables: 0,
    });
    assert.equal(summarizeSeatingPlan(null).total, 0);
    assert.equal(summarizeSeatingPlan(undefined).total, 0);
  });

  it("E: tables counted from venue objects only", () => {
    const objects = [{ type: "table" }, { type: "table" }, { type: "stage" }, {}];
    assert.equal(summarizeSeatingPlan(FIXTURE, objects).tables, 2);
    assert.equal(summarizeSeatingPlan(FIXTURE).tables, 0);
    assert.equal(summarizeSeatingPlan(FIXTURE, null).tables, 0);
  });

  it("F: expired holds are not reserved but keep their row out of available", () => {
    const s = summarizeSeatingPlan([seat({ status: "reserved", reserved_until: PAST })]);
    assert.equal(s.reserved, 0);
    assert.equal(s.available, 0);
    assert.equal(s.total, 1);
  });

  it("G: assigned available seats count as assigned, not available", () => {
    const s = summarizeSeatingPlan([seat({ assigned_invitation_id: "inv-9" })]);
    assert.equal(s.guestAssigned, 1);
    assert.equal(s.available, 0);
  });

  it("H: input array is never mutated", () => {
    const before = JSON.stringify(FIXTURE);
    summarizeSeatingPlan(FIXTURE, [{ type: "table" }]);
    assert.equal(JSON.stringify(FIXTURE), before);
  });
});
