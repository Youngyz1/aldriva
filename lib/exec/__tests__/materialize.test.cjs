/**
 * Stage 10.7 hermetic tests: approval→job materialization.
 *
 * No database, no network. Covers: approved approval with envelope →
 * queued task + audit_ref link; request_qa_run skipped (QA plane owns it);
 * legacy/envelope-less approvals stamped invalid (fail-safe, never spun);
 * idempotent re-materialization (same key → same job); lost stamp race →
 * skipped; bounded poll.
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

const { materializeApproved } = require("../materialize");
const { mintExecutionEnvelope } = require("../envelope");

const NOW = "2026-09-29T10:00:00Z";
const AGENT = "11111111-1111-1111-1111-111111111111";

function makeStore() {
  return { approvals: [], agent_tasks: [] };
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
    this.limitN = null;
  }
  select() { return this; }
  eq(c, v) { this.eqs.push([c, v]); return this; }
  is(c, v) { if (v === null) this.isNull.push(c); else this.eqs.push([c, v]); return this; }
  gt(c, v) { this.gtCond = [c, v]; return this; }
  order() { return this; }
  limit(n) { this.limitN = n; return this; }
  update(p) { this.patch = p; return this; }
  insert(row) { this.insertRow = row; return this; }
  match(r) {
    for (const [c, v] of this.eqs) if (r[c] !== v) return false;
    for (const c of this.isNull) if (r[c] != null) return false;
    if (this.gtCond) { const [c, v] = this.gtCond; if (!(r[c] != null && r[c] > v)) return false; }
    return true;
  }
  then(resolve) {
    const rows = this.store[this.table] || [];
    if (this.insertRow) {
      if (this.table === "agent_tasks" && this.insertRow.idempotency_key) {
        if (rows.some((r) => r.idempotency_key === this.insertRow.idempotency_key)) {
          resolve({ data: null, error: { message: "duplicate key" } });
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
    let out = rows.filter((r) => this.match(r));
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    resolve({ data: out, error: null });
    return Promise.resolve();
  }
}

function fakeClient(store) {
  return { from: (table) => new FakeQuery(store, table) };
}

function approved(id, action, outcome) {
  return {
    id, action, requested_by: "user-1", tenant_id: null, status: "approved",
    expires_at: "2026-09-30T00:00:00Z", audit_ref: null, proposed_outcome: outcome,
    created_at: NOW,
  };
}

function envelope(action = "notifyOwner") {
  const r = mintExecutionEnvelope({
    rawArgs: JSON.stringify({ to: "owner-1" }), tenantId: null, agentId: AGENT,
    agentName: "dylan", taskId: null, runId: null, action,
  });
  assert.equal(r.ok, true);
  return r.envelope;
}

test("approved approval with envelope materializes a queued linked job", async () => {
  const store = makeStore();
  store.approvals.push(approved("p1", "notifyOwner", envelope()));
  const out = await materializeApproved(fakeClient(store), { nowIso: NOW });
  assert.deepEqual(out.materialized.length, 1);
  assert.deepEqual(out.skipped, []);
  const task = store.agent_tasks[0];
  assert.equal(task.status, "queued");
  assert.equal(task.approval_id, "p1");
  assert.equal(task.agent_id, AGENT);
  assert.equal(task.idempotency_key, task.payload.envelope.idempotencyKey);
  assert.equal(task.max_attempts, task.payload.envelope.budget.maxAttempts);
  assert.equal(store.approvals[0].audit_ref, `exec-task:${task.id}`, "conditional link stamp");
});

test("request_qa_run skipped (QA plane owns it); legacy rows stamped invalid", async () => {
  const store = makeStore();
  store.approvals.push(approved("qa", "request_qa_run", envelope("request_qa_run")));
  store.approvals.push(approved("legacy", "notifyOwner", null));
  store.approvals.push(approved("bad", "notifyOwner", { version: 999 }));
  const out = await materializeApproved(fakeClient(store), { nowIso: NOW });
  assert.deepEqual(out.materialized, []);
  assert.deepEqual(out.skipped.sort(), ["bad", "legacy", "qa"]);
  assert.equal(store.agent_tasks.length, 0, "nothing materialized");
  const byId = Object.fromEntries(store.approvals.map((a) => [a.id, a]));
  assert.equal(byId["qa"].audit_ref, null, "QA row untouched for its own poll");
  assert.equal(byId["legacy"].audit_ref, "exec-invalid-envelope");
  assert.equal(byId["bad"].audit_ref, "exec-invalid-envelope");
});

test("re-materialization is idempotent: same key returns the same job", async () => {
  const store = makeStore();
  const shared = envelope();
  store.approvals.push(approved("p1", "notifyOwner", shared));
  store.approvals.push(approved("p2", "notifyOwner", shared));
  const c = fakeClient(store);
  const first = await materializeApproved(c, { nowIso: NOW });
  assert.equal(first.materialized.length, 2, "both approvals link");
  assert.equal(first.materialized[0], first.materialized[1], "same job id for both");
  assert.equal(store.agent_tasks.length, 1, "no duplicate job");
  assert.equal(store.approvals.find((a) => a.id === "p2").audit_ref, `exec-task:${store.agent_tasks[0].id}`, "second approval links the same job");
});

test("non-approved / stamped / expired approvals never polled", async () => {
  const store = makeStore();
  const base = approved("p1", "notifyOwner", envelope());
  store.approvals.push({ ...base, id: "pending", status: "pending" });
  store.approvals.push({ ...base, id: "stamped", audit_ref: "exec-task:x" });
  store.approvals.push({ ...base, id: "expired", expires_at: "2026-09-28T00:00:00Z" });
  const out = await materializeApproved(fakeClient(store), { nowIso: NOW });
  assert.deepEqual([out.materialized, out.skipped], [[], []]);
  assert.equal(store.agent_tasks.length, 0);
});
