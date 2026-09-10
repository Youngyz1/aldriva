/**
 * P1 F-04 static regression tests: approval triggers must not treat
 * auth.uid() IS NULL as service-role.
 *
 * Previous exposure: seven approval/capability guard triggers used
 * `is_admin := is_admin OR auth.uid() IS NULL`, treating a null auth.uid()
 * as equivalent to service-role. But auth.uid() is also null for anonymous
 * REST calls — not just service-role — so the carve-out was wider than
 * intended. Reachability analysis (see migration header) found no
 * anon-reachable ungated write path to any affected table in current code
 * (post-101/103/104), so this is defense-in-depth hardening: the triggers
 * now require a genuine service-role session via auth.role().
 *
 * These tests assert repository evidence only (no database connection): the
 * 105 migration must recreate all seven functions with the safe gate and no
 * uid-IS-NULL carve-out, and the mirror must stay in sync. Functional
 * verification against a real Supabase project remains an operator step
 * (see migration header); the migration was NOT applied to production.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const CANON = path.join(ROOT, "db", "migration_105_trigger_service_role_gate.sql");
const MIRROR = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260910000000_migration_105_trigger_service_role_gate.sql"
);
const ROLLBACK = path.join(ROOT, "db", "migration_105_trigger_service_role_gate_rollback.sql");

const sql = fs.readFileSync(CANON, "utf8");
const mirrorSql = fs.readFileSync(MIRROR, "utf8");

const FUNCTIONS = [
  "enforce_article_status_transition",
  "enforce_business_status_transition",
  "enforce_product_status_transition",
  "enforce_fundraiser_status_transition",
  "enforce_organizer_capability_columns",
  "prevent_submission_self_approval",
  "prevent_user_identity_self_approval",
];

test("migration files exist in both tracks with rollback", () => {
  assert.ok(fs.existsSync(CANON), "canonical db/ migration must exist");
  assert.ok(fs.existsSync(MIRROR), "supabase/migrations mirror must exist");
  assert.ok(fs.existsSync(ROLLBACK), "rollback must exist");
});

test("mirror matches canonical body (header may differ)", () => {
  const ANCHOR = "P1 F-04";
  assert.ok(sql.includes(ANCHOR) && mirrorSql.includes(ANCHOR));
  assert.equal(
    mirrorSql.slice(mirrorSql.indexOf(ANCHOR)),
    sql.slice(sql.indexOf(ANCHOR)),
    "mirror body must equal canonical body"
  );
});

test("all seven triggers are recreated", () => {
  for (const fn of FUNCTIONS) {
    const occurrences = sql.split(`CREATE OR REPLACE FUNCTION ${fn}()`).length - 1;
    assert.equal(occurrences, 1, `${fn} must be recreated exactly once`);
  }
});

test("no uid-IS-NULL carve-out remains in code", () => {
  const codeOnly = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  assert.ok(!/auth\.uid\(\)\s+IS\s+NULL/i.test(codeOnly), "migration must not contain the unsafe idiom");
});

test("safe service-role gate is used in every function", () => {
  const codeOnly = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  const gates = codeOnly.match(/auth\.role\(\)\s*=\s*'service_role'/g) || [];
  // 6 single-gate functions + prevent_submission_self_approval's two guards = 8.
  assert.equal(gates.length, 8, "expected 8 service-role gate lines across the 7 functions");
});

test("rollback restores the original carve-out (emergency use)", () => {
  const rollback = fs.readFileSync(ROLLBACK, "utf8");
  for (const fn of FUNCTIONS) {
    assert.ok(
      rollback.includes(`CREATE OR REPLACE FUNCTION ${fn}()`),
      `rollback must restore ${fn}`
    );
  }
});
