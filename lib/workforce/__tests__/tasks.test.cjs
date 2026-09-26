/**
 * Stage 3 hermetic tests: Tasks list + detail data access.
 *
 * No database, no network. Fake chainable client captures the query chain.
 * Verifies: (1) list reads agent_tasks with optional actual-state filter
 * (no invented states), (2) tenant scoping on tasks/runs/reports (steps
 * inherit scope via run ids; agents never tenant-filtered), (3) detail
 * linkage task→agent/runs/steps/reports, (4) no secrets or raw payloads
 * (payload/args_redacted never selected; step content only for errors and
 * truncated; serialized VM scanned), (5) empty states, (6) id-shape guard.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
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
  fetchTaskList,
  fetchTaskStatusCounts,
  fetchTaskDetail,
  buildTaskDetailViewModel,
  taskStatusLabel,
  isTaskIdShape,
  isTaskStatusValue,
} = require("../tasks");

const TASKS = [
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", agent_id: "a1", tenant_id: null, title: "Sweep", status: "completed", priority: "normal", created_at: "2026-09-26T02:00:00Z", updated_at: "2026-09-26T02:01:00Z" },
  { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", agent_id: "a1", tenant_id: null, title: "Queued work", status: "queued", priority: "high", created_at: "2026-09-26T03:00:00Z", updated_at: "2026-09-26T03:00:00Z" },
];
const ROWS = {
  agent_tasks: TASKS,
  agents: [{ id: "a1", name: "sentinel", display_name: "Sentinel" }],
  agent_runs: [{ id: "r1", status: "completed", triggered_by: "cron", guard_result: "pass", duration_ms: 1200, error: null, created_at: "2026-09-26T02:00:00Z", completed_at: "2026-09-26T02:01:00Z" }],
  agent_steps: [
    { id: "s1", run_id: "r1", seq: 0, kind: "tool_result", tool_name: "get_active_incidents", result_summary: "x".repeat(500), content: "SHOULD_BE_STRIPPED", guard_verdict: null, created_at: "2026-09-26T02:00:01Z" },
    { id: "s2", run_id: "r1", seq: 1, kind: "error", tool_name: null, result_summary: null, content: "y".repeat(500), guard_verdict: null, created_at: "2026-09-26T02:00:02Z" },
  ],
  agent_reports: [{ id: "rep1", report_type: "task", summary: "done", created_at: "2026-09-26T02:02:00Z" }],
};

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.calls = [];
  }
  select(cols, opts) { this.calls.push(["select", cols, opts]); return this; }
  eq(col, val) { this.calls.push(["eq", col, val]); return this; }
  in(col, vals) { this.calls.push(["in", col, vals]); return this; }
  order(col, opts) { this.calls.push(["order", col, opts]); return this; }
  limit(n) { this.calls.push(["limit", n]); return this; }
  then(resolve) {
    resolve({ data: ROWS[this.table] || [], error: null, count: null });
    return Promise.resolve();
  }
}

function fakeClient(queries) {
  return {
    queries,
    from(table) {
      const q = new FakeQuery(this, table);
      queries.push(q);
      return q;
    },
  };
}

function firstCalls(queries, table) {
  const q = queries.find((x) => x.table === table);
  assert.ok(q, `expected a query on ${table}`);
  return q.calls;
}

test("list reads tasks with actual-state filter only", async () => {
  const queries = [];
  const rows = await fetchTaskList(fakeClient(queries), null, "queued");
  assert.equal(rows.length, 2);
  const calls = firstCalls(queries, "agent_tasks");
  assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "status" && v === "queued"), "status filter applied");
  assert.ok(calls.some(([m, n]) => m === "limit" && n === 50), "bounded");
  const sel = calls.find(([m]) => m === "select")[1];
  assert.ok(!/payload/.test(sel), "payload never selected");
  // invented states rejected by the value guard (page falls back to unfiltered)
  assert.equal(isTaskStatusValue("pending"), false);
  assert.equal(isTaskStatusValue("queued"), true);
  assert.equal(isTaskStatusValue("awaiting_approval"), true);
  assert.equal(taskStatusLabel("queued"), "pending");
  assert.equal(taskStatusLabel("awaiting_approval"), "waiting for approval");
});

test("list tenant scoping", async () => {
  const queries = [];
  await fetchTaskList(fakeClient(queries), "tenant-7", null);
  const calls = firstCalls(queries, "agent_tasks");
  assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "tenant_id" && v === "tenant-7"), "tasks tenant-filtered");
  const counts = await fetchTaskStatusCounts(fakeClient([]), "tenant-7");
  assert.deepEqual(counts, { completed: 1, queued: 1 });
});

test("detail linkage + tenant scoping (steps inherit via run ids)", async () => {
  const queries = [];
  const raw = await fetchTaskDetail(fakeClient(queries), TASKS[0].id, "tenant-7");
  assert.ok(raw, "detail resolves");
  assert.equal(raw.agent.display_name, "Sentinel");
  for (const table of ["agent_tasks", "agent_runs", "agent_reports"]) {
    const calls = firstCalls(queries, table);
    assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "tenant_id" && v === "tenant-7"), `${table} tenant-filtered`);
  }
  const agentCalls = firstCalls(queries, "agents");
  assert.ok(!agentCalls.some(([m, c]) => m === "eq" && c === "tenant_id"), "agent lookup never tenant-filtered");
  const stepCalls = firstCalls(queries, "agent_steps");
  assert.ok(stepCalls.some(([m, c, v]) => m === "in" && c === "run_id" && v.includes("r1")), "steps scoped via run ids");
  assert.ok(!stepCalls.some(([m, c]) => m === "eq" && c === "tenant_id"), "steps carry no tenant column");
  assert.equal(raw.stepsByRun["r1"].length, 2);
  // truncation discipline applied at the boundary
  assert.ok(raw.stepsByRun["r1"][0].result_summary.endsWith("…[truncated]"), "long summaries truncated");
  assert.equal(raw.stepsByRun["r1"][0].content, null, "non-error content stripped");
  assert.ok(raw.stepsByRun["r1"][1].content.endsWith("…[truncated]"), "error content kept but truncated");
});

test("detail missing resolves null (page 404s)", async () => {
  const client = { from: (t) => (t === "agent_tasks" ? { select: () => ({ eq: () => ({ limit: () => ({ then: (r) => { r({ data: [], error: null }); return Promise.resolve(); } }) }) }) } : fakeClient([]).from(t)) };
  const raw = await fetchTaskDetail(client, "cccccccc-cccc-cccc-cccc-cccccccccccc", null);
  assert.equal(raw, null);
});

test("no secrets or raw payloads in the detail view model", async () => {
  const queries = [];
  const raw = await fetchTaskDetail(fakeClient(queries), TASKS[0].id, null);
  const vm = buildTaskDetailViewModel(raw);
  const dumped = JSON.stringify(vm).toLowerCase();
  for (const banned of ["system_prompt", "input_schema", "executor_ref", "service_role", "api_key", "secret", "payload", "args_redacted"]) {
    assert.ok(!dumped.includes(banned), `view model must not contain ${banned}`);
  }
  const selected = queries.flatMap((q) => q.calls.filter(([m]) => m === "select").map(([, cols]) => cols)).join(" ");
  for (const banned of ["payload", "args_redacted", "system_prompt"]) {
    assert.ok(!selected.includes(banned), `no query selects ${banned}`);
  }
  assert.equal(vm.statusLabel, "completed");
  assert.equal(vm.empty.reports, false);
});

test("detail empty state", () => {
  const vm = buildTaskDetailViewModel({
    task: TASKS[1], agent: null, runs: [], stepsByRun: {}, reports: [],
  });
  assert.equal(vm.statusLabel, "pending");
  assert.equal(vm.agent, null);
  assert.deepEqual([vm.empty.runs, vm.empty.steps, vm.empty.reports], [true, true, true]);
});

test("id shape guard", () => {
  assert.equal(isTaskIdShape("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), true);
  assert.equal(isTaskIdShape("nope"), false);
});
