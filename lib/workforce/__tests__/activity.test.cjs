/**
 * Stage 6 hermetic tests: Activity feed data access + merge discipline.
 *
 * No database, no network. Fake chainable client captures the query chain.
 * Verifies: (1) all seven sources read bounded newest-first with tenant
 * scoping (agents never filtered), (2) coverage/no-double-count — each
 * source row yields exactly the documented entries, system native kinds
 * pass straight through, approval_block-style signal rows are NOT
 * re-derived (3) feed merged newest-first and hard-capped, (4) no secrets:
 * approval entries carry action/risk/status only (evidence never selected
 * anywhere in the module), serialized feed scanned, (5) empty state.
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

const { fetchActivityData, buildActivityFeed, FEED_CAP } = require("../activity");

const ROWS = {
  agents: [{ id: "a1", display_name: "Sentinel" }],
  agent_runs: [
    { id: "r1", agent_id: "a1", task_id: "t1", tenant_id: null, status: "completed", triggered_by: "cron", created_at: "2026-09-26T01:00:00Z", completed_at: "2026-09-26T01:01:00Z" },
    { id: "r2", agent_id: "a1", task_id: null, tenant_id: null, status: "running", triggered_by: "gateway", created_at: "2026-09-26T03:00:00Z", completed_at: null },
  ],
  agent_tasks: [
    { id: "t1", title: "Sweep", status: "completed", created_at: "2026-09-26T01:00:00Z", updated_at: "2026-09-26T01:00:00Z" },
    { id: "t2", title: "Old", status: "failed", created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-26T02:00:00Z" },
  ],
  approvals: [
    { id: "p1", action: "notifyOwner", risk: "medium", status: "pending", created_at: "2026-09-26T00:30:00Z", decided_at: null },
    { id: "p2", action: "notifyOwner", risk: "high", status: "approved", created_at: "2026-09-26T00:00:00Z", decided_at: "2026-09-26T00:10:00Z" },
  ],
  agent_reports: [{ id: "rep1", summary: "done", created_at: "2026-09-26T01:30:00Z" }],
  incidents: [
    { id: "i1", title: "api_error", severity: "s4", status: "open", event_count: 3, first_seen_at: "2026-09-26T00:00:00Z", last_seen_at: "2026-09-26T00:05:00Z" },
    { id: "i2", title: "job_error", severity: "s2", status: "resolved", event_count: 5, first_seen_at: "2026-09-25T00:00:00Z", last_seen_at: "2026-09-25T12:00:00Z" },
  ],
  system_events: [
    { id: "e1", kind: "guard_rejection", route: "POST /api/ai/gateway", created_at: "2026-09-26T02:30:00Z" },
    { id: "e2", kind: "approval_block", route: "POST /api/ai/gateway", created_at: "2026-09-26T02:31:00Z" },
  ],
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

test("reads all seven sources bounded newest-first", async () => {
  const queries = [];
  const raw = await fetchActivityData(fakeClient(queries), null);
  assert.equal(raw.runs.length, 2);
  for (const [table, limit] of [["agent_runs", 20], ["agent_tasks", 20], ["approvals", 10], ["agent_reports", 10], ["incidents", 10], ["system_events", 15]]) {
    const calls = firstCalls(queries, table);
    assert.ok(calls.some(([m, , o]) => m === "order" && o && o.ascending === false), `${table} newest-first`);
    assert.ok(calls.some(([m, n]) => m === "limit" && n === limit), `${table} bounded at ${limit}`);
  }
  const approvalSel = firstCalls(queries, "approvals").find(([m]) => m === "select")[1];
  assert.ok(!/evidence|proposed_outcome/.test(approvalSel), "evidence never selected in the feed path");
});

test("tenant scoping across sources; agents never filtered", async () => {
  const queries = [];
  await fetchActivityData(fakeClient(queries), "tenant-5");
  for (const table of ["agent_runs", "agent_tasks", "approvals", "agent_reports", "incidents", "system_events"]) {
    const calls = firstCalls(queries, table);
    assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "tenant_id" && v === "tenant-5"), `${table} tenant-filtered`);
  }
  const agentCalls = firstCalls(queries, "agents");
  assert.ok(!agentCalls.some(([m, c]) => m === "eq" && c === "tenant_id"), "agents never tenant-filtered");
});

function rawOf(store) {
  return {
    runs: store.agent_runs, tasks: store.agent_tasks, approvals: store.approvals,
    reports: store.agent_reports, incidents: store.incidents, events: store.system_events,
    agents: store.agents,
  };
}

test("coverage/no-double-count: exact entries per source row", () => {
  const feed = buildActivityFeed(rawOf(ROWS));
  const byKey = Object.fromEntries(feed.map((e) => [e.key, e]));
  // runs: exactly 1 each (finished uses completed_at; running uses created_at)
  assert.equal(byKey["run-r1"].title, "run completed");
  assert.equal(byKey["run-r1"].ts, "2026-09-26T01:01:00Z");
  assert.equal(byKey["run-r2"].title, "run started");
  assert.equal(byKey["run-r1"].href, "/admin/workforce/tasks/t1", "run links to its task");
  assert.equal(byKey["run-r2"].href, "/admin/workforce/agents", "taskless run links to agents");
  // tasks: created each; status-change only when updated_at moved
  assert.ok(byKey["task-t1-created"] && !byKey["task-t1-status"], "unmoved task yields one entry");
  assert.ok(byKey["task-t2-created"] && byKey["task-t2-status"], "moved task yields two entries");
  // approvals: created each + decided only when decided_at set
  assert.ok(byKey["approval-p1-created"] && !byKey["approval-p1-decided"], "pending approval yields one entry");
  assert.ok(byKey["approval-p2-created"] && byKey["approval-p2-decided"], "decided approval yields two entries");
  assert.equal(byKey["approval-p2-decided"].title, "approval approved");
  // reports/incidents/events: exactly 1 each
  assert.equal(byKey["report-rep1"].title, "report published");
  assert.equal(byKey["incident-i1"].title, "incident opened");
  assert.equal(byKey["incident-i1"].ts, "2026-09-26T00:00:00Z", "open incident anchored at first seen");
  assert.equal(byKey["incident-i1"].href, "/admin/workforce/sentinel/incidents/i1", "Stage 9: incident links to its detail page");
  assert.equal(byKey["event-e1"].href, "/admin/workforce/sentinel", "event lands on the Sentinel overview (no per-event route)");
  assert.equal(byKey["incident-i2"].title, "incident resolved");
  assert.equal(byKey["event-e1"].title, "guard_rejection", "native kinds pass straight through");
  assert.equal(byKey["event-e2"].title, "approval_block", "signal rows are not re-derived, only listed");
  assert.equal(feed.length, 2 + 3 + 3 + 1 + 2 + 2, "13 entries total — nothing doubled, nothing dropped");
});

test("feed merged newest-first and hard-capped", () => {
  const feed = buildActivityFeed(rawOf(ROWS));
  for (let i = 1; i < feed.length; i++) {
    assert.ok(feed[i - 1].ts >= feed[i].ts, "newest-first order");
  }
  assert.equal(feed[0].key, "run-r2", "latest entry first");
  assert.ok(feed.length <= FEED_CAP, "hard cap respected");
  assert.equal(FEED_CAP, 60);
});

test("no secrets or unredacted evidence in feed entries", () => {
  const feed = buildActivityFeed(rawOf(ROWS));
  const dumped = JSON.stringify(feed).toLowerCase();
  for (const banned of ["system_prompt", "input_schema", "executor_ref", "service_role", "api_key", "secret", "password", "token", "payload", "args_redacted", "evidence"]) {
    assert.ok(!dumped.includes(banned), `feed must not contain ${banned}`);
  }
});

test("empty state", () => {
  const feed = buildActivityFeed({ agents: [], runs: [], tasks: [], approvals: [], reports: [], incidents: [], events: [] });
  assert.deepEqual(feed, []);
});
