/**
 * Stage 23 (Phase B) — Workforce grant-hardening tests (hermetic).
 *
 * No database, no network. The covered table set is ENUMERATED FROM SQL:
 * every CREATE TABLE in db/migration_139..152 (comments stripped), minus
 * the two studio_chat_* tables (migration_152 already revokes first). The
 * test fails if any migration table is not covered by 153, or if 153
 * touches a table no migration created. Per-table pins: revoke-first from
 * PUBLIC/anon/authenticated, then SELECT-only to authenticated — except
 * qa_runs (table-level revoke only + 151's 19-column grant verbatim, never
 * table-level SELECT). 153 must be metadata-only: no tables, policies,
 * indexes, functions, data changes, and no service_role churn.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const DB = path.join(ROOT, "db");
const MIG153 = fs.readFileSync(path.join(DB, "migration_153_workforce_grant_hardening.sql"), "utf8");
const ROLLBACK153 = fs.readFileSync(path.join(DB, "migration_153_workforce_grant_hardening_rollback.sql"), "utf8");
const MIG151 = fs.readFileSync(path.join(DB, "migration_151_workforce_rls_narrowing.sql"), "utf8");

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

function createdTables() {
  const out = new Set();
  for (const f of fs.readdirSync(DB)) {
    if (!/^migration_(139|14\d|15[012])_/.test(f) || f.includes("rollback")) continue;
    const code = stripComments(fs.readFileSync(path.join(DB, f), "utf8"));
    for (const m of code.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) {
      out.add(m[1]);
    }
  }
  out.delete("studio_chat_conversations");
  out.delete("studio_chat_messages");
  return [...out].sort();
}

function revokedTables(sql) {
  const out = new Set();
  for (const m of stripComments(sql).matchAll(/REVOKE\s+ALL\s+ON\s+TABLE\s+([a-z_][a-z0-9_]*)/gi)) {
    out.add(m[1]);
  }
  return [...out].sort();
}

function baselineTables(sql) {
  const out = new Set();
  for (const m of stripComments(sql).matchAll(/GRANT\s+ALL\s+ON\s+TABLE\s+([a-z_][a-z0-9_]*)\s+TO\s+anon,\s*authenticated/gi)) {
    out.add(m[1]);
  }
  return [...out].sort();
}

test("153 covers exactly the tables migrations 139-152 created (chat excluded)", () => {
  const created = createdTables();
  const covered = revokedTables(MIG153);
  assert.deepEqual(covered, created, "enumerated coverage must match created tables");
  assert.ok(created.length >= 19, `expected the 19 workforce tables (found ${created.length})`);
  assert.ok(!covered.includes("studio_chat_conversations") && !covered.includes("studio_chat_messages"), "chat tables excluded");
});

test("per table: revoke-first from PUBLIC/anon/authenticated, then SELECT-only", () => {
  for (const table of createdTables()) {
    if (table === "qa_runs") continue; // column-only exception, pinned below
    assert.ok(MIG153.includes(`REVOKE ALL ON TABLE ${table} FROM PUBLIC, anon`), `${table}: anon revoked`);
    assert.ok(MIG153.includes(`REVOKE ALL ON TABLE ${table} FROM authenticated`), `${table}: baseline revoked`);
    assert.ok(MIG153.includes(`GRANT SELECT ON TABLE ${table} TO authenticated`), `${table}: SELECT-only re-grant`);
  }
  // Every non-column GRANT line must be exactly SELECT-to-authenticated.
  for (const line of stripComments(MIG153).split("\n")) {
    if (!/^\s*GRANT\s/i.test(line) || /GRANT\s+SELECT\s*\(/i.test(line)) continue;
    assert.ok(
      /^\s*GRANT\s+SELECT\s+ON\s+TABLE\s+[a-z_][a-z0-9_]*\s+TO\s+authenticated\s*;\s*$/i.test(line),
      `SELECT-only grant: ${line.trim().slice(0, 90)}`
    );
  }
  assert.ok(!/(GRANT|REVOKE)[^\n]*service_role/i.test(MIG153), "service_role untouched");
});

test("qa_runs: table-level revoke only, 151's 19-column grant verbatim", () => {
  assert.ok(MIG153.includes("REVOKE ALL ON TABLE qa_runs FROM PUBLIC, anon"), "qa_runs anon revoked");
  assert.ok(MIG153.includes("REVOKE ALL ON TABLE qa_runs FROM authenticated"), "qa_runs baseline revoked");
  assert.ok(!/GRANT\s+SELECT\s+ON\s+TABLE\s+qa_runs\s+TO/i.test(MIG153), "qa_runs never regains table-level SELECT");
  // The column list must be 151's exact list, word for word.
  const cols = (sql) => {
    const m = stripComments(sql).match(/GRANT\s+SELECT\s*\(([^)]+)\)\s*ON\s+qa_runs\s+TO\s+anon,\s*authenticated/i);
    assert.ok(m, "qa_runs column grant present");
    return m[1].split(",").map((c) => c.trim()).filter(Boolean);
  };
  assert.deepEqual(cols(MIG153), cols(MIG151), "column list identical to 151");
  assert.equal(cols(MIG153).length, 19, "19 non-secret columns");
  for (const secret of ["claim_token_hash", "claim_expires_at", "idempotency_key", "metadata"]) {
    assert.ok(!cols(MIG153).includes(secret), `secret column stays hidden: ${secret}`);
  }
});

test("qa_test_results takes the standard SELECT grant (no secret columns)", () => {
  assert.ok(MIG153.includes("GRANT SELECT ON TABLE qa_test_results TO authenticated"), "standard grant");
  assert.ok(
    !/GRANT\s+SELECT\s*\([^)]*\)\s*ON\s+qa_test_results/i.test(stripComments(MIG153)),
    "no column carve-out on qa_test_results"
  );
});

test("153 is metadata-only: no tables, policies, indexes, functions, data", () => {
  const code = stripComments(MIG153);
  assert.ok(code.includes("BEGIN;") && code.includes("COMMIT;"), "single transaction");
  for (const kw of ["CREATE TABLE", "CREATE POLICY", "CREATE INDEX", "CREATE FUNCTION", "CREATE TRIGGER", "CREATE VIEW", "ALTER TABLE", "DROP TABLE", "DROP POLICY", "INSERT INTO", "UPDATE ", "DELETE FROM"]) {
    const hits = code.split("\n").filter((l) => l.includes(kw) && !/^\s*--/.test(l));
    assert.deepEqual(hits, [], `no ${kw} statements`);
  }
  assert.ok(!/DEFAULT\s+PRIVILEGES/i.test(code), "ALTER DEFAULT PRIVILEGES out of scope (follow-up)");
});

test("rollback restores the Supabase-default GRANT ALL baseline", () => {
  assert.deepEqual(baselineTables(ROLLBACK153), createdTables(), "rollback covers the same tables");
  for (const table of createdTables()) {
    assert.ok(ROLLBACK153.includes(`GRANT ALL ON TABLE ${table} TO anon, authenticated`), `${table}: defaults restored`);
  }
  assert.ok(!/REVOKE/i.test(stripComments(ROLLBACK153)), "rollback revokes nothing");
  assert.ok(ROLLBACK153.includes("GRANT SELECT (") && ROLLBACK153.includes("ON qa_runs TO anon, authenticated"), "qa_runs column grant restored");
});

test("mirror byte-identical, order entry last, packaging complete", () => {
  const mirror = path.join(ROOT, "supabase", "migrations", "20261007000000_migration_153_workforce_grant_hardening.sql");
  assert.ok(fs.existsSync(mirror), "supabase mirror exists");
  assert.equal(fs.readFileSync(mirror, "utf8"), MIG153, "mirror identical to canonical");
  const order = fs.readFileSync(path.join(DB, "staging-migration-order.txt"), "utf8");
  const lines = order.trim().split("\n");
  assert.equal(lines[lines.length - 1], "migration_153_workforce_grant_hardening.sql", "order entry last");
  assert.ok(!order.includes("_rollback"), "order file excludes rollbacks");
});
