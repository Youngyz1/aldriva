/**
 * Stage 21 (P1) — workforce shell tree tests (hermetic).
 *
 * Pure grouping/sorting/counts + aggregated-query wiring with a fake
 * client: approvals grouped by requested_by_agent_id in ONE query, open
 * incidents per agent via ONE batched hop (never per-row), requireAdmin
 * before any read when no client is injected.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    filename
  );
};
require.extensions[".tsx"] = require.extensions[".ts"];

// Server-only deps stubbed: tests inject an explicit fake client, except
// the gate-order test which asserts requireAdmin runs before any read.
const order = [];
const authPath = path.join(ROOT, "lib", "auth.ts");
require.cache[authPath] = {
  exports: {
    requireAdmin: async () => {
      order.push("requireAdmin");
    },
  },
};
let serverClient = null;
const supabaseServerPath = path.join(ROOT, "lib", "supabase-server.ts");
require.cache[supabaseServerPath] = {
  exports: {
    createSupabaseServer: async () => serverClient,
  },
};

const { buildWorkforceTree, fetchWorkforceTree } = require("../tree");
const { buildOfficeSnapshot } = require("../office");

function raw(over = {}) {
  return {
    agents: [
      { id: "a1", name: "dylan", display_name: "Dylan", department: "executive", status: "active" },
      { id: "a2", name: "sentinel", display_name: "Sentinel", department: "reliability", status: "active" },
      { id: "a3", name: "newbot", display_name: "Newbot", department: "field-ops", status: "active" },
    ],
    runs: [
      { id: "r1", agent_id: "a1", status: "running", approval_id: null, created_at: "2026-09-30T00:00:00Z", completed_at: null },
    ],
    tasks: [
      { id: "t1", agent_id: "a1", title: "do things", status: "running", created_at: "2026-09-30T00:00:00Z" },
    ],
    approvals: [],
    reports: [],
    incidents: [],
    events: [],
    qaRunCount: 0,
    decidedApprovalIds: [],
    ...over,
  };
}

function fakeClient(tables) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const b = {
        select(...args) {
          calls.push(["select", table, args[0] ?? null]);
          return b;
        },
        eq(c, v) {
          calls.push(["eq", table, c, v]);
          return b;
        },
        in(c, v) {
          calls.push(["in", table, c, v]);
          return b;
        },
        not(c, op, v) {
          calls.push(["not", table, c, op, v]);
          return b;
        },
        or() {
          return b;
        },
        order() {
          return b;
        },
        limit() {
          return b;
        },
        then(res) {
          return Promise.resolve({ data: tables[table] ?? [], error: null }).then(res);
        },
      };
      return b;
    },
  };
  return client;
}

test("tree groups by department sorted, agents sorted, counts rolled up", () => {
  const snap = buildOfficeSnapshot(raw());
  const tree = buildWorkforceTree(snap, { a1: 2 }, { a2: 1 });
  assert.deepEqual(
    tree.map((d) => d.department),
    ["executive", "field-ops", "reliability"],
    "departments sorted, none hardcoded"
  );
  const exec = tree.find((d) => d.department === "executive");
  assert.equal(exec.agents[0].id, "a1");
  assert.equal(exec.agents[0].pendingApprovals, 2);
  assert.equal(exec.agents[0].presence, "busy", "presence reuses snapshot logic");
  assert.equal(exec.agents[0].currentTaskTitle, "do things");
  assert.equal(exec.pendingApprovals, 2, "department rollup");
  const rel = tree.find((d) => d.department === "reliability");
  assert.equal(rel.agents[0].openIncidents, 1);
  assert.equal(rel.openIncidents, 1);
});

test("a new registry department appears with zero code mapping", () => {
  const snap = buildOfficeSnapshot(raw());
  const tree = buildWorkforceTree(snap, {}, {});
  assert.ok(tree.some((d) => d.department === "field-ops" && d.agents.some((a) => a.id === "a3")));
});

test("fetch aggregates approvals in ONE query, null requesters skipped", async () => {
  const client = fakeClient({
    agents: raw().agents,
    agent_runs: raw().runs,
    agent_tasks: raw().tasks,
    approvals: [
      { requested_by_agent_id: "a1" },
      { requested_by_agent_id: "a1" },
      { requested_by_agent_id: null },
    ],
    agent_reports: [],
    incidents: [],
    system_events: [],
    qa_runs: [],
  });
  const tree = await fetchWorkforceTree(client);
  const groupQueries = client.calls.filter((c) => c[0] === "select" && c[1] === "approvals" && c[2] === "requested_by_agent_id");
  assert.equal(groupQueries.length, 1, "single pending-approvals grouping query");
  const a1 = tree.flatMap((d) => d.agents).find((a) => a.id === "a1");
  assert.equal(a1.pendingApprovals, 2, "null requester skipped");
});

test("fetch resolves incidents via ONE batched run hop, never per-row", async () => {
  const client = fakeClient({
    agents: raw().agents,
    agent_runs: [
      ...raw().runs,
      { id: "run-9", agent_id: "a2" },
    ],
    agent_tasks: raw().tasks,
    approvals: [],
    agent_reports: [],
    incidents: [{ agent_run_id: "run-9" }, { agent_run_id: "run-ghost" }],
    system_events: [],
    qa_runs: [],
  });
  const tree = await fetchWorkforceTree(client);
  const runQueries = client.calls.filter((c) => c[1] === "agent_runs" && c[0] === "in" && c[2] === "id");
  assert.equal(runQueries.length, 1, "single batched run hop");
  const a2 = tree.flatMap((d) => d.agents).find((a) => a.id === "a2");
  assert.equal(a2.openIncidents, 1, "run-9 maps to sentinel; ghost run maps nowhere");
});

test("no run hop query when no open incidents carry a run", async () => {
  const client = fakeClient({
    agents: raw().agents,
    agent_runs: raw().runs,
    agent_tasks: raw().tasks,
    approvals: [],
    agent_reports: [],
    incidents: [],
    system_events: [],
    qa_runs: [],
  });
  await fetchWorkforceTree(client);
  assert.ok(
    !client.calls.some((c) => c[1] === "agent_runs" && c[0] === "in" && c[2] === "id"),
    "empty run set skips the hop entirely"
  );
});

test("requireAdmin runs before any read when no client is injected", async () => {
  order.length = 0;
  serverClient = fakeClient({
    agents: [],
    agent_runs: [],
    agent_tasks: [],
    approvals: [],
    agent_reports: [],
    incidents: [],
    system_events: [],
    qa_runs: [],
  });
  const origFrom = serverClient.from.bind(serverClient);
  serverClient.from = (table) => {
    order.push(`from:${table}`);
    return origFrom(table);
  };
  await fetchWorkforceTree();
  assert.equal(order[0], "requireAdmin", "gate first");
  assert.ok(order.length > 1 && order[1].startsWith("from:"), "reads follow the gate");
});
