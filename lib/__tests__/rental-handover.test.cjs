const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { Module } = require("node:module");

function loadTsModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, "..", "..", relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = (id) => (Object.prototype.hasOwnProperty.call(mocks, id) ? mocks[id] : originalRequire(id));
  mod._compile(compiled, filename);
  return mod.exports;
}

test("late fee calculation: no fee within grace period", () => {
  const { calculateLateFee } = loadTsModule("lib/rental/late-fee.ts");
  const end = "2026-11-10T10:00:00.000Z";
  const actual = "2026-11-10T10:59:00.000Z"; // 59 min, grace 60
  const r = calculateLateFee({ scheduledEnd: end, actualReturn: actual, graceMinutes: 60, feePerDay: 50 });
  assert.equal(r.overdueMinutes, 0);
  assert.equal(r.overdueDays, 0);
  assert.equal(r.feeAmount, 0);
});

test("late fee calculation: charges per day or part thereof after grace", () => {
  const { calculateLateFee } = loadTsModule("lib/rental/late-fee.ts");
  const end = "2026-11-10T10:00:00.000Z";
  const actual = "2026-11-10T11:01:00.000Z"; // 1 min past grace => 1 day
  const r1 = calculateLateFee({ scheduledEnd: end, actualReturn: actual, graceMinutes: 60, feePerDay: 40 });
  assert.equal(r1.overdueDays, 1);
  assert.equal(r1.feeAmount, 40);

  const actual2 = "2026-11-11T11:01:00.000Z"; // ~24h1m past grace => 2 days
  const r2 = calculateLateFee({ scheduledEnd: end, actualReturn: actual2, graceMinutes: 60, feePerDay: 40 });
  assert.ok(r2.overdueDays >= 2);
  assert.equal(r2.feeAmount, r2.overdueDays * 40);
});

test("late fee calculation: zero rate disables fee", () => {
  const { calculateLateFee } = loadTsModule("lib/rental/late-fee.ts");
  const r = calculateLateFee({ scheduledEnd: "2026-11-10T10:00:00.000Z", actualReturn: "2026-11-12T10:00:00.000Z", graceMinutes: 60, feePerDay: 0 });
  assert.equal(r.feeAmount, 0);
  assert.ok(r.overdueMinutes > 0);
});

test("deposit settlement is idempotent once settled", () => {
  const { applyDepositSettlement } = loadTsModule("lib/rental/handover-guards.ts");
  const settled = applyDepositSettlement({ currentStatus: "collected_offline", collectedAmount: 200, action: "return_full" });
  assert.equal(settled.ok, true);
  assert.equal(settled.status, "returned_full");

  const again = applyDepositSettlement({ currentStatus: "returned_full", collectedAmount: 200, action: "retain_full", reason: "damage" });
  assert.equal(again.ok, false);
  assert.equal(again.code, "DEPOSIT_ALREADY_SETTLED");

  const partial = applyDepositSettlement({ currentStatus: "partially_retained", collectedAmount: 200, action: "return_full" });
  assert.equal(partial.ok, false);
  assert.equal(partial.code, "DEPOSIT_ALREADY_SETTLED");
});

test("deposit settlement validates retention and amounts", () => {
  const { applyDepositSettlement } = loadTsModule("lib/rental/handover-guards.ts");
  const needsReason = applyDepositSettlement({ currentStatus: "collected_offline", collectedAmount: 150, action: "retain_full", reason: "" });
  assert.equal(needsReason.ok, false);
  assert.equal(needsReason.code, "DEPOSIT_REASON_REQUIRED");

  const part = applyDepositSettlement({ currentStatus: "collected_offline", collectedAmount: 150, action: "retain_partial", retainedAmount: 300, reason: "scratch" });
  assert.equal(part.ok, true);
  assert.equal(part.status, "partially_retained");
  assert.equal(part.retainedAmount, 150); // capped to collected
});

test("double-submit guard blocks a second inspection of same kind", () => {
  const { InspectionSubmissionGuard } = loadTsModule("lib/rental/handover-guards.ts");
  const g = new InspectionSubmissionGuard();
  const first = g.submit("b1", "pickup");
  assert.equal(first.ok, true);
  const second = g.submit("b1", "pickup");
  assert.equal(second.ok, false);
  assert.equal(second.code, "ALREADY_SUBMITTED");
  // different kind or booking is allowed
  assert.equal(g.submit("b1", "return").ok, true);
  assert.equal(g.submit("b2", "pickup").ok, true);
});
