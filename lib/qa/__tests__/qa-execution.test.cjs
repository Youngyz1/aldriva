/**
 * Stage 7 hermetic + adversarial tests: QA execution plane.
 *
 * No database, no network, no browsers. A capable fake Supabase client
 * (filter/update/upsert emulation) drives: provider pure functions, token
 * primitives, claim protocol (incl. squat races + standing fallback),
 * ingest validation + idempotency + transitions, incident rule, shadow
 * default, request_qa_run receipt-only behavior, and static migration/
 * registry/seed assertions. Adversarial cases are first-class tests,
 * not comments.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;
require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  isQASuite, isQAEnvironment, canTransitionQAStatus, isQATerminal,
} = require("../execution-provider");
const { mintClaimToken, verifyClaimToken, isAuthorizedPollRequest } = require("../tokens");
const { parseRequestArgs, parseRowArgs, pollAndClaim, materializeStandingRun } = require("../claim");
const { mintExecutionEnvelope } = require("../../exec/envelope");
const {
  ingestRunResults, evaluateIncidentDecision, isShadowMode,
} = require("../ingest");
const { requestQaRun } = require("../../ai/tools/qa/request-qa-run");

const NOW = "2026-09-26T12:00:00Z";
const LATER = "2026-09-26T12:05:00Z";

// ---- capable fake -------------------------------------------------------
function makeStore() {
  return {
    approvals: [],
    qa_runs: [],
    qa_test_results: [],
  };
}

class FakeQuery {
  constructor(store, table, log) {
    this.store = store;
    this.table = table;
    this.log = log;
    this.filters = [];
    this.patch = null;
    this.insertRow = null;
    this.upsertRow = null;
    this.upsertOpts = null;
    this.cols = null;
  }
  select(cols) { this.cols = cols; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  gt(c, v) { this.filters.push((r) => r[c] > v); return this; }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
  order() { return this; }
  limit() { return this; }
  update(p) { this.patch = p; return this; }
  insert(row) { this.insertRow = row; return this; }
  upsert(row, opts) { this.upsertRow = row; this.upsertOpts = opts; return this; }
  match(r) { return this.filters.every((f) => f(r)); }
  then(resolve) {
    const rows = this.store[this.table] || [];
    if (this.upsertRow) {
      const key = ["run_id", "file", "name"].map((k) => this.upsertRow[k]).join("|");
      const ix = rows.findIndex((r) => ["run_id", "file", "name"].map((k) => r[k]).join("|") === key);
      const row = { id: `res-${rows.length + 1}`, created_at: NOW, ...this.upsertRow };
      if (ix >= 0) rows[ix] = { ...rows[ix], ...this.upsertRow };
      else rows.push(row);
      resolve({ data: null, error: null });
      return Promise.resolve();
    }
    if (this.insertRow) {
      if (this.table === "qa_runs") {
        if (rows.some((r) => r.idempotency_key === this.insertRow.idempotency_key)) {
          resolve({ data: null, error: { message: "duplicate key value violates unique constraint" } });
          return Promise.resolve();
        }
        const row = { id: `run-${rows.length + 1}`, created_at: NOW, passed: 0, failed: 0, skipped: 0, metadata: {}, ...this.insertRow };
        rows.push(row);
        resolve({ data: [{ id: row.id }], error: null });
        return Promise.resolve();
      }
      resolve({ data: null, error: { message: "insert not supported here" } });
      return Promise.resolve();
    }
    if (this.patch) {
      const hit = rows.filter((r) => this.match(r));
      for (const r of hit) Object.assign(r, this.patch);
      resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
      return Promise.resolve();
    }
    if (this.log) this.log.push({ table: this.table, select: this.cols });
    resolve({ data: rows.filter((r) => this.match(r)), error: null });
    return Promise.resolve();
  }
}

function fakeClient(store, log) {
  return { from: (t) => new FakeQuery(store, t, log) };
}

const CTX = { tenantId: "11111111-1111-1111-1111-111111111111", userId: "u1", role: "viewer", channelAssetId: null, connectedAccountId: null, conversationId: null };

// ---- provider pure functions --------------------------------------------
test("allowlisted suites/environments; production unrepresentable", () => {
  assert.equal(isQASuite("smoke"), true);
  assert.equal(isQASuite("prod-e2e"), false);
  assert.equal(isQAEnvironment("staging"), true);
  assert.equal(isQAEnvironment("production"), false);
  assert.equal(isQAEnvironment(""), false);
});

test("forward-only transitions; terminals frozen", () => {
  assert.equal(canTransitionQAStatus("requested", "approved"), true);
  assert.equal(canTransitionQAStatus("approved", "running"), true);
  assert.equal(canTransitionQAStatus("running", "failed"), true);
  assert.equal(canTransitionQAStatus("requested", "running"), false);
  assert.equal(canTransitionQAStatus("running", "approved"), false);
  assert.equal(canTransitionQAStatus("failed", "failed"), false);
  assert.equal(canTransitionQAStatus("passed", "failed"), false);
  assert.equal(isQATerminal("failed"), true);
  assert.equal(isQATerminal("running"), false);
});

// ---- tokens --------------------------------------------------------------
test("claim token mint/verify/TTL/expiry", () => {
  const m = mintClaimToken(Date.parse(NOW));
  assert.equal(m.token.length, 64);
  assert.ok(verifyClaimToken(m.token, m.hash, m.expiresAtIso, NOW));
  assert.equal(verifyClaimToken(m.token, m.hash, m.expiresAtIso, "2026-09-26T15:00:00Z"), false, "expired after 2h TTL");
  assert.equal(verifyClaimToken("wrong", m.hash, m.expiresAtIso, NOW), false);
  assert.equal(verifyClaimToken(m.token, null, null, NOW), false);
});

test("poll auth fail-closed without secret", () => {
  const crypto = require("node:crypto");
  const good = "Bearer s3cret";
  assert.equal(isAuthorizedPollRequest(good, "s3cret"), true);
  assert.equal(isAuthorizedPollRequest(good, undefined), false);
  assert.equal(isAuthorizedPollRequest(good, ""), false);
  assert.equal(isAuthorizedPollRequest(null, "s3cret"), false);
  assert.equal(isAuthorizedPollRequest("Bearer wrong", "s3cret"), false);
  void crypto;
});

// ---- claim protocol ------------------------------------------------------
function approval(args, extra = {}) {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", tenant_id: null, action: "request_qa_run",
    status: "approved", expires_at: "2026-09-27T00:00:00Z", audit_ref: null,
    evidence: { tool: "request_qa_run", args: JSON.stringify(args) }, created_at: NOW, ...extra,
  };
}

const GOOD_ARGS = {
  suite: "smoke", environment: "staging", tenantId: null,
  idempotencyKey: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", commitSha: "abc1234",
};

test("parseRequestArgs accepts valid, rejects hostile shapes", () => {
  assert.deepEqual(parseRequestArgs({ args: JSON.stringify(GOOD_ARGS) }), { ...GOOD_ARGS, environment: "staging" });
  assert.equal(parseRequestArgs({ args: JSON.stringify({ ...GOOD_ARGS, suite: "prod" }) }), null);
  assert.equal(parseRequestArgs({ args: JSON.stringify({ ...GOOD_ARGS, environment: "production" }) }), null);
  assert.equal(parseRequestArgs({ args: JSON.stringify({ ...GOOD_ARGS, idempotencyKey: "nope" }) }), null);
  assert.equal(parseRequestArgs({ args: "not-json" }), null);
  assert.equal(parseRequestArgs({}), null);
  assert.equal(parseRequestArgs(null), null);
});

test("Stage 10.0: parseRowArgs prefers the canonical envelope, fixes the sanitized-evidence break", () => {
  // Simulate the orchestrator mint: raw args in, envelope out.
  const minted = mintExecutionEnvelope({
    rawArgs: JSON.stringify(GOOD_ARGS),
    tenantId: null, agentId: "11111111-1111-1111-1111-111111111111", agentName: "qa",
    taskId: null, runId: null, action: "request_qa_run",
  });
  assert.equal(minted.ok, true);
  // Post-sanitization evidence: args is a redacted OBJECT (legacy parser: null).
  const sanitizedEvidence = { tool: "request_qa_run", args: { suite: "smoke", idempotencyKey: "[redacted]" } };
  assert.equal(parseRequestArgs(sanitizedEvidence), null, "legacy parser still rejects objects");
  const viaEnvelope = parseRowArgs(sanitizedEvidence, minted.envelope);
  assert.deepEqual(viaEnvelope, { ...GOOD_ARGS, environment: "staging" }, "envelope path parses the previously-broken row");
  // Envelope tenant (server-resolved) wins over model-supplied args tenant.
  const tenantArgs = { ...GOOD_ARGS, tenantId: "22222222-2222-2222-2222-222222222222" };
  const mintedTenant = mintExecutionEnvelope({
    rawArgs: JSON.stringify(tenantArgs), tenantId: null,
    agentId: "11111111-1111-1111-1111-111111111111", agentName: "qa",
    taskId: null, runId: null, action: "request_qa_run",
  });
  assert.equal(parseRowArgs(sanitizedEvidence, mintedTenant.envelope).tenantId, null, "server-resolved tenant wins");
  // Wrong-action envelope never parses as QA; bad envelope falls back to legacy.
  const other = mintExecutionEnvelope({
    rawArgs: JSON.stringify({ to: "x" }), tenantId: null,
    agentId: "11111111-1111-1111-1111-111111111111", agentName: "dylan",
    taskId: null, runId: null, action: "notifyOwner",
  });
  assert.equal(parseRowArgs(sanitizedEvidence, other.envelope), null);
  assert.deepEqual(
    parseRowArgs({ args: JSON.stringify(GOOD_ARGS) }, { version: 999 }),
    { ...GOOD_ARGS, environment: "staging" },
    "bad envelope falls back to legacy string parse"
  );
  assert.equal(parseRowArgs({ args: "garbage" }, null), null, "no envelope + bad legacy = invalid");
});

test("poll claims oldest approved request, mints single-use token", async () => {
  const store = makeStore();
  store.approvals.push(approval(GOOD_ARGS));
  const out = await pollAndClaim(fakeClient(store), "gha-1", NOW);
  assert.equal(out.claimed, true);
  assert.equal(out.claimToken.length, 64);
  const run = store.qa_runs[0];
  assert.equal(run.status, "running");
  assert.equal(run.external_run_id, "gha-1");
  assert.ok(run.claim_token_hash && run.claim_expires_at, "hash + expiry at rest, never plaintext");
  assert.equal(store.approvals[0].audit_ref, `qa-run:${run.id}`, "approval linked to materialized run");
});

test("adversarial: invalid evidence stamped terminal, never spins", async () => {
  const store = makeStore();
  store.approvals.push(approval(GOOD_ARGS, { id: "c1", evidence: { args: "garbage" } }));
  const out = await pollAndClaim(fakeClient(store), "gha-1", NOW);
  assert.equal(store.approvals[0].audit_ref, "qa-invalid-evidence", "garbage stamped terminal");
  // Standing fallback still fires (store had no smoke run) — but the run it
  // materializes is the standing nightly one, never linked to the bad approval.
  assert.equal(out.claimed, true);
  assert.equal(store.qa_runs.length, 1);
  assert.equal(store.qa_runs[0].approval_id, null, "no run linked to invalid approval");
});

test("adversarial: claim-squat race loses atomically", async () => {
  const store = makeStore();
  store.approvals.push(approval(GOOD_ARGS));
  const first = await pollAndClaim(fakeClient(store), "gha-1", NOW);
  assert.equal(first.claimed, true);
  // second worker arrives late: approval no longer unclaimed, standing
  // fallback suppressed by the just-created run (same window).
  const second = await pollAndClaim(fakeClient(store), "gha-2", NOW);
  assert.equal(second.claimed, false);
  assert.equal(store.qa_runs.length, 1, "exactly one run materialized");
});

test("standing fallback: at most one run per 20h, none when fresh", async () => {
  const store = makeStore();
  const first = await materializeStandingRun(fakeClient(store), "gha-1", NOW);
  assert.equal(first.claimed, true);
  assert.equal(first.run.suite, "smoke");
  const second = await materializeStandingRun(fakeClient(store), "gha-2", NOW);
  assert.equal(second.claimed, false, "window suppresses duplicates");
  const later = await materializeStandingRun(fakeClient(store), "gha-3", "2026-09-27T12:00:01Z");
  assert.equal(later.claimed, true, "new window allows a fresh run");
});

// ---- ingest --------------------------------------------------------------
function claimedRun(over = {}) {
  return {
    id: "run-1", suite: "smoke", environment: "staging", status: "running",
    passed: 0, failed: 0, skipped: 0, finished_at: null, metadata: {}, ...over,
  };
}

test("ingest rejects hostile payloads", async () => {
  const store = makeStore();
  store.qa_runs.push(claimedRun());
  const c = () => fakeClient(store);
  assert.match((await ingestRunResults(c(), { runId: "run-1", status: "passed", results: new Array(501).fill({ name: "x", file: "f", status: "passed" }) }, NOW)).message, /Too many/);
  assert.match((await ingestRunResults(c(), { runId: "run-1", status: "passed", results: [{ name: "x", file: "f", status: "bogus" }] }, NOW)).message, /bad result status/);
  assert.match((await ingestRunResults(c(), { runId: "run-1", status: "passed", results: [{ name: "x", file: "f", status: "passed", screenshot_url: "http://evil.example/s.png" }] }, NOW)).message, /disallowed artifact host/);
  assert.match((await ingestRunResults(c(), { runId: "nope", status: "passed", results: [] }, NOW)).message, /not found/);
  assert.match((await ingestRunResults(c(), { runId: "run-1", status: "approved", results: [] }, NOW)).message, /Illegal transition/);
  assert.equal(store.qa_test_results.length, 0, "rejected payloads store nothing");
});

test("ingest records, recomputes counters, truncates errors", async () => {
  const store = makeStore();
  store.qa_runs.push(claimedRun());
  const out = await ingestRunResults(fakeClient(store), {
    runId: "run-1", status: "failed",
    results: [
      { name: "login ok", file: "e2e/a.spec.ts", status: "passed", duration_ms: 1200 },
      { name: "donate", file: "e2e/b.spec.ts", status: "failed", error: "z".repeat(5000) },
      { name: "flaky one", file: "e2e/b.spec.ts", status: "flaky" },
      { name: "skipped one", file: "e2e/c.spec.ts", status: "skipped" },
    ],
    error: "suite failed",
  }, NOW);
  assert.equal(out.ok, true);
  const run = store.qa_runs[0];
  assert.deepEqual([run.passed, run.failed, run.skipped], [2, 1, 1], "flaky counts as passed; counters server-side");
  assert.equal(run.status, "failed");
  assert.ok(run.finished_at, "terminal rows carry finished_at");
  assert.equal(store.qa_test_results.find((r) => r.name === "donate").error.length, 2000, "errors truncated, not rejected");
});

test("adversarial: double-ingest is a safe no-op; wrong-run token model holds", async () => {
  const store = makeStore();
  store.qa_runs.push(claimedRun({ status: "failed", finished_at: NOW }));
  const again = await ingestRunResults(fakeClient(store), { runId: "run-1", status: "failed", results: [] }, LATER);
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  // token-for-another-run is enforced at the route (hash bound to the run
  // row); the lib layer additionally scopes every write by run_id — prove
  // no cross-run write path exists by ingesting run-2 rows only into run-2.
  store.qa_runs.push(claimedRun({ id: "run-2" }));
  await ingestRunResults(fakeClient(store), { runId: "run-2", status: "passed", results: [{ name: "t", file: "f", status: "passed" }] }, LATER);
  assert.ok(store.qa_test_results.every((r) => r.run_id === "run-2"), "writes land only on the addressed run");
});

// ---- incident rule + shadow ------------------------------------------------
test("incident rule: smoke-only, s3→s2 escalation, flaky never", () => {
  const d = (o) => evaluateIncidentDecision({ suite: "smoke", date: "2026-09-26", failed: 1, flakyOnly: false, consecutiveFailDays: 0, ...o });
  assert.equal(d({}).severity, "s3");
  assert.equal(d({ consecutiveFailDays: 2 }).severity, "s2");
  assert.ok(d({}).dedupeKey.startsWith("qa_failure:smoke:2026-09-26"));
  assert.equal(evaluateIncidentDecision({ suite: "smoke", date: "2026-09-26", failed: 1, flakyOnly: true, consecutiveFailDays: 5 }), null);
  assert.equal(evaluateIncidentDecision({ suite: "smoke", date: "2026-09-26", failed: 0, flakyOnly: false, consecutiveFailDays: 0 }), null);
  assert.equal(evaluateIncidentDecision({ suite: "auth", date: "2026-09-26", failed: 3, flakyOnly: false, consecutiveFailDays: 9 }), null, "non-smoke never incidents");
});

test("shadow mode defaults ON; explicit false goes live", () => {
  assert.equal(isShadowMode({}), true);
  assert.equal(isShadowMode({ QA_SHADOW_MODE: "1" }), true);
  assert.equal(isShadowMode({ QA_SHADOW_MODE: "false" }), false);
});

// ---- request_qa_run tool ---------------------------------------------------
test("request_qa_run validates and performs zero I/O", async () => {
  const src = fs.readFileSync(path.join(ROOT, "lib", "ai", "tools", "qa", "request-qa-run.ts"), "utf8");
  assert.ok(!/@supabase\//.test(src) && !/supabase-admin/.test(src), "no supabase imports in executor");
  assert.ok(!/[^a-zA-Z]fetch\s*\(/.test(src), "no network calls in executor");
  assert.ok(!/\.from\(\s*['"]/.test(src), "no database access in executor");
  const ok = await requestQaRun(CTX, { suite: "smoke", environment: "staging", idempotencyKey: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
  assert.equal(ok.recorded, true);
  assert.match(ok.message, /human approval/);
  const bad = await requestQaRun(CTX, { suite: "smoke", environment: "production", idempotencyKey: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
  assert.equal(bad.recorded, false);
  assert.match(bad.message, /staging/);
  const badKey = await requestQaRun(CTX, { suite: "smoke", environment: "staging", idempotencyKey: "nope" });
  assert.equal(badKey.recorded, false);
});

// ---- static migration / registry / seed assertions -------------------------
test("migration 145 shape: tables, kinds, RLS, rollback, mirror", () => {
  const sql = fs.readFileSync(path.join(ROOT, "db", "migration_145_qa_execution.sql"), "utf8");
  const mirror = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "20260930000000_migration_145_qa_execution.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(ROOT, "db", "migration_145_qa_execution_rollback.sql"), "utf8");
  assert.equal(mirror, sql, "mirror matches canonical byte-for-byte");
  for (const needle of [
    "CREATE TABLE IF NOT EXISTS qa_runs", "CREATE TABLE IF NOT EXISTS qa_test_results",
    "claim_token_hash", "claim_expires_at", "metadata JSONB", "idempotency_key UUID NOT NULL UNIQUE",
    "CONSTRAINT qa_runs_terminal_needs_finish", "CONSTRAINT qa_results_unique_test",
    "idx_qa_runs_claim", "'qa_failure'", "request_qa_run", "'transactional','medium',true",
    "WHERE a.name = 'qa'", "Authenticated can read qa runs", "Authenticated can read qa test results",
  ]) {
    assert.ok(sql.includes(needle), `145 contains: ${needle}`);
  }
  assert.ok(!sql.includes("production"), "production unrepresentable in migration text");
  for (const needle of ["DROP TABLE IF EXISTS qa_test_results", "DROP TABLE IF EXISTS qa_runs", "Purge", "forward-fix"]) {
    assert.ok(rollback.includes(needle), `rollback covers: ${needle}`);
  }
  const reg = fs.readFileSync(path.join(ROOT, "lib", "ai", "tools-registry.ts"), "utf8");
  assert.ok(reg.includes("requestQaRunDefinition") && reg.includes("case 'request_qa_run'"), "tool wired in registry");
});
