/**
 * lib/__tests__/rental-pickup-guards.test.cjs
 *
 * Unit tests for the pickup guard logic inside updateBookingStatus.
 * Calls the REAL production module lib/rental/pickup-guard.ts (compiled at test time).
 *
 * Guards enforced:
 *   1. Vehicle must be assigned (vehicle_id non-null/non-empty).
 *   2. Pickup cannot be recorded more than 4 hours before the scheduled
 *      start time unless an override reason (≥ 5 chars) is supplied.
 *   3. With a valid override reason the action proceeds and the reason is
 *      appended to the booking notes.
 */

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

// Load and execute the real production pickup guard module
const guardSrc = fs.readFileSync(path.join(ROOT, "lib/rental/pickup-guard.ts"), "utf8");
const transpiled = ts.transpileModule(guardSrc, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

const mod = { exports: {} };
const execFn = new Function("module", "exports", transpiled);
execFn(mod, mod.exports);

const { validatePickupGuard } = mod.exports;
assert.equal(typeof validatePickupGuard, "function", "validatePickupGuard must be exported from lib/rental/pickup-guard.ts");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const FUTURE_START = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(); // +10h from now
const NEAR_START = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();   // +2h from now
const PAST_START = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();   // -1h (already started)

describe("validatePickupGuard – vehicle not assigned", () => {
  it("returns VEHICLE_NOT_ASSIGNED when vehicle_id is null", () => {
    const row = { vehicle_id: null, starts_at: NEAR_START, notes: null };
    const result = validatePickupGuard(row, new Date(), undefined);
    assert.equal(result.success, false);
    assert.equal(result.code, "VEHICLE_NOT_ASSIGNED");
    assert.ok(result.error && result.error.includes("assigned"));
  });

  it("returns VEHICLE_NOT_ASSIGNED when vehicle_id is empty string", () => {
    const row = { vehicle_id: "", starts_at: NEAR_START, notes: null };
    const result = validatePickupGuard(row, new Date(), undefined);
    assert.equal(result.success, false);
    assert.equal(result.code, "VEHICLE_NOT_ASSIGNED");
  });
});

describe("validatePickupGuard – too early without override", () => {
  it("returns TOO_EARLY_FOR_PICKUP when now is > 4 h before start and no reason given", () => {
    const row = { vehicle_id: "veh-001", starts_at: FUTURE_START, notes: null };
    const result = validatePickupGuard(row, new Date(), undefined);
    assert.equal(result.success, false);
    assert.equal(result.code, "TOO_EARLY_FOR_PICKUP");
    assert.ok(result.error && result.error.includes("4 hours"));
  });

  it("returns TOO_EARLY_FOR_PICKUP when override reason is fewer than 5 chars", () => {
    const row = { vehicle_id: "veh-001", starts_at: FUTURE_START, notes: null };
    const result = validatePickupGuard(row, new Date(), "ok");
    assert.equal(result.success, false);
    assert.equal(result.code, "TOO_EARLY_FOR_PICKUP");
  });
});

describe("validatePickupGuard – too early WITH override", () => {
  it("succeeds when override reason has >= 5 chars and appends audit note to notes (null notes)", () => {
    const row = { vehicle_id: "veh-001", starts_at: FUTURE_START, notes: null };
    const now = new Date();
    const result = validatePickupGuard(row, now, "Customer flight departs early");
    assert.equal(result.success, true);
    assert.ok(result.notesOverride, "should have notesOverride");
    assert.ok(result.notesOverride.includes("[Early pickup override"));
    assert.ok(result.notesOverride.includes("Customer flight departs early"));
  });

  it("appends audit note after existing notes", () => {
    const row = { vehicle_id: "veh-001", starts_at: FUTURE_START, notes: "Some prior note." };
    const result = validatePickupGuard(row, new Date(), "Operational requirement");
    assert.equal(result.success, true);
    assert.ok(result.notesOverride.startsWith("Some prior note.\n"));
    assert.ok(result.notesOverride.includes("Operational requirement"));
  });
});

describe("validatePickupGuard – within 4-hour window", () => {
  it("succeeds without override when now is within 4 hours of start", () => {
    const row = { vehicle_id: "veh-001", starts_at: NEAR_START, notes: null };
    const result = validatePickupGuard(row, new Date(), undefined);
    assert.equal(result.success, true);
    assert.equal(result.notesOverride, undefined);
  });

  it("succeeds without override when start time is in the past", () => {
    const row = { vehicle_id: "veh-001", starts_at: PAST_START, notes: null };
    const result = validatePickupGuard(row, new Date(), undefined);
    assert.equal(result.success, true);
  });
});
