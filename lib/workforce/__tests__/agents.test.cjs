/**
 * Stage 2 hermetic tests: Agents list + detail data access.
 *
 * No database, no network. Fake chainable client captures the query chain.
 * Verifies: (1) list/detail read the registry without hardcoded names,
 * (2) tenant scoping (tasks/runs/reports filtered; agents/tools/knowledge
 * never tenant-filtered), (3) empty states, (4) no secrets or tool internals
 * in the detail view model (no system_prompt, input_schema, executor_ref,
 * keys, payloads, or step contents — asserted on both the SELECT column
 * lists and the serialized view model).
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
  fetchAgentList,
  fetchAgentDetail,
  buildAgentDetailViewModel,
  derivePresence,
  isAgentIdShape,
  fetchRecentRunPresence,
} = require("../agents");

const AGENTS = [
  { id: "11111111-1111-1111-1111-111111111111", name: "dylan", display_name: "Dylan", department: "executive", description: "exec", model_selection: "aldriva", autonomy_level: "L0", tenant_id: null, status: "active", version: 1, updated_at: "2026-09-26T00:00:00Z" },
  { id: "22222222-2222-2222-2222-222222222222", name: "futurebot", display_name: "Futurebot", department: "x", description: "later", model_selection: "aldriva", autonomy_level: "L0", tenant_id: null, status: "active", version: 1, updated_at: "2026-09-26T00:00:00Z" },
];
const ROWS = {
  agents: AGENTS,
  agent_tools: [{ tool_name: "getEvent", allowed: true }],
  tool_definitions: [{ name: "getEvent", description: "reads one event", scope: "tenant_scoped", risk: "low" }],
  agent_tasks: [{ id: "t1", title: "do things", status: "completed", created_at: "2026-09-26T01:00:00Z" }],
  agent_runs: [{ id: "r1", status: "completed", triggered_by: "gateway", error: null, created_at: "2026-09-26T01:00:00Z", completed_at: "2026-09-26T01:01:00Z" }],
  agent_reports: [],
  knowledge_documents: [{ id: "k1", title: "Ops", category: "operational" }],
};

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.calls = [];
  }
  select(cols, opts) { this.calls.push(["select", cols, opts]); return this; }
  eq(col, val) { this.calls.push(["eq", col, val]); return this; }
  is(col, val) { this.calls.push(["is", col, val]); return this; }
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

test("list reads the registry with no hardcoded agent names", async () => {
  const queries = [];
  const agents = await fetchAgentList(fakeClient(queries));
  assert.equal(agents.length, 2);
  assert.ok(agents.some((a) => a.name === "futurebot"), "registry-driven: unknown-future agent appears");
  const calls = firstCalls(queries, "agents");
  const sel = calls.find(([m]) => m === "select");
  assert.ok(sel && !/system_prompt/.test(sel[1]), "system_prompt never selected");
  assert.ok(!calls.some(([m, c]) => m === "eq" && c === "tenant_id"), "agents never tenant-filtered");
});

test("presence derivation: stored lifecycle vs live runs", async () => {
  assert.equal(derivePresence(["running"]).busy, true);
  assert.equal(derivePresence(["awaiting_approval"]).busy, true);
  assert.equal(derivePresence(["completed", "failed"]).busy, false);
  assert.equal(derivePresence([]).busy, false);
  const queries = [];
  const presence = await fetchRecentRunPresence(fakeClient(queries), null);
  assert.ok(Array.isArray(presence), "presence reads run state");
});

test("detail: tenant scoping on attached rows only", async () => {
  const queries = [];
  const raw = await fetchAgentDetail(fakeClient(queries), AGENTS[0].id, "tenant-9");
  assert.ok(raw, "detail resolves");
  for (const table of ["agent_tasks", "agent_runs", "agent_reports"]) {
    const calls = firstCalls(queries, table);
    assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "tenant_id" && v === "tenant-9"), `${table} tenant-filtered`);
    assert.ok(calls.some(([m, c]) => m === "eq" && c === "agent_id"), `${table} pinned to agent`);
  }
  for (const table of ["agents", "agent_tools", "tool_definitions", "knowledge_documents"]) {
    const calls = firstCalls(queries, table);
    assert.ok(!calls.some(([m, c]) => m === "eq" && c === "tenant_id"), `${table} never tenant-filtered`);
  }
  // knowledge reads platform corpus only
  const kcalls = firstCalls(queries, "knowledge_documents");
  assert.ok(kcalls.some(([m, c, v]) => m === "is" && c === "tenant_id" && v === null), "knowledge scoped to platform docs");
});

test("detail: missing agent resolves null (page 404s)", async () => {
  const queries = [];
  const client = fakeClient(queries);
  const emptyClient = { from: (t) => (t === "agents" ? { select: () => ({ eq: () => ({ limit: () => ({ then: (r) => { r({ data: [], error: null }); return Promise.resolve(); } }) }) }) } : client.from(t)) };
  const raw = await fetchAgentDetail(emptyClient, "33333333-3333-3333-3333-333333333333", null);
  assert.equal(raw, null);
});

test("id shape guard", () => {
  assert.equal(isAgentIdShape("11111111-1111-1111-1111-111111111111"), true);
  assert.equal(isAgentIdShape("not-a-uuid"), false);
  assert.equal(isAgentIdShape("../../etc"), false);
});

test("no secrets or tool internals in the detail view model", async () => {
  const queries = [];
  const raw = await fetchAgentDetail(fakeClient(queries), AGENTS[0].id, null);
  const vm = buildAgentDetailViewModel(raw);
  const dumped = JSON.stringify(vm).toLowerCase();
  for (const banned of ["system_prompt", "input_schema", "executor_ref", "service_role", "api_key", "secret", "payload", "args_redacted"]) {
    assert.ok(!dumped.includes(banned), `view model must not contain ${banned}`);
  }
  // SELECT column lists across all detail queries carry no sensitive columns.
  const selected = queries.flatMap((q) => q.calls.filter(([m]) => m === "select").map(([, cols]) => cols)).join(" ");
  for (const banned of ["system_prompt", "input_schema", "executor_ref"]) {
    assert.ok(!selected.includes(banned), `no query selects ${banned}`);
  }
  assert.equal(vm.tools.length, 1);
  assert.equal(vm.tools[0].name, "getEvent");
  assert.equal(vm.toolScopeCounts["tenant_scoped"], 1);
  assert.ok(vm.permissions.length >= 3, "permissions narrated without credentials");
  assert.equal(vm.currentTask.title, "do things");
  assert.equal(vm.lastActivityAt, "2026-09-26T01:00:00Z");
  assert.equal(vm.empty.reports, true);
  assert.equal(vm.knowledge.platformApproved, 1);
});

test("detail empty state: agent with nothing attached", () => {
  const vm = buildAgentDetailViewModel({
    agent: AGENTS[1], tools: [], tasks: [], runs: [], reports: [],
    knowledge: { platformApproved: 0, agentRoleDocs: [] },
  });
  assert.equal(vm.busy, false);
  assert.equal(vm.currentTask, null);
  assert.equal(vm.lastActivityAt, null);
  for (const [k, v] of Object.entries(vm.empty)) assert.equal(v, true, `empty flag ${k} set`);
});
