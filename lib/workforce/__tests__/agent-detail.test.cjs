/**
 * Stage 21 (P3) — per-agent selection panel tests (hermetic).
 *
 * Unknown ids resolve null (no leak); row caps on every list; shared
 * incident rule (run-linked -> agent, run-less -> reliability agent only);
 * requireAdmin before any read when no client is injected; fixed query
 * count (no per-row queries); no secret columns selected.
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

const { fetchAgentPanel } = require("../agent-detail");

const A1 = "11111111-1111-1111-1111-111111111111";
const A2 = "22222222-2222-2222-2222-222222222222";

function fakeClient(tables) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      // The incident hop is the only semantic filter asserted here: honor
      // run-linkage exactly like PostgREST would (linked vs run-less).
      const linkedIds = [];
      let nullRunOnly = false;
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
          if (table === "incidents" && c === "agent_run_id" && Array.isArray(v)) linkedIds.push(...v);
          return b;
        },
        is(c, v) {
          calls.push(["is", table, c, v]);
          if (table === "incidents" && c === "agent_run_id" && v === null) nullRunOnly = true;
          return b;
        },
        order() {
          return b;
        },
        limit(n) {
          calls.push(["limit", table, n]);
          return b;
        },
        then(res) {
          let rows = tables[table] ?? [];
          if (linkedIds.length > 0) rows = rows.filter((r) => linkedIds.includes(r.agent_run_id));
          else if (nullRunOnly) rows = rows.filter((r) => r.agent_run_id == null);
          return Promise.resolve({ data: rows, error: null }).then(res);
        },
      };
      return b;
    },
  };
  return client;
}

function tables(over = {}) {
  return {
    agents: [{ id: A1, display_name: "Dylan", department: "executive", status: "active", autonomy_level: "L0" }],
    agent_tasks: [{ id: "t1", title: "do things", status: "running", created_at: "2026-09-30T00:00:00Z" }],
    agent_runs: [{ id: "r1", status: "completed", triggered_by: "gateway", created_at: "2026-09-30T00:00:00Z", completed_at: "2026-09-30T01:00:00Z" }],
    approvals: [{ id: "ap1", action: "request_qa_run", risk: "low", created_at: "2026-09-30T00:00:00Z", expires_at: "2026-10-30T00:00:00Z" }],
    incidents: [],
    ...over,
  };
}

test("malformed id resolves null with zero queries (no leak)", async () => {
  const client = fakeClient(tables());
  assert.equal(await fetchAgentPanel("not-a-uuid", client), null);
  assert.equal(await fetchAgentPanel("../../etc", client), null);
  assert.equal(client.calls.length, 0, "no query for a bad id");
});

test("well-formed but unknown id resolves null (no leak)", async () => {
  const client = fakeClient(tables({ agents: [] }));
  assert.equal(await fetchAgentPanel(A2, client), null);
});

test("every list is bounded with row caps", async () => {
  const client = fakeClient(tables());
  const panel = await fetchAgentPanel(A1, client);
  assert.ok(panel, "panel resolves");
  const limits = {};
  for (const [m, table, n] of client.calls) {
    if (m === "limit") limits[table] = n;
  }
  assert.equal(limits["agent_tasks"], 1, "current task only");
  assert.equal(limits["approvals"], 5, "approvals capped");
  assert.ok(limits["incidents"] === undefined || limits["incidents"] === 5, "incident hop capped");
  const runLimits = client.calls.filter(([m, t]) => m === "limit" && t === "agent_runs").map(([, , n]) => n).sort((a, b) => a - b);
  assert.deepEqual(runLimits, [5, 20], "last-5 runs + 20 id window");
  assert.equal(panel.currentTask.title, "do things");
  assert.equal(panel.runs.length, 1);
  assert.equal(panel.approvals.length, 1);
});

test("shared rule: linked incidents to the agent, run-less to reliability only", async () => {
  const linked = { id: "i1", title: "linked", severity: "s2", status: "open", agent_run_id: "r1" };
  const platform = { id: "i2", title: "platform", severity: "s4", status: "open", agent_run_id: null };
  const exec = await fetchAgentPanel(
    A1,
    fakeClient(tables({ incidents: [linked, platform] }))
  );
  assert.deepEqual(exec.incidents.map((i) => i.id), ["i1"], "executive agent sees linked only");
  assert.ok(exec.incidents.every((i) => i.linked), "no platform incidents on a non-reliability agent");
  const relTables = tables({
    agents: [{ id: A2, display_name: "Sentinel", department: "reliability", status: "active", autonomy_level: "L0" }],
    agent_runs: [{ id: "r9" }],
    incidents: [
      { ...linked, agent_run_id: "r9" },
      platform,
    ],
  });
  const rel = await fetchAgentPanel(A2, fakeClient(relTables));
  const byId = Object.fromEntries(rel.incidents.map((i) => [i.id, i.linked]));
  assert.equal(byId["i1"], true, "run-linked stays linked");
  assert.equal(byId["i2"], false, "run-less attributes to the reliability agent");
});

test("requireAdmin runs before any read when no client is injected", async () => {
  order.length = 0;
  serverClient = fakeClient(tables({ agents: [] }));
  const origFrom = serverClient.from.bind(serverClient);
  serverClient.from = (table) => {
    order.push(`from:${table}`);
    return origFrom(table);
  };
  assert.equal(await fetchAgentPanel(A1), null);
  assert.equal(order[0], "requireAdmin", "gate first");
  assert.ok(order[1].startsWith("from:"), "reads follow the gate");
});

test("query count is fixed: no per-row queries", async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}` }));
  const client = fakeClient(tables({ agent_runs: many, approvals: many, incidents: many }));
  await fetchAgentPanel(A1, client);
  const froms = client.calls.filter(([m]) => m === "select").length;
  assert.ok(froms <= 7, `fixed handful of queries regardless of rows (got ${froms})`);
});

test("no secret columns selected anywhere", async () => {
  const client = fakeClient(tables());
  await fetchAgentPanel(A1, client);
  const selected = client.calls
    .filter(([m]) => m === "select")
    .map(([, , cols]) => String(cols))
    .join(" ")
    .toLowerCase();
  for (const banned of ["system_prompt", "input_schema", "executor_ref", "evidence", "payload", "content"]) {
    assert.ok(!selected.includes(banned), `panel selects no ${banned}`);
  }
});
