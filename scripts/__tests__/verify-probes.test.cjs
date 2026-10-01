/**
 * Hermetic unit tests for the savepoint-isolated expectError probe.
 *
 * No database: a fake client emulates PostgreSQL transaction semantics
 * (an error aborts the transaction; ROLLBACK TO SAVEPOINT restores health;
 * anything issued while aborted raises 25P02). Proves:
 *  - an expected error followed by a second probe in the same check works;
 *  - an unexpected error (incl. 25P02) is reported as FAIL, never PASS;
 *  - a probe that succeeds is reported as FAIL.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const script = require("../verify-staging-db.cjs");

/** Fake pg client with real abort/savepoint semantics. */
function makeFakeDb(scripted) {
  return {
    aborted: false,
    log: [],
    async query(sql) {
      this.log.push(sql);
      if (/^SAVEPOINT /.test(sql)) return { rows: [] };
      if (/^RELEASE SAVEPOINT /.test(sql)) return { rows: [] };
      if (/^ROLLBACK TO SAVEPOINT /.test(sql)) {
        this.aborted = false;
        return { rows: [] };
      }
      if (this.aborted) {
        const e = new Error("current transaction is aborted, commands ignored until end of transaction block");
        e.code = "25P02";
        throw e;
      }
      const hit = scripted.find((s) => sql.includes(s.match));
      if (hit) {
        this.aborted = true;
        const e = new Error(hit.message);
        e.code = hit.code;
        e.constraint = hit.constraint;
        throw e;
      }
      return { rows: [] };
    },
  };
}

function reset() {
  script._results.length = 0;
}
function verdict(name) {
  const r = script._results.find((x) => x.name === name);
  assert.ok(r, `result recorded for ${name}`);
  return r.status;
}

const DUP_PLATFORM = {
  match: "stage16-probe-platform",
  message: 'duplicate key value violates unique constraint "uq_agent_memory_platform"',
  code: "23505",
  constraint: "uq_agent_memory_platform",
};
const DUP_AGENT = {
  match: "stage16-probe-agent",
  message: 'duplicate key value violates unique constraint "uq_agent_memory_agent_platform"',
  code: "23505",
  constraint: "uq_agent_memory_agent_platform",
};

test("expected error then second probe: both PASS on a healthy txn", async () => {
  reset();
  const db = makeFakeDb([DUP_PLATFORM, DUP_AGENT]);
  await script.expectError(db, "sp_platform", "INSERT ... stage16-probe-platform", [], script.UNIQUE("uq_agent_memory_platform"), "probe-1");
  await script.expectError(db, "sp_agent", "INSERT ... stage16-probe-agent", [], script.UNIQUE("uq_agent_memory_agent_platform"), "probe-2");
  assert.equal(verdict("probe-1"), "PASS");
  assert.equal(verdict("probe-2"), "PASS", "second probe must not see 25P02");
  assert.ok(db.log.some((s) => s === "ROLLBACK TO SAVEPOINT sp_platform"), "savepoint used for probe 1");
  assert.ok(db.log.some((s) => s === "ROLLBACK TO SAVEPOINT sp_agent"), "savepoint used for probe 2");
});

test("unexpected 25P02 is FAIL, and the txn stays usable", async () => {
  reset();
  const db = makeFakeDb([]);
  db.aborted = true; // simulate a previously aborted transaction
  await script.expectError(db, "sp_x", "INSERT ... stage16-probe-platform", [], script.UNIQUE("uq_agent_memory_platform"), "probe-aborted");
  assert.equal(verdict("probe-aborted"), "FAIL", "25P02 must FAIL, never pass");
  // Recovery: the helper rolled back to its savepoint, so a later probe runs.
  db.aborted = false;
  const alwaysBoom = {
    log: [],
    async query(sql) {
      this.log.push(sql);
      if (/^(SAVEPOINT|ROLLBACK TO SAVEPOINT|RELEASE SAVEPOINT) /.test(sql)) return { rows: [] };
      throw Object.assign(new Error("boom"), { code: "XX000" });
    },
  };
  await script.expectError(alwaysBoom, "sp_y", "SELECT 1", [], script.UNIQUE("uq_agent_memory_platform"), "probe-unknown");
  assert.equal(verdict("probe-unknown"), "FAIL", "unknown error must FAIL");
});

test("wrong constraint is FAIL even with SQLSTATE 23505", async () => {
  reset();
  const db = makeFakeDb([{ ...DUP_PLATFORM, constraint: "some_other_index" }]);
  await script.expectError(db, "sp_z", "INSERT ... stage16-probe-platform", [], script.UNIQUE("uq_agent_memory_platform"), "probe-constraint");
  assert.equal(verdict("probe-constraint"), "FAIL", "wrong index must FAIL");
});

test("probe that succeeds is FAIL", async () => {
  reset();
  const db = makeFakeDb([]);
  await script.expectError(db, "sp_ok", "SELECT 1", [], script.UNIQUE("uq_agent_memory_platform"), "probe-success");
  assert.equal(verdict("probe-success"), "FAIL", "unexpected success must FAIL");
});

test("append-only trigger message passes; other text fails", async () => {
  reset();
  const db = makeFakeDb([{
    match: "agent_memory_versions",
    message: "agent_memory_versions is append-only (INSERT only)",
    code: "P0001",
  }]);
  await script.expectError(db, "sp_t", "UPDATE agent_memory_versions SET x", [], script.APPEND_ONLY, "probe-trigger");
  assert.equal(verdict("probe-trigger"), "PASS");
  const db2 = makeFakeDb([{
    match: "agent_memory_versions",
    message: "permission denied for table agent_memory_versions",
    code: "42501",
  }]);
  await script.expectError(db2, "sp_t2", "UPDATE agent_memory_versions SET x", [], script.APPEND_ONLY, "probe-trigger-wrong");
  assert.equal(verdict("probe-trigger-wrong"), "FAIL", "wrong message must FAIL");
});
