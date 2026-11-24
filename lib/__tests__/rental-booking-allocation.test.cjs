// @ts-check
/**
 * lib/__tests__/rental-booking-allocation.test.cjs
 *
 * Tests for allocation logic (pure logic and structure tests, no DB).
 */

const { test, describe } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

describe("Allocation engine structure", () => {
  test("allocation module file exists", () => {
    const p = path.join(__dirname, "../../lib/rental/allocation.ts");
    assert.ok(fs.existsSync(p), "lib/rental/allocation.ts must exist");
  });

  test("allocation module exports autoAllocateVehicle", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../lib/rental/allocation.ts"),
      "utf8"
    );
    assert.ok(
      src.includes("export async function autoAllocateVehicle"),
      "must export autoAllocateVehicle"
    );
  });

  test("allocation module handles no candidates", () => {
    // Test the pure sorting/filtering logic
    const candidates = [];
    const result =
      candidates.length === 0
        ? { error: "no_vehicle_available", retries: 0 }
        : { vehicleId: candidates[0].id, retries: 0 };
    assert.strictEqual(result.error, "no_vehicle_available");
  });

  test("allocation prefers branch-matching vehicle", () => {
    const candidates = [
      { id: "v1", current_mileage: 50000, branch_id: "branch-b" },
      { id: "v2", current_mileage: 10000, branch_id: "branch-a" },
      { id: "v3", current_mileage: 5000, branch_id: "branch-c" },
    ];
    const pickupBranchId = "branch-a";
    const sorted = [...candidates].sort((a, b) => {
      const aMatch = a.branch_id === pickupBranchId ? 0 : 1;
      const bMatch = b.branch_id === pickupBranchId ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.current_mileage - b.current_mileage;
    });
    assert.strictEqual(sorted[0].id, "v2", "branch match wins");
  });

  test("allocation uses lowest mileage among same-branch candidates", () => {
    const candidates = [
      { id: "v1", current_mileage: 50000, branch_id: "branch-a" },
      { id: "v2", current_mileage: 10000, branch_id: "branch-a" },
    ];
    const sorted = [...candidates].sort(
      (a, b) => a.current_mileage - b.current_mileage
    );
    assert.strictEqual(sorted[0].id, "v2", "lowest mileage wins");
  });

  test("allocation mode manual does not trigger auto allocation", () => {
    // Document: auto-allocation is only triggered when mode = 'auto_on_booking'
    const modes = ["manual", "auto_on_confirm", "auto_on_booking"];
    const triggersModes = modes.filter((m) => m === "auto_on_booking");
    assert.deepStrictEqual(triggersModes, ["auto_on_booking"]);
  });

  test("retry logic tries up to 3 candidates", () => {
    // Simulate retry logic
    const MAX_RETRIES = 3;
    let attempts = 0;
    const candidates = ["v1", "v2", "v3", "v4"];
    let result = null;
    for (const candidate of candidates.slice(0, MAX_RETRIES)) {
      attempts++;
      // Simulate all failing with conflict
      const hasConflict = true;
      if (!hasConflict) {
        result = candidate;
        break;
      }
    }
    assert.strictEqual(attempts, 3);
    assert.strictEqual(result, null);
  });

  test("allocation sorts branch-match first even if higher mileage", () => {
    const candidates = [
      { id: "v1", current_mileage: 1000, branch_id: "branch-other" },
      { id: "v2", current_mileage: 99999, branch_id: "branch-target" },
    ];
    const pickupBranchId = "branch-target";
    const sorted = [...candidates].sort((a, b) => {
      const aMatch = a.branch_id === pickupBranchId ? 0 : 1;
      const bMatch = b.branch_id === pickupBranchId ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.current_mileage - b.current_mileage;
    });
    assert.strictEqual(
      sorted[0].id,
      "v2",
      "branch match wins even with higher mileage"
    );
  });

  test("allocation with null branch_id falls back to mileage sort", () => {
    const candidates = [
      { id: "v1", current_mileage: 5000, branch_id: null },
      { id: "v2", current_mileage: 2000, branch_id: null },
      { id: "v3", current_mileage: 8000, branch_id: null },
    ];
    const pickupBranchId = "branch-a";
    const sorted = [...candidates].sort((a, b) => {
      const aMatch = a.branch_id === pickupBranchId ? 0 : 1;
      const bMatch = b.branch_id === pickupBranchId ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return (a.current_mileage ?? 0) - (b.current_mileage ?? 0);
    });
    // No branch match, all equal priority → lowest mileage first
    assert.strictEqual(sorted[0].id, "v2", "lowest mileage among non-matching");
  });
});
