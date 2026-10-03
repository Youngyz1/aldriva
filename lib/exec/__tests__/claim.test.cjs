/**
 * Stage 10.2 hermetic tests: worker tokens + atomic claim.
 *
 * No database, no network. Capable fake emulates conditional updates
 * (filter matching incl. .or() run_after groups). Covers: Layer-1 auth
 * (fail-closed, PREV rotation), claim-token mint/verify/TTL, enqueue
 * idempotency, two-workers race (exactly one wins), invalid envelope
 * terminal, invalid approval terminal, budget exhaustion terminal,
 * owner-guarded release, bad workerId.
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

const {
  mintExecClaimToken, verifyExecClaimToken, isAuthorizedWorkerRequest, EXEC_CLAIM_TTL_MS,
} = require("../tokens");
const { enqueueExecution, claimExecution, releaseClaim } = require("../claim");
const { mintExecutionEnvelope } = require("../envelope");

const NOW = "2026-09-29T10:00:00Z";
const AGENT = "11111111-1111-1111-1111-111111111111";
const TENANT = "22222222-2222-2222-2222-222222222222";
const KEY = "44444444-4444-4444-4444-444444444444";

function envelope(action = "request_qa_run", agentName = "qa") {
  const r = mintExecutionEnvelope({
    rawArgs: JSON.stringify({ suite: "smoke", environment: "staging", idempotencyKey: KEY }),
    tenantId: TENANT, agentId: AGENT, agentName, taskId: null, runId: null, action,
  });
  assert.equal(r.ok, true);
  return r.envelope;
}

// ---- capable fake with conditional-write semantics -------------------------
function makeStore() {
  return { agent_tasks: [], agent_runs: [], approvals: [] };
}

function matchOr(row, cond) {
  // "run_after.is.null,run_after.lte.<iso>"
  return cond.split(",").some((part) => {
    const [col, op, ...rest] = part.split(".");
    const val = rest.join(".");
    if (op === "is" && val === "null") return row[col] == null;
    if (op === "lte") return row[col] != null && row[col] <= val;
    if (op === "eq") return String(row[col]) === val;
    return false;
  });
}

class FakeQuery {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.eqs = [];
    this.orCond = null;
    this.patch = null;
    this.insertRow = null;
  }
  select() { return this; }
  eq(c, v) { this.eqs.push([c, v]); return this; }
  or(cond) { this.orCond = cond; return this; }
  order() { return this; }
  limit() { return this; }
  update(p) { this.patch = p; return this; }
  insert(row) { this.insertRow = row; return this; }
  match(r) {
    for (const [c, v] of this.eqs) if (r[c] !== v) return false;
    if (this.orCond && !matchOr(r, this.orCond)) return false;
    return true;
  }
  then(resolve) {
    const rows = this.store[this.table] || [];
    if (this.insertRow) {
      if (this.table === "agent_tasks" && this.insertRow.idempotency_key) {
        if (rows.some((r) => r.idempotency_key === this.insertRow.idempotency_key)) {
          resolve({ data: null, error: { message: "duplicate key value violates unique constraint" } });
          return Promise.resolve();
        }
      }
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
    resolve({ data: rows.filter((r) => this.match(r)), error: null });
    return Promise.resolve();
  }
}

function fakeClient(store) {
  return { from: (table) => new FakeQuery(store, table) };
}

function queuedJob(store, over = {}) {
  const row = {
    id: `task-${store.agent_tasks.length + 1}`, agent_id: AGENT, tenant_id: TENANT,
    approval_id: null, status: "queued", attempt_count: 0, max_attempts: 3,
    run_after: null, payload: { envelope: envelope() }, ...over,
  };
  store.agent_tasks.push(row);
  return row;
}

// ---- tokens -----------------------------------------------------------------
test("Layer-1 worker auth: fail-closed, exact bearer, PREV rotation", () => {
  assert.equal(isAuthorizedWorkerRequest(null, "s"), false);
  assert.equal(isAuthorizedWorkerRequest("Bearer s", null), false);
  assert.equal(isAuthorizedWorkerRequest("Bearer s", undefined), false);
  assert.equal(isAuthorizedWorkerRequest("Bearer s", ""), false);
  assert.equal(isAuthorizedWorkerRequest("Bearer wrong", "s"), false);
  assert.equal(isAuthorizedWorkerRequest("Bearer s", "s"), true);
  assert.equal(isAuthorizedWorkerRequest("Bearer old", "new", "old"), true, "rotation overlap");
  assert.equal(isAuthorizedWorkerRequest("Bearer old", "new"), false);
});

test("claim token mint/verify: hash at rest, TTL clamp, expiry enforced", () => {
  const m = mintExecClaimToken(Date.parse(NOW));
  assert.equal(m.token.length, 64);
  assert.ok(m.hash && m.hash !== m.token);
  assert.equal(m.expiresAtIso, new Date(Date.parse(NOW) + EXEC_CLAIM_TTL_MS).toISOString());
  assert.equal(verifyExecClaimToken(m.token, m.hash, m.expiresAtIso, NOW), true);
  assert.equal(verifyExecClaimToken("wrong", m.hash, m.expiresAtIso, NOW), false);
  assert.equal(verifyExecClaimToken(m.token, m.hash, m.expiresAtIso, "2026-09-29T12:00:00Z"), false, "expired");
  assert.equal(verifyExecClaimToken(m.token, null, m.expiresAtIso, NOW), false);
  const clamped = mintExecClaimToken(Date.parse(NOW), 999999999);
  assert.ok(Date.parse(clamped.expiresAtIso) - Date.parse(NOW) <= 2 * 60 * 60 * 1000, "TTL clamped to max");
});

// ---- enqueue ----------------------------------------------------------------
test("enqueue is idempotent on idempotencyKey; payload carries the envelope", async () => {
  const store = makeStore();
  const c = fakeClient(store);
  const first = await enqueueExecution(c, {
    agentId: AGENT, tenantId: TENANT, title: "QA smoke", action: "request_qa_run",
    envelope: envelope(), approvalId: null, idempotencyKey: KEY,
  }, NOW);
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, undefined);
  const second = await enqueueExecution(c, {
    agentId: AGENT, tenantId: TENANT, title: "QA smoke", action: "request_qa_run",
    envelope: envelope(), approvalId: null, idempotencyKey: KEY,
  }, NOW);
  assert.equal(second.ok, true);
  assert.equal(second.jobId, first.jobId);
  assert.equal(second.duplicate, true);
  assert.equal(store.agent_tasks.length, 1);
  const row = store.agent_tasks[0];
  assert.equal(row.status, "queued");
  assert.ok(row.payload && row.payload.envelope && row.payload.envelope.version === 1, "envelope in payload, never raw args");
});

// ---- claim ------------------------------------------------------------------
test("two workers race for one job: exactly one claim succeeds", async () => {
  const store = makeStore();
  queuedJob(store);
  const c = fakeClient(store);
  const w1 = await claimExecution(c, { workerId: "gha:1", nowIso: NOW });
  const w2 = await claimExecution(c, { workerId: "gha:2", nowIso: NOW });
  assert.equal(w1.claimed, true);
  assert.equal(w2.claimed, false, "loser observes, never errors");
  assert.equal(w1.job.attemptNo, 1);
  assert.equal(w1.claimToken.length, 64);
  const row = store.agent_tasks[0];
  assert.equal(row.status, "running");
  assert.equal(row.lease_owner, "gha:1");
  assert.ok(row.claim_token_hash && !row.claim_token_hash.includes(w1.claimToken), "hash at rest, never plaintext");
  assert.equal(row.attempt_count, 1);
  assert.equal(store.agent_runs.length, 1, "numbered attempt row created");
  assert.equal(store.agent_runs[0].attempt_no, 1);
  assert.equal(store.agent_runs[0].status, "running");
});

test("invalid envelope rows go terminal, never claimed or spun on", async () => {
  const store = makeStore();
  queuedJob(store, { payload: { envelope: { version: 999 } } });
  const out = await claimExecution(fakeClient(store), { workerId: "w", nowIso: NOW });
  assert.equal(out.claimed, false);
  assert.equal(store.agent_tasks[0].status, "failed");
  assert.ok(store.agent_tasks[0].result_ref.startsWith("exec-invalid-envelope"), "auditable reason");
  assert.equal(store.agent_runs.length, 0, "no attempt row for invalid jobs");
});

test("jobs with dead approvals go terminal (missing/rejected/expired)", async () => {
  for (const [label, approvalRow] of [
    ["missing", null],
    ["rejected", { id: "p1", action: "request_qa_run", risk: "medium", status: "rejected", expires_at: "2026-09-30T00:00:00Z" }],
    ["expired", { id: "p1", action: "request_qa_run", risk: "medium", status: "approved", expires_at: "2026-09-28T00:00:00Z" }],
  ]) {
    const store = makeStore();
    if (approvalRow) store.approvals.push(approvalRow);
    queuedJob(store, { approval_id: "p1" });
    const out = await claimExecution(fakeClient(store), { workerId: "w", nowIso: NOW });
    assert.equal(out.claimed, false, label);
    assert.equal(store.agent_tasks[0].status, "failed", label);
    assert.ok(store.agent_tasks[0].result_ref.startsWith("exec-invalid-approval"), `${label} auditable`);
  }
});

test("budget exhaustion is terminal, not retried", async () => {
  const store = makeStore();
  queuedJob(store, { attempt_count: 3, max_attempts: 3 });
  const out = await claimExecution(fakeClient(store), { workerId: "w", nowIso: NOW });
  assert.equal(out.claimed, false);
  assert.equal(store.agent_tasks[0].result_ref, "exec-budget-exhausted");
});

test("release is owner-guarded; bad workerId rejected", async () => {
  const store = makeStore();
  queuedJob(store);
  const c = fakeClient(store);
  assert.deepEqual(await claimExecution(c, { workerId: "", nowIso: NOW }), { claimed: false, message: "bad workerId" });
  await claimExecution(c, { workerId: "owner", nowIso: NOW });
  assert.equal(await releaseClaim(c, "task-1", "intruder", NOW), false, "wrong worker cannot release");
  assert.equal(store.agent_tasks[0].status, "running", "lease intact");
  assert.equal(await releaseClaim(c, "task-1", "owner", NOW), true);
  assert.equal(store.agent_tasks[0].status, "queued");
  assert.equal(store.agent_tasks[0].lease_owner, null);
  assert.equal(store.agent_tasks[0].claim_token_hash, null);
});
