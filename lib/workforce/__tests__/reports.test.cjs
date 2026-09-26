/**
 * Stage 5 hermetic tests: Reports list + detail data access.
 *
 * No database, no network. Fake chainable client captures the query chain.
 * Verifies: (1) list reads PERSISTED agent_reports rows with report_type
 * filter (no status column exists — asserted by absence of any status
 * filter), (2) tenant scoping on reports (+ incident hop), agents never
 * tenant-filtered, (3) linkage task→report via run_id hop and
 * report→incident via agent_run_id hop, (4) no-secrets scan: unknown
 * section keys render as descriptors (never raw values), tool entries as
 * names only, serialized VM scanned, (5) empty states, (6) id-shape guard.
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
  fetchReportList,
  fetchReportDetail,
  buildReportDetailViewModel,
  buildSectionViews,
  isReportTypeValue,
  isReportIdShape,
} = require("../reports");

const REPORT = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", agent_id: "a1", run_id: "r1", tenant_id: null,
  report_type: "task", summary: "Sweep complete", created_at: "2026-09-26T02:00:00Z",
  sections: {
    what_happened: "Prompt: summarize incidents",
    tool_calls: [{ tool: "get_active_incidents" }, { tool: "get_recent_events" }],
    knowledge_used: [{ title: "Ops", category: "operational" }],
    guard_verdict: "pass",
    provider: "gemini",
    duration_ms: 1200,
    future_unknown_blob: { nested: { secret: "RAW_MUST_NOT_RENDER" }, token: "abc" },
    mystery_scalar: "RAW_MUST_NOT_RENDER_EITHER",
  },
};
const ROWS = {
  agent_reports: [REPORT],
  agents: [{ id: "a1", name: "sentinel", display_name: "Sentinel" }],
  agent_runs: [{ task_id: "t1" }],
  incidents: [{ id: "i1", title: "api_error — boom", severity: "s2", status: "open" }],
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

test("list reads persisted rows with type filter (no status column)", async () => {
  const queries = [];
  const rows = await fetchReportList(fakeClient(queries), null, "task");
  assert.equal(rows.length, 1);
  const calls = firstCalls(queries, "agent_reports");
  assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "report_type" && v === "task"), "type filter applied");
  assert.ok(!calls.some(([m, c]) => m === "eq" && c === "status"), "no status filter — column does not exist");
  assert.ok(calls.some(([m, n]) => m === "limit" && n === 50), "bounded");
  assert.equal(isReportTypeValue("task"), true);
  assert.equal(isReportTypeValue("archived"), false);
});

test("list tenant scoping", async () => {
  const queries = [];
  await fetchReportList(fakeClient(queries), "tenant-3", null);
  const calls = firstCalls(queries, "agent_reports");
  assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "tenant_id" && v === "tenant-3"), "reports tenant-filtered");
});

test("detail linkage: run hop to task, agent_run_id hop to incident", async () => {
  const queries = [];
  const raw = await fetchReportDetail(fakeClient(queries), REPORT.id, "tenant-3");
  assert.ok(raw, "detail resolves");
  assert.equal(raw.agent.display_name, "Sentinel");
  assert.equal(raw.taskId, "t1", "task resolved via run hop");
  assert.equal(raw.incident.title, "api_error — boom", "incident resolved via agent_run_id hop");
  const runCalls = firstCalls(queries, "agent_runs");
  assert.ok(runCalls.some(([m, c, v]) => m === "eq" && c === "id" && v === "r1"), "run fetched by report run_id");
  const incCalls = firstCalls(queries, "incidents");
  assert.ok(incCalls.some(([m, c, v]) => m === "eq" && c === "agent_run_id" && v === "r1"), "incident hop via agent_run_id");
  assert.ok(incCalls.some(([m, c, v]) => m === "eq" && c === "tenant_id" && v === "tenant-3"), "incident hop tenant-scoped");
  const agentCalls = firstCalls(queries, "agents");
  assert.ok(!agentCalls.some(([m, c]) => m === "eq" && c === "tenant_id"), "agent lookup never tenant-filtered");
});

test("sections: whitelist renders, unknown keys become descriptors", () => {
  const views = buildSectionViews(REPORT.sections);
  const byKey = Object.fromEntries(views.map((v) => [v.key, v]));
  assert.equal(byKey["guard_verdict"].rendered, "pass");
  assert.ok(byKey["guard_verdict"].full, "known key fully rendered");
  assert.equal(byKey["tool_calls"].rendered, "get_active_incidents; get_recent_events", "tool entries as names only");
  assert.equal(byKey["future_unknown_blob"].full, false);
  assert.ok(!byKey["future_unknown_blob"].rendered.includes("RAW_MUST_NOT_RENDER"), "unknown object values never rendered");
  assert.equal(byKey["mystery_scalar"].full, false);
  assert.ok(!byKey["mystery_scalar"].rendered.includes("RAW_MUST_NOT_RENDER_EITHER"), "unknown scalars never rendered");
  assert.deepEqual(buildSectionViews(null), []);
  assert.deepEqual(buildSectionViews("oops"), []);
});

test("no secrets or unredacted args in the detail view model", async () => {
  const queries = [];
  const raw = await fetchReportDetail(fakeClient(queries), REPORT.id, null);
  const vm = buildReportDetailViewModel(raw);
  const dumped = JSON.stringify(vm).toLowerCase();
  for (const banned of ["system_prompt", "input_schema", "executor_ref", "service_role", "api_key", "secret", "password", "token", "raw_must_not_render", "args_redacted"]) {
    assert.ok(!dumped.includes(banned), `view model must not contain ${banned}`);
  }
  assert.equal(vm.empty.incident, false);
  assert.equal(vm.empty.task, false);
});

test("detail empty states (no run, no incident, no sections)", () => {
  const vm = buildReportDetailViewModel({
    report: { ...REPORT, run_id: null }, agent: null, taskId: null, sections: [], incident: null,
  });
  assert.deepEqual([vm.empty.sections, vm.empty.incident, vm.empty.task], [true, true, true]);
});

test("detail missing resolves null (page 404s); id shape guard", async () => {
  const client = { from: (t) => (t === "agent_reports" ? { select: () => ({ eq: () => ({ limit: () => ({ then: (r) => { r({ data: [], error: null }); return Promise.resolve(); } }) }) }) } : fakeClient([]).from(t)) };
  const raw = await fetchReportDetail(client, REPORT.id, null);
  assert.equal(raw, null);
  assert.equal(isReportIdShape(REPORT.id), true);
  assert.equal(isReportIdShape("zzz"), false);
});
