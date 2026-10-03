/**
 * Stage 18 FINDING S18-1 (NOT registered in package.json — see report).
 *
 * VIOLATION: createNotification + notifyOwner are medium-risk, write-capable
 * (INSERT notifications), approval_required=false
 * (db/migration_139_tool_registry.sql:87-88), and medium is NOT in the L0
 * gate's HIGH_RISK set (lib/ai/approvals.ts:29: high/critical only).
 * Therefore requiresApproval = false and an L0 agent GRANTED these tools
 * would execute them with zero approval.
 *
 * Current mitigation (ACL only, not flags): no agent is granted either tool
 * (dylan/sentinel/qa seeds contain neither). If a future grant adds them,
 * the approval flag will NOT stop execution. Fix options: set
 * approval_required=true on both rows (migration), or add 'medium' to the
 * L0-blocking set (runtime change). Both need a product decision — deferred.
 *
 * This test FAILS BY DESIGN to pin the violation. Do not register it until
 * the flags are fixed.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");

test("S18-1: medium write-capable tools must require approval (CURRENTLY FAILS)", () => {
  const mig = fs.readFileSync(path.join(ROOT, "db/migration_139_tool_registry.sql"), "utf8");
  const gate = fs.readFileSync(path.join(ROOT, "lib/ai/approvals.ts"), "utf8");
  // The gate blocks L0 only on approval_required=true or high/critical risk.
  const mediumBlocked = gate.includes("'medium'") && /HIGH_RISK\s*=\s*new Set\([^)]*'medium'/.test(gate);
  for (const tool of ["createNotification", "notifyOwner"]) {
    const row = mig.split("\n").filter((l) => l.includes(`'${tool}'`)).join("\n");
    assert.ok(row.includes("'medium'"), `${tool} is medium risk`);
    assert.ok(row.includes("false"), `${tool} has approval_required=false`);
  }
  assert.ok(mediumBlocked, "medium risk must block L0 without approval");
});
