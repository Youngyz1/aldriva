/**
 * Stage 10.6 hermetic tests: idempotent forward-only ingest.
 *
 * No database, no network. Fake emulates conditional updates. Covers:
 * success → completed; duplicate + concurrent replays → no-op; stale
 * attempt; wrong job/worker/token; expired lease; terminal freeze (never
 * regresses); retryable → requeue with backoff vs previous attempt;
 * permanent/budget/binding → terminal failed; audit step written exactly
 * once; cross-job token rejected.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;
require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
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

const { ingestAttemptResult } = require("../ingest");
const { mintExecClaimToken } = require("../tokens");

const NOW = "2026-09-29T10:00:00Z";
const FUTURE = "2026-09-29T10:15:00Z";
const PAST = "2026-09-29T09:00:00Z";

function makeStore() {
  return { agent_tasks: [], agent_runs: [], agent_steps: [], agent_reports: [] };
}

class FakeQuery {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.eqs = [];
    this.patch = null;
    this.insertRow = null;
    this.orderDesc = false;
    this.limitN = null;
  }
  select() { return this; }
  eq(c, v) { this.eqs.push([c, v]); return this; }
  order(c, o) { this.orderDesc = !(o && o.ascending); return this; }
  limit(n) { this.limitN = n; return this; }
  update(p) { this.patch = p; return this; }
  insert(row) { this.insertRow = row; return this; }
  match(r) { return this.eqs.every(([c, v]) => r[c] === v); }
  then(resolve) {
    const rows = this.store[this.table] || [];
    if (this.insertRow) {
      const row = { id: `${this.table}-${rows.length + 1}`, created_at: NOW, ...this.insertRow };
      rows.push(row);
      resolve({ data: [{ id: row.id }], error: null });
      return Promise.resolve();
    }
    if (this.patch) {
      const hit = rows.filter((r) => this.match(r));
      for (const r of hit) Object.assign(r, this.patch);
      resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
      return Promise.resolve();
    }
    let out = rows.filter((r) => this.match(r));
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    resolve({ data: out, error: null });
    return Promise.resolve();
  }
}

function fakeClient(store) {
  return { from: (table) => new FakeQuery(store, table) };
}

function claimedJob(store, over = {}) {
  const minted = mintExecClaimToken(Date.parse(NOW));
  const task = {
    id: "task-1", status: "running", lease_owner: "w1", lease_expires_at: FUTURE,
    claim_token_hash: minted.hash, attempt_count: 1, max_attempts: 3,
    tenant_id: "t", agent_id: "a", approval_id: "p",
    ...over,
  };
  const run = { id: "run-1", task_id: task.id, attempt_no: 1, status: "running" };
  store.agent_tasks.push(task);
  store.agent_runs.push(run);
  return { task, run, token: minted.token };
}

function ingestInput(fx, over = {}) {
  return {
    taskId: fx.task.id, runId: fx.run.id, attemptNo: 1, workerId: "w1",
    claimToken: fx.token, outcome: "succeeded", retryable: false,
    output: { receipt: "ok" }, nowIso: NOW, ...over,
  };
}

test("success ingests once: completed, lease consumed, audit step written", async () => {
  const store = makeStore();
  const fx = claimedJob(store);
  const out = await ingestAttemptResult(fakeClient(store), ingestInput(fx));
  assert.equal(out.ok, true);
  assert.equal(out.transition, "running→completed");
  assert.equal(store.agent_tasks[0].status, "completed");
  assert.equal(store.agent_tasks[0].result_ref, "exec-run:run-1");
  assert.equal(store.agent_tasks[0].claim_token_hash, null, "single-use token consumed");
  assert.equal(store.agent_tasks[0].lease_owner, null);
  assert.equal(store.agent_runs[0].status, "completed");
  assert.ok(store.agent_runs[0].completed_at, "attempt timed");
  assert.equal(store.agent_steps.length, 1);
  assert.equal(store.agent_steps[0].kind, "tool_result");
  assert.equal(store.agent_steps[0].seq, 0);
  assert.equal(store.agent_reports.length, 1, "terminal execution files one report");
  assert.equal(store.agent_reports[0].report_type, "task");
  assert.ok(store.agent_reports[0].summary.includes("completed"));
  assert.equal(store.agent_reports[0].run_id, "run-1");
});

test("duplicate + concurrent replays converge: no duplicate effects", async () => {
  const store = makeStore();
  const fx = claimedJob(store);
  const c = fakeClient(store);
  const first = await ingestAttemptResult(c, ingestInput(fx));
  const second = await ingestAttemptResult(c, ingestInput(fx));
  const third = await ingestAttemptResult(c, ingestInput(fx, { claimToken: "consumed-token" }));
  assert.equal(first.ok, true);
  assert.deepEqual([second.ok, second.duplicate, third.ok, third.duplicate], [true, true, true, true]);
  assert.equal(store.agent_steps.length, 1, "no duplicate audit emission");
  assert.equal(store.agent_reports.length, 1, "no duplicate report on replay");
  assert.equal(store.agent_tasks[0].status, "completed", "terminal freeze");
});

test("stale / wrong / expired results rejected with no writes", async () => {
  const store = makeStore();
  const fx = claimedJob(store);
  const c = fakeClient(store);
  assert.equal((await ingestAttemptResult(c, ingestInput(fx, { attemptNo: 2 }))).ok, false, "stale attempt");
  assert.equal((await ingestAttemptResult(c, ingestInput(fx, { runId: "run-9" }))).ok, false, "unknown run");
  assert.equal((await ingestAttemptResult(c, ingestInput(fx, { taskId: "task-9" }))).ok, false, "unknown job");
  assert.equal((await ingestAttemptResult(c, ingestInput(fx, { workerId: "w2" }))).ok, false, "wrong worker");
  assert.equal((await ingestAttemptResult(c, ingestInput(fx, { claimToken: "wrong" }))).ok, false, "wrong token");
  store.agent_tasks[0].lease_expires_at = PAST;
  assert.equal((await ingestAttemptResult(c, ingestInput(fx))).ok, false, "expired lease");
  assert.equal(store.agent_tasks[0].status, "running", "rejected results write nothing");
  assert.equal(store.agent_steps.length, 0);
});

test("cross-job token rejected (job isolation at ingest)", async () => {
  const store = makeStore();
  const a = claimedJob(store);
  const b = claimedJob(store, { id: "task-2" });
  store.agent_runs.push({ id: "run-2", task_id: "task-2", attempt_no: 1, status: "running" });
  const out = await ingestAttemptResult(fakeClient(store), ingestInput(b, { claimToken: a.token }));
  assert.equal(out.ok, false, "job A token never authorizes job B");
});

test("retryable failure requeues with backoff; next attempt independent", async () => {
  const store = makeStore();
  const fx = claimedJob(store);
  const c = fakeClient(store);
  const out = await ingestAttemptResult(c, ingestInput(fx, { outcome: "timeout", retryable: true, error: "attempt timeout" }));
  assert.equal(out.ok, true);
  assert.equal(out.transition, "running→queued");
  const task = store.agent_tasks[0];
  assert.ok(Date.parse(task.run_after) > Date.parse(NOW), "deterministic backoff delay");
  assert.equal(task.claim_token_hash, null, "new claim mints a new token");
  assert.equal(store.agent_runs[0].status, "failed", "attempt closed with error");
  assert.ok(store.agent_runs[0].error.includes("timeout"));
  assert.equal(store.agent_reports.length, 0, "requeue files no report (next attempt reports)");
  // Next attempt (simulated reclaim+claim) ingests under its own identity.
  const minted = mintExecClaimToken(Date.parse(NOW));
  Object.assign(task, {
    status: "running", lease_owner: "w1", lease_expires_at: FUTURE,
    claim_token_hash: minted.hash, attempt_count: 2, run_after: null,
  });
  store.agent_runs.push({ id: "run-2", task_id: task.id, attempt_no: 2, status: "running" });
  const retry = await ingestAttemptResult(c, {
    taskId: task.id, runId: "run-2", attemptNo: 2, workerId: "w1",
    claimToken: minted.token, outcome: "succeeded", retryable: false,
    output: { receipt: "second try" }, nowIso: NOW,
  });
  assert.equal(retry.ok, true);
  assert.equal(task.status, "completed");
});

test("permanent, exhausted, and binding failures are terminal", async () => {
  const store = makeStore();
  const fx = claimedJob(store);
  const c = fakeClient(store);
  const perm = await ingestAttemptResult(c, ingestInput(fx, { outcome: "tool-failed", retryable: false, error: "invalid args" }));
  assert.equal(perm.transition, "running→failed");
  assert.ok(store.agent_tasks[0].result_ref.startsWith("exec-failed"), "auditable reason");

  const store2 = makeStore();
  const fx2 = claimedJob(store2, { attempt_count: 3, max_attempts: 3 });
  const exh = await ingestAttemptResult(fakeClient(store2), ingestInput(fx2, { outcome: "timeout", retryable: true }));
  assert.equal(exh.transition, "running→failed", "budget spent beats retryable");

  const store3 = makeStore();
  const fx3 = claimedJob(store3);
  const bind = await ingestAttemptResult(fakeClient(store3), ingestInput(fx3, { outcome: "binding-failed", retryable: true, error: "tenant changed" }));
  assert.equal(bind.transition, "running→failed", "binding failure always terminal");
  assert.ok(store3.agent_tasks[0].result_ref.includes("binding"), "reason preserved");
});

test("completed jobs never regress, even with a live-looking token", async () => {
  const store = makeStore();
  const fx = claimedJob(store);
  const c = fakeClient(store);
  await ingestAttemptResult(c, ingestInput(fx));
  const again = await ingestAttemptResult(c, ingestInput(fx, { outcome: "tool-failed", retryable: true }));
  assert.deepEqual([again.ok, again.duplicate], [true, true], "terminal freeze wins");
  assert.equal(store.agent_tasks[0].status, "completed");
  assert.equal(store.agent_steps.length, 1);
});
