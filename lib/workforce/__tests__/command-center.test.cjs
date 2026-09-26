/**
 * Stage 1 hermetic tests: Workforce Command Center data access.
 *
 * No database, no network. A fake chainable Supabase client captures the
 * query chain (tables, filters, ordering, limits) and returns canned rows.
 * Verifies: (1) data access reads the right tables bounded newest-first,
 * (2) tenant scoping contract (tenant eq on scoped tables only; never on
 * the agents platform registry; absent entirely when tenantId is null),
 * (3) pure view-model counts + designed empty states.
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

const { fetchCommandCenterData, buildCommandCenterViewModel } = require("../command-center");

const AGENTS = [
  { id: "a-dylan", name: "dylan", display_name: "Dylan", department: "executive", status: "active", autonomy_level: "L0", updated_at: "2026-09-26T00:00:00Z" },
  { id: "a-qa", name: "qa", display_name: "QA", department: "quality", status: "active", autonomy_level: "L0", updated_at: "2026-09-26T00:00:00Z" },
  { id: "a-old", name: "retired", display_name: "Retired", department: "x", status: "disabled", autonomy_level: "L0", updated_at: "2026-09-26T00:00:00Z" },
];
const RUNS = [
  { id: "r1", agent_id: "a-dylan", tenant_id: null, status: "running", triggered_by: "gateway", error: null, created_at: "2026-09-26T02:00:00Z", completed_at: null },
  { id: "r2", agent_id: "a-dylan", tenant_id: null, status: "failed", triggered_by: "gateway", error: "boom", created_at: "2026-09-26T01:00:00Z", completed_at: "2026-09-26T01:01:00Z" },
];
const ROWS = { agents: AGENTS, agent_runs: RUNS, agent_tasks: [], approvals: [], agent_reports: [], incidents: [], system_events: [] };

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.calls = [];
    this.singleCount = null;
  }
  select(cols, opts) { this.calls.push(["select", cols, opts]); return this; }
  eq(col, val) { this.calls.push(["eq", col, val]); return this; }
  is(col, val) { this.calls.push(["is", col, val]); return this; }
  in(col, vals) { this.calls.push(["in", col, vals]); return this; }
  order(col, opts) { this.calls.push(["order", col, opts]); return this; }
  limit(n) { this.calls.push(["limit", n]); return this; }
  then(resolve) {
    const isHeadCount = this.calls.some(([m, , o]) => m === "select" && o && o.head);
    if (isHeadCount) {
      const eqAgent = this.calls.find(([m, c]) => m === "eq" && c === "agent_id");
      const rows = eqAgent ? (this.client.qaRunsByAgent[eqAgent[2]] || []) : [];
      return Promise.resolve(resolve({ data: [], error: null, count: rows.length }));
    }
    resolve({ data: ROWS[this.table] || [], error: null, count: null });
    return Promise.resolve();
  }
}

function fakeClient(queries) {
  return {
    queries,
    qaRunsByAgent: { "a-qa": [{ id: "q1" }, { id: "q2" }] },
    from(table) {
      const q = new FakeQuery(this, table);
      queries.push(q);
      return q;
    },
  };
}

function callsFor(queries, table) {
  const q = queries.find((x) => x.table === table && !x.calls.some(([m, , o]) => m === "select" && o && o.head));
  assert.ok(q, `expected a list query on ${table}`);
  return q.calls;
}

test("reads runtime tables bounded newest-first", async () => {
  const queries = [];
  const raw = await fetchCommandCenterData(fakeClient(queries), null);
  assert.equal(raw.agents.length, 3);
  assert.equal(raw.runs.length, 2);
  for (const [table, limit] of [["agents", 50], ["agent_runs", 20], ["agent_tasks", 10], ["approvals", 10], ["agent_reports", 5], ["incidents", 10], ["system_events", 8]]) {
    const calls = callsFor(queries, table);
    assert.ok(calls.some(([m, , o]) => m === "order" && o && o.ascending === false), `${table} ordered newest-first`);
    assert.ok(calls.some(([m, n]) => m === "limit" && n === limit), `${table} bounded at ${limit}`);
  }
  assert.equal(raw.qaRunCount, 2);
});

test("tenant scoping: filters apply to scoped tables only, never agents", async () => {
  const queries = [];
  await fetchCommandCenterData(fakeClient(queries), "tenant-123");
  for (const table of ["agent_runs", "agent_tasks", "approvals", "agent_reports", "incidents", "system_events"]) {
    const calls = callsFor(queries, table);
    assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "tenant_id" && v === "tenant-123"), `${table} tenant-filtered`);
  }
  const agentCalls = callsFor(queries, "agents");
  assert.ok(!agentCalls.some(([m, c]) => m === "eq" && c === "tenant_id"), "agents registry never tenant-filtered");
});

test("tenant scoping: platform-wide admin view applies no tenant filter", async () => {
  const queries = [];
  await fetchCommandCenterData(fakeClient(queries), null);
  for (const q of queries) {
    assert.ok(!q.calls.some(([m, c]) => m === "eq" && c === "tenant_id"), `no tenant eq on ${q.table}`);
  }
});

test("view model derives counts, busy/idle, names", () => {
  const vm = buildCommandCenterViewModel({
    agents: AGENTS, runs: RUNS, tasks: [{ id: "t", agent_id: "a-dylan", tenant_id: null, title: "t", status: "queued", created_at: "2026-09-26T02:00:00Z" }],
    approvals: [{ id: "p", requested_by_agent_id: null, tenant_id: null, action: "x", risk: "high", status: "pending", created_at: "2026-09-26T02:00:00Z", expires_at: "2026-09-28T02:00:00Z" }],
    reports: [], incidents: [], events: [], qaRunCount: 2,
  });
  assert.equal(vm.counts.totalAgents, 3);
  assert.equal(vm.counts.activeAgents, 2);
  assert.equal(vm.counts.idleAgents, 1); // qa active but no busy run
  assert.equal(vm.counts.runningRuns, 1);
  assert.equal(vm.counts.failedRunsRecent, 1);
  assert.equal(vm.counts.activeTasks, 1);
  assert.equal(vm.counts.pendingApprovals, 1);
  assert.equal(vm.counts.qaRuns, 2);
  assert.equal(vm.agentNameById["a-dylan"], "Dylan");
  const dylan = vm.agents.find((a) => a.agent.name === "dylan");
  assert.equal(dylan.busy, true);
  assert.equal(dylan.lastRunAt, "2026-09-26T02:00:00Z");
  const qa = vm.agents.find((a) => a.agent.name === "qa");
  assert.equal(qa.busy, false);
  assert.equal(qa.lastRunAt, null);
  assert.equal(vm.empty.qa, false);
  assert.equal(vm.empty.reports, true);
});

test("empty state: zero agents/zero activity renders designed zeros, not fabrications", () => {
  const vm = buildCommandCenterViewModel({
    agents: [], runs: [], tasks: [], approvals: [], reports: [], incidents: [], events: [], qaRunCount: 0,
  });
  for (const [k, v] of Object.entries(vm.counts)) assert.equal(v, 0, `count ${k} is 0`);
  for (const [k, v] of Object.entries(vm.empty)) assert.equal(v, true, `empty flag ${k} set`);
  assert.deepEqual(vm.agents, []);
});
