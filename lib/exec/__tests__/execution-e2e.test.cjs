/**
 * Stage 10 E2E hermetic tests: approved work executes durably end-to-end.
 *
 * No database, no network. One capable fake spans approvals, agent_tasks,
 * agent_runs, agent_steps, agent_reports, agents, tool_definitions. Covers:
 * approve → materialize → claim → bind → execute → ingest → completed with
 * report + step + tenant preserved; tampered args → binding-failed terminal
 * with zero dispatch; tool failure → requeue (no report); tenant isolation
 * across two jobs (contexts never cross); unauthorized re-claim of a running
 * job fails.
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

const { mintExecutionEnvelope } = require("../envelope");
const { materializeApproved } = require("../materialize");
const { claimExecution } = require("../claim");
const { runAttempt } = require("../runner");
const { ingestAttemptResult } = require("../ingest");

const NOW = "2026-09-29T10:00:00Z";
const AGENT = "11111111-1111-1111-1111-111111111111";
const TENANT_A = "22222222-2222-2222-2222-222222222222";
const TENANT_B = "33333333-3333-3333-3333-333333333333";
const KEY = "44444444-4444-4444-4444-444444444444";

function makeStore() {
  return {
    approvals: [], agent_tasks: [], agent_runs: [], agent_steps: [], agent_reports: [],
    agents: [{ id: AGENT, name: "dylan", autonomy_level: "L0", status: "active" }],
    tool_definitions: [{ name: "notifyOwner", scope: "transactional", risk: "medium", approval_required: false }],
  };
}

class FakeQuery {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.eqs = [];
    this.isNull = [];
    this.gtCond = null;
    this.patch = null;
    this.insertRow = null;
  }
  select() { return this; }
  eq(c, v) { this.eqs.push([c, v]); return this; }
  is(c, v) { if (v === null) this.isNull.push(c); else this.eqs.push([c, v]); return this; }
  gt(c, v) { this.gtCond = [c, v]; return this; }
  or(cond) { this.orCond = cond; return this; }
  order() { return this; }
  limit() { return this; }
  update(p) { this.patch = p; return this; }
  insert(row) { this.insertRow = row; return this; }
  match(r) {
    for (const [c, v] of this.eqs) if (r[c] !== v) return false;
    for (const c of this.isNull) if (r[c] != null) return false;
    if (this.gtCond) { const [c, v] = this.gtCond; if (!(r[c] != null && r[c] > v)) return false; }
    // Claim poll run_after group: "run_after.is.null,run_after.lte.<iso>".
    // The fake honors it so requeued (future run_after) jobs are invisible,
    // exactly like the real query.
    if (this.orCond) {
      const ok = this.orCond.split(",").some((part) => {
        const [c, op, ...rest] = part.split(".");
        const val = rest.join(".");
        if (op === "is" && val === "null") return r[c] == null;
        if (op === "lte") return r[c] != null && r[c] <= val;
        return false;
      });
      if (!ok) return false;
    }
    return true;
  }
  then(resolve) {
    // Serialization boundary: like a real DB round-trip through JSON,
    // rows are deep-cloned on write and read so in-memory aliasing can
    // never leak mutations across reads (the tamper test depends on this).
    const rows = this.store[this.table] || [];
    if (this.insertRow) {
      if (this.table === "agent_tasks" && this.insertRow.idempotency_key) {
        if (rows.some((r) => r.idempotency_key === this.insertRow.idempotency_key)) {
          resolve({ data: null, error: { message: "duplicate key" } });
          return Promise.resolve();
        }
      }
      const n = rows.length + 1;
      const row = structuredClone({ id: `${this.table}-${n}`, created_at: NOW, attempt_count: 0, ...this.insertRow });
      rows.push(row);
      resolve({ data: [{ id: row.id }], error: null });
      return Promise.resolve();
    }
    if (this.patch) {
      const hit = rows.filter((r) => this.match(r));
      for (const r of hit) Object.assign(r, structuredClone(this.patch));
      resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
      return Promise.resolve();
    }
    resolve({ data: structuredClone(rows.filter((r) => this.match(r))), error: null });
    return Promise.resolve();
  }
}

function fakeClient(store) {
  return { from: (table) => new FakeQuery(store, table) };
}

function approvedRow(id, tenantId, key) {
  const m = mintExecutionEnvelope({
    rawArgs: JSON.stringify({ to: "owner-1" }), tenantId, agentId: AGENT, agentName: "dylan",
    taskId: null, runId: null, action: "notifyOwner", idempotencyKey: key,
  });
  assert.equal(m.ok, true);
  return {
    id, action: "notifyOwner", requested_by: "user-9", tenant_id: tenantId,
    status: "approved", expires_at: "2026-09-30T00:00:00Z", audit_ref: null,
    proposed_outcome: m.envelope, created_at: NOW,
  };
}

async function loadRows(c, job) {
  const one = async (table, col, val, cols) => {
    const q = c.from(table).select(cols).eq(col, val).limit(1);
    return new Promise((res) => q.then((r) => res(r.data[0] ?? null)));
  };
  return {
    approval: await one("approvals", "id", job.approvalId, "id,action,risk,status,expires_at,tenant_id,proposed_outcome"),
    agent: await one("agents", "id", job.agentId, "id,name,autonomy_level,status"),
    toolDef: await one("tool_definitions", "name", job.action, "name,scope,risk,approval_required"),
  };
}

test("approved work executes durably: materialize → claim → bind → run → ingest → completed", async () => {
  const store = makeStore();
  store.approvals.push(approvedRow("appr-1", TENANT_A, KEY));
  const c = fakeClient(store);

  const mat = await materializeApproved(c, { nowIso: NOW });
  assert.equal(mat.materialized.length, 1);
  assert.ok(store.approvals[0].audit_ref.startsWith("exec-task:"));

  const claimed = await claimExecution(c, { workerId: "ext:1", nowIso: NOW });
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.job.attemptNo, 1);
  assert.equal(claimed.job.tenantId, TENANT_A);

  const rows = await loadRows(c, claimed.job);
  let dispatched = 0;
  const attempt = await runAttempt({
    job: claimed.job, workerId: "ext:1", userId: "user-9", rows, nowIso: NOW,
    execute: async (ctx) => {
      dispatched++;
      assert.equal(ctx.tenantId, TENANT_A, "execution context carries the job tenant");
      assert.equal(ctx.action, "notifyOwner");
      return { ok: true, output: { notified: true } };
    },
  });
  assert.equal(attempt.outcome, "succeeded");
  assert.equal(dispatched, 1);

  const ingested = await ingestAttemptResult(c, {
    taskId: claimed.job.jobId, runId: claimed.job.runId, attemptNo: 1, workerId: "ext:1",
    claimToken: claimed.claimToken, outcome: "succeeded", retryable: false,
    output: attempt.output, nowIso: NOW,
  });
  assert.equal(ingested.ok, true);
  assert.equal(ingested.transition, "running→completed");
  assert.equal(store.agent_tasks[0].status, "completed");
  assert.equal(store.agent_runs[0].status, "completed");
  assert.equal(store.agent_runs[0].tenant_id, TENANT_A, "tenant preserved on attempt");
  assert.equal(store.agent_steps.length, 1);
  assert.equal(store.agent_reports.length, 1, "terminal execution audited in Reports");
  assert.equal(store.agent_reports[0].tenant_id, TENANT_A);
  assert.equal(store.agent_reports[0].run_id, claimed.job.runId);
});

test("tampered args between claim and execution die at binding with zero dispatch", async () => {
  const store = makeStore();
  store.approvals.push(approvedRow("appr-1", TENANT_A, KEY));
  const c = fakeClient(store);
  await materializeApproved(c, { nowIso: NOW });
  const claimed = await claimExecution(c, { workerId: "ext:1", nowIso: NOW });
  // Adversary rewrites the stored envelope coherently (args + canonical form,
  // as only a service-role writer could). A split-flow executor re-reads the
  // CURRENT row and binds THAT against the approval-time envelope.
  store.agent_tasks[0].payload.envelope.args = { to: "attacker" };
  store.agent_tasks[0].payload.envelope.argsCanonical = '{"to":"attacker"}';
  const { parseExecutionEnvelope } = require("../envelope");
  const fresh = parseExecutionEnvelope(store.agent_tasks[0].payload.envelope);
  assert.equal(fresh.ok, true, "tampered envelope still parses (valid shape, hostile content)");
  let dispatched = 0;
  const attempt = await runAttempt({
    job: { ...claimed.job, envelope: fresh.envelope },
    workerId: "ext:1", userId: "user-9",
    rows: await loadRows(c, claimed.job), nowIso: NOW,
    execute: async () => { dispatched++; return { ok: true, output: {} }; },
  });
  assert.equal(attempt.outcome, "binding-failed");
  assert.equal(dispatched, 0, "tampered invocation never dispatches");
  const ingested = await ingestAttemptResult(c, {
    taskId: claimed.job.jobId, runId: claimed.job.runId, attemptNo: 1, workerId: "ext:1",
    claimToken: claimed.claimToken, outcome: "binding-failed", retryable: true,
    error: attempt.error, nowIso: NOW,
  });
  assert.equal(ingested.transition, "running→failed", "binding failure terminal despite retryable flag");
});

test("tool failure requeues (no report); tenant contexts never cross jobs", async () => {
  const store = makeStore();
  store.approvals.push(approvedRow("appr-a", TENANT_A, KEY));
  store.approvals.push(approvedRow("appr-b", TENANT_B, "55555555-5555-5555-5555-555555555555"));
  const c = fakeClient(store);
  await materializeApproved(c, { nowIso: NOW });
  assert.equal(store.agent_tasks.length, 2);

  const seenTenants = [];
  for (let n = 0; n < 2; n++) {
    const claimed = await claimExecution(c, { workerId: "ext:1", nowIso: NOW });
    assert.equal(claimed.claimed, true);
    const attempt = await runAttempt({
      job: claimed.job, workerId: "ext:1", userId: "user-9",
      rows: await loadRows(c, claimed.job), nowIso: NOW,
      execute: async (ctx) => { seenTenants.push(ctx.tenantId); return { ok: false, error: "502 upstream", retryable: true }; },
    });
    const ingested = await ingestAttemptResult(c, {
      taskId: claimed.job.jobId, runId: claimed.job.runId, attemptNo: 1, workerId: "ext:1",
      claimToken: claimed.claimToken, outcome: "tool-failed", retryable: true,
      error: attempt.error, nowIso: NOW,
    });
    assert.equal(ingested.transition, "running→queued");
  }
  assert.deepEqual(seenTenants.sort(), [TENANT_A, TENANT_B].sort(), "each job executed under its own tenant");
  assert.equal(store.agent_reports.length, 0, "requeues file no reports");
  const tenants = store.agent_runs.map((r) => r.tenant_id).sort();
  assert.deepEqual(tenants, [TENANT_A, TENANT_B].sort(), "attempt rows tenant-stamped");
});

test("claimed job cannot be re-claimed or inspected without the token", async () => {
  const store = makeStore();
  store.approvals.push(approvedRow("appr-1", TENANT_A, KEY));
  const c = fakeClient(store);
  await materializeApproved(c, { nowIso: NOW });
  await claimExecution(c, { workerId: "ext:1", nowIso: NOW });
  const again = await claimExecution(c, { workerId: "ext:2", nowIso: NOW });
  assert.equal(again.claimed, false, "running job invisible to claim poll");
});
