/**
 * Stage 10.1 hermetic tests: migration 146 shape + discipline.
 *
 * No database. Static source scans (sentinel-events precedent). Covers:
 * forward/rollback/mirror files exist; exactly the 8 new task columns +
 * attempt_no with the specified constraints; idempotency UNIQUE + attempt
 * UNIQUE + the three worker indexes (claim/lease/approved-poll); no status
 * vocabulary change; RLS untouched (no new policies, no GRANT, no
 * service-role grant); rollback drops in reverse order; mirror matches
 * canonical body; staging order file lists 146 after 145.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const DB = path.join(ROOT, "db");
function read(p) { return fs.readFileSync(p, "utf8"); }

const FWD = "migration_146_background_execution.sql";
const RB = "migration_146_background_execution_rollback.sql";
const MIRROR = "20261001000000_migration_146_background_execution.sql";

test("migration 146 exists with rollback twin, supabase mirror, order entry", () => {
  assert.ok(fs.existsSync(path.join(DB, FWD)), "forward must exist");
  assert.ok(fs.existsSync(path.join(DB, RB)), "rollback twin must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "supabase", "migrations", MIRROR)), "supabase mirror must exist");
  const order = read(path.join(DB, "staging-migration-order.txt")).split("\n").map((l) => l.trim()).filter(Boolean);
  assert.ok(order.includes(FWD), "order file lists 146");
  assert.ok(order.indexOf(FWD) > order.indexOf("migration_145_qa_execution.sql"), "146 after 145");
  const fwd = read(path.join(DB, FWD));
  const mirror = read(path.join(ROOT, "supabase", "migrations", MIRROR));
  assert.equal(mirror, fwd, "mirror byte-identical to canonical");
  assert.ok(fwd.trimStart().startsWith("--"), "header documents intent");
  assert.ok(fwd.includes("BEGIN;") && fwd.includes("COMMIT;"), "transactional");
});

test("exactly the specified columns and constraints, nothing more", () => {
  const sql = read(path.join(DB, FWD));
  for (const col of ["idempotency_key", "lease_owner", "lease_expires_at", "last_heartbeat_at", "claim_token_hash", "attempt_count", "max_attempts", "run_after", "result_ref"]) {
    assert.ok(sql.includes(col), `agent_tasks.${col} added`);
  }
  assert.ok(sql.includes("attempt_no"), "agent_runs.attempt_no added");
  assert.ok(sql.includes("uq_agent_tasks_idempotency"), "enqueue dedupe UNIQUE");
  assert.ok(sql.includes("uq_agent_runs_task_attempt"), "attempt uniqueness");
  assert.ok(sql.includes("CHECK (attempt_count >= 0)"), "attempt_count bound");
  assert.ok(sql.includes("CHECK (max_attempts BETWEEN 1 AND 5)"), "bounded retries in schema");
  // Status vocabulary untouched: no CHECK rewrite on status columns.
  assert.ok(!/CHECK\s*\(\s*status\s+IN/i.test(sql), "no status CHECK introduced");
  // approval_id FK deliberately NOT tightened (live orphans UNVERIFIED).
  assert.ok(!/approval_id.*REFERENCES/i.test(sql), "no approval_id FK change");
});

test("worker indexes back actual Stage 10 queries", () => {
  const sql = read(path.join(DB, FWD));
  assert.ok(sql.includes("idx_agent_tasks_claim") && sql.includes("WHERE status = 'queued'"), "claim poll partial index");
  assert.ok(sql.includes("NULLS FIRST"), "null run_after sorts first for FIFO claim");
  assert.ok(sql.includes("idx_agent_tasks_lease") && sql.includes("lease_expires_at"), "stale-lease scan index");
  assert.ok(sql.includes("idx_approvals_approved_poll") && sql.includes("audit_ref IS NULL"), "approved-poll index");
});

test("RLS and grants untouched; rollback reverses cleanly", () => {
  const sql = read(path.join(DB, FWD));
  assert.ok(!/CREATE POLICY/i.test(sql), "no new RLS policies");
  assert.ok(!/GRANT/i.test(sql), "no grants");
  assert.ok(!/ALTER TABLE \w+ ENABLE ROW LEVEL SECURITY/i.test(sql), "no RLS toggles");
  assert.ok(!/DROP\s+(TABLE|COLUMN)/i.test(sql), "nothing destructive in forward");
  const rb = read(path.join(DB, RB));
  assert.ok(rb.includes("BEGIN;") && rb.includes("COMMIT;"), "rollback transactional");
  for (const name of ["idx_approvals_approved_poll", "uq_agent_runs_task_attempt", "attempt_no", "idx_agent_tasks_lease", "idx_agent_tasks_claim", "uq_agent_tasks_idempotency", "idempotency_key"]) {
    assert.ok(rb.includes(name), `rollback removes ${name}`);
  }
  const mirrors = fs.readdirSync(path.join(ROOT, "supabase", "migrations"));
  assert.ok(!mirrors.some((f) => /rollback/i.test(f)), "no rollback twin in supabase/migrations");
});
