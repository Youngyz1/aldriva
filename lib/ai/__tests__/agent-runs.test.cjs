/**
 * Stage 10.7 hermetic tests: agent-runs.ts persistence helpers.
 *
 * No database, no network. Overrides the createSupabaseAdmin export with a
 * capturing fake (the module under test looks it up per call). Covers:
 * createAgentRun insert shape + null-on-DB-error, completeAgentRun partial
 * patch + completed_at default + empty-id no-op, createAgentTask title cap +
 * defaults, addAgentStep redaction + caps + empty-id no-op, createAgentReport
 * summary cap + type. Fills the §14 "agent-runs.ts zero direct tests" gap.
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

const adminModule = require("@/lib/supabase-admin");

const calls = [];
let failNext = null;
class FakeQuery {
  constructor(table) {
    this.table = table;
    this.insertRow = null;
    this.patch = null;
    this.filters = [];
  }
  insert(row) { this.insertRow = row; return this; }
  update(p) { this.patch = p; return this; }
  eq(c, v) { this.filters.push([c, v]); return this; }
  select() { return this; }
  single() { return this; }
  then(resolve) {
    const err = failNext;
    failNext = null;
    calls.push({ table: this.table, insert: this.insertRow, patch: this.patch, filters: this.filters });
    if (err) {
      resolve({ data: null, error: { message: err } });
      return Promise.resolve();
    }
    resolve({ data: { id: `${this.table}-1` }, error: null });
    return Promise.resolve();
  }
}
const fakeAdmin = { from: (table) => new FakeQuery(table) };
adminModule.createSupabaseAdmin = () => fakeAdmin;

const {
  createAgentRun, completeAgentRun, createAgentTask, addAgentStep, createAgentReport,
} = require("../agent-runs");

function last(table) {
  return calls.filter((c) => c.table === table).pop();
}

test("createAgentRun inserts running run; DB error yields null (best-effort)", async () => {
  calls.length = 0;
  const id = await createAgentRun({ agentId: "a", tenantId: "t", taskId: "task", triggeredBy: "gateway", modelUsed: "m", providerUsed: "p" });
  assert.equal(id, "agent_runs-1");
  const q = last("agent_runs");
  assert.equal(q.insert.status, "running");
  assert.equal(q.insert.guard_result, "pass");
  assert.equal(q.insert.task_id, "task");
  failNext = "db down";
  assert.equal(await createAgentRun({ agentId: "a", tenantId: null, triggeredBy: "gateway" }), null);
});

test("completeAgentRun patches provided fields only + completed_at default; empty id no-op", async () => {
  calls.length = 0;
  await completeAgentRun("", { status: "completed" });
  assert.equal(calls.length, 0, "empty runId issues no query");
  await completeAgentRun("r1", { status: "failed", approval_id: "p1" });
  const q = last("agent_runs");
  assert.equal(q.patch.status, "failed");
  assert.equal(q.patch.approval_id, "p1");
  assert.ok(q.patch.completed_at, "completed_at defaulted");
  assert.ok(!("guard_result" in q.patch) && !("duration_ms" in q.patch) && !("error" in q.patch), "unprovided fields untouched");
  await completeAgentRun("r1", { error: "boom", completed_at: "2026-09-29T10:00:00Z" });
  const q2 = last("agent_runs");
  assert.equal(q2.patch.completed_at, "2026-09-29T10:00:00Z", "explicit completed_at kept");
});

test("createAgentTask caps title, defaults payload/status/priority", async () => {
  calls.length = 0;
  const id = await createAgentTask({ agentId: "a", tenantId: null, requestedBy: "u", title: "t".repeat(500) });
  assert.equal(id, "agent_tasks-1");
  const q = last("agent_tasks");
  assert.equal(q.insert.title.length, 200);
  assert.equal(q.insert.status, "completed");
  assert.equal(q.insert.priority, "normal");
  assert.deepEqual(q.insert.payload, {});
});

test("addAgentStep redacts args, caps content/summary; empty id no-op", async () => {
  calls.length = 0;
  await addAgentStep({ runId: "", seq: 0, kind: "tool_call" });
  assert.equal(calls.length, 0);
  await addAgentStep({
    runId: "r1", seq: 3, kind: "tool_result", toolName: "getEvent",
    args: { id: "x", api_key: "SECRET", nested: { deep: true }, n: 1 },
    content: "c".repeat(9000), resultSummary: "s".repeat(5000), guardVerdict: "pass",
  });
  const q = last("agent_steps");
  assert.equal(q.insert.seq, 3);
  assert.equal(q.insert.args_redacted.api_key, "[redacted]");
  assert.equal(q.insert.args_redacted.n, 1);
  assert.equal(q.insert.args_redacted.nested, "[complex]");
  assert.equal(q.insert.content.length, 4000);
  assert.equal(q.insert.result_summary.length, 2000);
});

test("createAgentReport caps summary, types task, defaults sections", async () => {
  calls.length = 0;
  const id = await createAgentReport({ agentId: "a", runId: "r1", tenantId: "t", summary: "s".repeat(9000) });
  assert.equal(id, "agent_reports-1");
  const q = last("agent_reports");
  assert.equal(q.insert.summary.length, 5000);
  assert.equal(q.insert.report_type, "task");
  assert.deepEqual(q.insert.sections, {});
  failNext = "db down";
  assert.equal(await createAgentReport({ agentId: "a", runId: null, tenantId: null, summary: "ten chars ok" }), null);
});
