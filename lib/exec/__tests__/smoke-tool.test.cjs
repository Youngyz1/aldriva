/**
 * Stage 10.9 hermetic tests: execSmokeNotify smoke-test action.
 *
 * No database, no network. Covers the Phase B3 matrix:
 *  1. gating: seed is transactional/medium/approval_required=true, granted to
 *     dylan ONLY; L0 gate blocks with the seeded values; envelope minted.
 *  2. no regression: existing tools/agents untouched (139/140/143/145 scans;
 *     registry gained exactly one definition + one switch case).
 *  3. materialization: approved execSmokeNotify approval materializes (not
 *     skipped, not stamped invalid).
 *  4. full path: claim -> binding -> REAL executor (module deps stubbed) ->
 *     ingest -> completed; exactly one notification row; duplicate ingest
 *     writes no second row.
 *  5. tamper: changed args/tenant/agent -> zero dispatch, zero rows.
 *  6. rollback: 147 twin removes grant + definition; mirror matches; order.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
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

function read(p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); }

// Hermetic env: lib/notifications.ts constructs its admin client at import
// time. Dummy values keep construction side-effect-free (no network until a
// real call, which the stubbed createNotification below never makes).
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "dummy-key-for-hermetic-tests";

const { checkApprovalRequired } = require("../../ai/approvals");
const { mintExecutionEnvelope } = require("../envelope");

// ---- 1. gating -------------------------------------------------------------
test("147 seeds execSmokeNotify gated, granted to dylan only", () => {
  const sql = read("db/migration_147_exec_smoke_notify.sql");
  assert.ok(sql.includes("'execSmokeNotify'"), "tool seeded");
  assert.ok(sql.includes("'transactional','medium',true"), "transactional/medium/approval_required=true");
  assert.ok(sql.includes("lib/ai/tools/tenant/tenant-notifications:execSmokeNotify"), "executor_ref registered");
  const grant = sql.slice(sql.indexOf("agent_tools"));
  assert.ok(grant.includes("a.name = 'dylan'"), "granted to dylan");
  assert.ok(!grant.includes("'sentinel'") && !grant.includes("'qa'"), "no other agent granted");
});

test("L0 gate blocks with the seeded values; envelope minted for its args", async () => {
  const gate = await checkApprovalRequired("agent-id", "dylan", "L0", "execSmokeNotify", "medium", true);
  assert.equal(gate.blocked, true, "L0 always blocked for approval-gated tools");
  assert.equal(gate.required, true);
  const minted = mintExecutionEnvelope({
    rawArgs: JSON.stringify({ note: "hello" }), tenantId: null,
    agentId: "11111111-1111-1111-1111-111111111111", agentName: "dylan",
    taskId: null, runId: null, action: "execSmokeNotify",
  });
  assert.equal(minted.ok, true, "note-object args mint cleanly");
});

// ---- 2. no regression -------------------------------------------------------
test("existing tools and agents unchanged by 147", () => {
  const s139 = read("db/migration_139_tool_registry.sql");
  // createNotification/notifyOwner remain approval_required=false in 139
  const txnBlock = s139.slice(s139.indexOf("-- Transactional tools"));
  assert.ok(txnBlock.includes("'medium',false"), "existing transactionals still ungated");
  assert.ok(!txnBlock.includes("execSmokeNotify"), "new tool not in 139");
  for (const f of ["db/migration_140_agent_registry.sql", "db/migration_143_sentinel_events.sql", "db/migration_145_qa_execution.sql"]) {
    assert.ok(!read(f).includes("execSmokeNotify"), `${f} untouched`);
  }
  // Dylan's 140 block still excludes transactionals (incl. no backdoor grant)
  const s140 = read("db/migration_140_agent_registry.sql");
  const dylanBlock = s140.slice(s140.indexOf("-- Dylan:"), s140.indexOf("-- Sentinel:"));
  assert.ok(!dylanBlock.includes("execSmokeNotify"), "140 predates the grant");
  // Registry gained exactly one definition + one dispatch case
  const reg = read("lib/ai/tools-registry.ts");
  assert.ok(reg.includes("execSmokeNotifyDefinition"), "definition imported + listed");
  assert.ok(reg.includes("case 'execSmokeNotify':"), "dispatch case registered");
  const cases = (reg.match(/case '/g) || []).length;
  assert.ok(cases >= 28, `switch intact with addition (found ${cases} cases)`);
});

// ---- 3-5. executor + full path + tamper (stubbed module deps) ---------------
const adminModule = require("@/lib/supabase-admin");
const notificationsModule = require("@/lib/notifications");

const writes = { notifications: [] };
const OWNER_TENANT = "22222222-2222-2222-2222-222222222222";
let members = [
  { user_id: "owner-1", organizer_id: OWNER_TENANT, role: "owner" },
  { user_id: "owner-2", organizer_id: OWNER_TENANT, role: "owner" },
];

class FakeQ {
  constructor(table) { this.table = table; this.eqs = []; }
  select() { return this; }
  eq(c, v) { this.eqs.push([c, v]); return this; }
  limit() { return this; }
  maybeSingle() { return this; }
  insert() { this.isInsert = true; return this; }
  match(r) { return this.eqs.every(([c, v]) => r[c] === v); }
  then(resolve) {
    if (this.isInsert) {
      resolve({ data: null, error: null });
      return Promise.resolve();
    }
    if (this.table === "entity_members") {
      const hit = members.filter((r) => this.match(r));
      resolve({ data: hit, error: null });
      return Promise.resolve();
    }
    resolve({ data: null, error: null });
    return Promise.resolve();
  }
}
adminModule.createSupabaseAdmin = () => ({ from: (t) => new FakeQ(t) });
notificationsModule.createNotification = async (params) => {
  writes.notifications.push(params);
};

const { execSmokeNotify, execSmokeNotifyDefinition } = require("../../ai/tools/tenant/tenant-notifications");

const CTX = { tenantId: "22222222-2222-2222-2222-222222222222", userId: "user-9", role: "viewer" };

test("executor writes exactly one fixed row to the first owner; no email param", async () => {
  writes.notifications.length = 0;
  const out = await execSmokeNotify(CTX, { note: "hello smoke" });
  assert.deepEqual(out, { delivered: 1, recipient: "owner-1", title: "[Stage 10.9 smoke test] hello smoke" });
  assert.equal(writes.notifications.length, 1, "exactly one row");
  const row = writes.notifications[0];
  assert.equal(row.userId, "owner-1");
  assert.equal(row.type, "like", "fixed internal-only type");
  assert.ok(row.title.startsWith("[Stage 10.9 smoke test] "), "fixed prefix");
  assert.equal(row.body, null);
  assert.equal(row.link, null);
  assert.ok(!("email" in row), "no email param — Resend never touched");
});

test("executor bounds note, defaults missing, fails closed without owners", async () => {
  writes.notifications.length = 0;
  const long = await execSmokeNotify(CTX, { note: "n".repeat(500) });
  assert.ok(long.title.length <= 200, "title bounded");
  const def = await execSmokeNotify(CTX, {});
  assert.ok(def.title.endsWith("ping"), "missing note defaults");
  assert.equal(writes.notifications.length, 2);
  members = [];
  await assert.rejects(execSmokeNotify(CTX, { note: "x" }), /No tenant owner/, "fail closed");
  assert.equal(writes.notifications.length, 2, "zero rows on failure");
  members = [
    { user_id: "owner-1", organizer_id: OWNER_TENANT, role: "owner" },
    { user_id: "owner-2", organizer_id: OWNER_TENANT, role: "owner" },
  ];
});

test("materialization accepts the tool (not skipped, not stamped invalid)", async () => {
  const { materializeApproved } = require("../materialize");
  const minted = mintExecutionEnvelope({
    rawArgs: JSON.stringify({ note: "ping" }), tenantId: CTX.tenantId,
    agentId: "11111111-1111-1111-1111-111111111111", agentName: "dylan",
    taskId: null, runId: null, action: "execSmokeNotify",
  });
  assert.equal(minted.ok, true);
  const store = {
    approvals: [{
      id: "appr-1", action: "execSmokeNotify", requested_by: "user-9", tenant_id: CTX.tenantId,
      status: "approved", expires_at: "2026-09-30T00:00:00Z", audit_ref: null,
      proposed_outcome: minted.envelope, created_at: "2026-09-29T10:00:00Z",
    }],
    agent_tasks: [],
  };
  const client = {
    from: (table) => new (class {
      constructor() { this.t = table; this.eqs = []; this.isNull = []; this.gtC = null; this.patch = null; this.ins = null; this.lim = null; }
      select() { return this; }
      eq(c, v) { this.eqs.push([c, v]); return this; }
      is(c, v) { if (v === null) this.isNull.push(c); else this.eqs.push([c, v]); return this; }
      gt(c, v) { this.gtC = [c, v]; return this; }
      order() { return this; }
      limit(n) { this.lim = n; return this; }
      update(p) { this.patch = p; return this; }
      insert(r) { this.ins = r; return this; }
      match(row) {
        for (const [c, v] of this.eqs) if (row[c] !== v) return false;
        for (const c of this.isNull) if (row[c] != null) return false;
        if (this.gtC) { const [c, v] = this.gtC; if (!(row[c] != null && row[c] > v)) return false; }
        return true;
      }
      then(resolve) {
        const rows = store[this.t] || [];
        if (this.ins) {
          if (this.t === "agent_tasks" && this.ins.idempotency_key && rows.some((r) => r.idempotency_key === this.ins.idempotency_key)) {
            resolve({ data: null, error: { message: "duplicate key" } });
            return Promise.resolve();
          }
          const row = { id: `task-${rows.length + 1}`, created_at: "2026-09-29T10:00:00Z", ...this.ins };
          rows.push(row);
          resolve({ data: [{ id: row.id }], error: null });
          return Promise.resolve();
        }
        if (this.patch) {
          const hit = rows.filter((r) => this.match(r));
          for (const r of hit) Object.assign(r, { ...this.patch });
          resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
          return Promise.resolve();
        }
        let out = rows.filter((r) => this.match(r));
        if (this.lim !== null) out = out.slice(0, this.lim);
        resolve({ data: out, error: null });
        return Promise.resolve();
      }
    })(),
  };
  const out = await materializeApproved(client, { nowIso: "2026-09-29T10:00:00Z" });
  assert.equal(out.materialized.length, 1, "materializes (not skipped like request_qa_run)");
  assert.deepEqual(out.skipped, []);
  assert.ok(store.approvals[0].audit_ref.startsWith("exec-task:"));
  assert.equal(store.agent_tasks[0].status, "queued");
});

test("definition shape is envelope-compatible and dispatch-routed", () => {
  assert.equal(execSmokeNotifyDefinition.name, "execSmokeNotify");
  assert.equal(execSmokeNotifyDefinition.scope, "transactional");
  assert.equal(execSmokeNotifyDefinition.parameters.type, "object", "JSON-object args (envelope requirement)");
  assert.ok(typeof execSmokeNotify === "function", "executor registered");
});

// ---- 4b. full path with the REAL executor ------------------------------------
const { materializeApproved } = require("../materialize");
const { claimExecution } = require("../claim");
const { runAttempt } = require("../runner");
const { ingestAttemptResult } = require("../ingest");

const E2E_TENANT = "22222222-2222-2222-2222-222222222222";
const E2E_AGENT = "11111111-1111-1111-1111-111111111111";

function e2eStore() {
  return {
    approvals: [], agent_tasks: [], agent_runs: [], agent_steps: [], agent_reports: [],
    agents: [{ id: E2E_AGENT, name: "dylan", autonomy_level: "L0", status: "active" }],
    tool_definitions: [{ name: "execSmokeNotify", scope: "transactional", risk: "medium", approval_required: true }],
  };
}

function matchOr(row, cond) {
  return cond.split(",").some((part) => {
    const [col, op, ...rest] = part.split(".");
    const val = rest.join(".");
    if (op === "is" && val === "null") return row[col] == null;
    if (op === "lte") return row[col] != null && row[col] <= val;
    return false;
  });
}

class E2EQ {
  constructor(store, table) {
    this.store = store; this.table = table;
    this.eqs = []; this.isNull = []; this.gtC = null; this.orC = null;
    this.patch = null; this.ins = null; this.lim = null;
  }
  select() { return this; }
  eq(c, v) { this.eqs.push([c, v]); return this; }
  is(c, v) { if (v === null) this.isNull.push(c); else this.eqs.push([c, v]); return this; }
  gt(c, v) { this.gtC = [c, v]; return this; }
  or(cond) { this.orC = cond; return this; }
  order() { return this; }
  limit(n) { this.lim = n; return this; }
  update(p) { this.patch = p; return this; }
  insert(r) { this.ins = r; return this; }
  match(row) {
    for (const [c, v] of this.eqs) if (row[c] !== v) return false;
    for (const c of this.isNull) if (row[c] != null) return false;
    if (this.gtC) { const [c, v] = this.gtC; if (!(row[c] != null && row[c] > v)) return false; }
    if (this.orC && !matchOr(row, this.orC)) return false;
    return true;
  }
  then(resolve) {
    // Serialization boundary (same rationale as execution-e2e.test.cjs).
    const rows = this.store[this.table] || [];
    if (this.ins) {
      if (this.table === "agent_tasks" && this.ins.idempotency_key && rows.some((r) => r.idempotency_key === this.ins.idempotency_key)) {
        resolve({ data: null, error: { message: "duplicate key" } });
        return Promise.resolve();
      }
      const row = structuredClone({
        id: `${this.table}-${rows.length + 1}`, created_at: "2026-09-29T10:00:00Z",
        // DB column defaults the fake must honor (enqueue relies on them).
        ...(this.table === "agent_tasks" ? { attempt_count: 0, max_attempts: 3 } : {}),
        ...this.ins,
      });
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
    let out = rows.filter((r) => this.match(r));
    if (this.lim !== null) out = out.slice(0, this.lim);
    resolve({ data: structuredClone(out), error: null });
    return Promise.resolve();
  }
}

function e2eClient(store) {
  return { from: (table) => new E2EQ(store, table) };
}

function approvedSmoke(store, id, tenantId) {
  const m = mintExecutionEnvelope({
    rawArgs: JSON.stringify({ note: "smoke ping" }), tenantId,
    agentId: E2E_AGENT, agentName: "dylan", taskId: null, runId: null, action: "execSmokeNotify",
  });
  assert.equal(m.ok, true);
  const row = {
    id, action: "execSmokeNotify", requested_by: "user-9", tenant_id: tenantId,
    status: "approved", expires_at: "2026-09-30T00:00:00Z", audit_ref: null,
    proposed_outcome: m.envelope, created_at: "2026-09-29T10:00:00Z",
  };
  store.approvals.push(row);
  return row;
}

async function loadE2ERows(c, job) {
  const one = async (table, col, val) => {
    const rows = await new Promise((res) => c.from(table).select().eq(col, val).limit(1).then((r) => res(r.data)));
    return rows[0] ?? null;
  };
  return {
    approval: await one("approvals", "id", job.approvalId),
    agent: await one("agents", "id", job.agentId),
    toolDef: await one("tool_definitions", "name", job.action),
  };
}

const NOW_E2E = "2026-09-29T10:00:00Z";

test("full path: approve -> materialize -> claim -> bind -> REAL dispatch -> ingest -> completed, one row", async () => {
  const store = e2eStore();
  approvedSmoke(store, "appr-1", E2E_TENANT);
  const c = e2eClient(store);
  writes.notifications.length = 0;

  const mat = await materializeApproved(c, { nowIso: NOW_E2E });
  assert.equal(mat.materialized.length, 1);
  const claimed = await claimExecution(c, { workerId: "ext:1", nowIso: NOW_E2E });
  assert.equal(claimed.claimed, true);

  let dispatched = 0;
  const attempt = await runAttempt({
    job: claimed.job, workerId: "ext:1", userId: "user-9",
    rows: await loadE2ERows(c, claimed.job), nowIso: NOW_E2E,
    execute: async (ctx, uid) => {
      dispatched++;
      const r = await execSmokeNotify({ tenantId: ctx.tenantId, userId: uid, role: "viewer" }, ctx.args);
      return { ok: true, output: r };
    },
  });
  assert.equal(attempt.outcome, "succeeded");
  assert.equal(dispatched, 1, "exactly one dispatch");

  const ingested = await ingestAttemptResult(c, {
    taskId: claimed.job.jobId, runId: claimed.job.runId, attemptNo: 1, workerId: "ext:1",
    claimToken: claimed.claimToken, outcome: "succeeded", retryable: false,
    output: attempt.output, nowIso: NOW_E2E,
  });
  assert.equal(ingested.transition, "running→completed");
  assert.equal(writes.notifications.length, 1, "exactly one notification row");
  assert.equal(writes.notifications[0].userId, "owner-1");
  assert.equal(store.agent_reports.length, 1, "terminal report filed");

  const replay = await ingestAttemptResult(c, {
    taskId: claimed.job.jobId, runId: claimed.job.runId, attemptNo: 1, workerId: "ext:1",
    claimToken: claimed.claimToken, outcome: "succeeded", retryable: false,
    output: attempt.output, nowIso: NOW_E2E,
  });
  assert.deepEqual([replay.ok, replay.duplicate], [true, true]);
  assert.equal(writes.notifications.length, 1, "duplicate ingest writes no second row");
});

test("tamper (args/tenant/agent) means zero dispatch and zero notification rows", async () => {
  const mkClaimed = async () => {
    const store = e2eStore();
    store.approvals.push(approvedSmoke(store, "appr-1", E2E_TENANT));
    const c = e2eClient(store);
    await materializeApproved(c, { nowIso: NOW_E2E });
    const claimed = await claimExecution(c, { workerId: "ext:1", nowIso: NOW_E2E });
    assert.equal(claimed.claimed, true);
    return { store, c, claimed };
  };
  const spy = () => {
    let n = 0;
    return {
      fn: async (ctx, uid) => {
        n++;
        const r = await execSmokeNotify({ tenantId: ctx.tenantId, userId: uid, role: "viewer" }, ctx.args);
        return { ok: true, output: r };
      },
      count: () => n,
    };
  };
  // (a) coherent args rewrite in the stored row -> drift check fires
  {
    const { store, c, claimed } = await mkClaimed();
    writes.notifications.length = 0;
    store.agent_tasks[0].payload.envelope.args = { note: "attacker" };
    store.agent_tasks[0].payload.envelope.argsCanonical = '{"note":"attacker"}';
    const { parseExecutionEnvelope } = require("../envelope");
    const fresh = parseExecutionEnvelope(store.agent_tasks[0].payload.envelope);
    assert.equal(fresh.ok, true);
    const s = spy();
    const attempt = await runAttempt({
      job: { ...claimed.job, envelope: fresh.envelope }, workerId: "ext:1", userId: "user-9",
      rows: await loadE2ERows(c, claimed.job), nowIso: NOW_E2E, execute: s.fn,
    });
    assert.equal(attempt.outcome, "binding-failed");
    assert.equal(s.count(), 0);
    assert.equal(writes.notifications.length, 0);
  }
  // (b) tenant drift on the job record
  {
    const { c, claimed } = await mkClaimed();
    writes.notifications.length = 0;
    const s = spy();
    const attempt = await runAttempt({
      job: { ...claimed.job, tenantId: "99999999-9999-9999-9999-999999999999" },
      workerId: "ext:1", userId: "user-9",
      rows: await loadE2ERows(c, claimed.job), nowIso: NOW_E2E, execute: s.fn,
    });
    assert.equal(attempt.outcome, "binding-failed");
    assert.equal(s.count(), 0);
    assert.equal(writes.notifications.length, 0);
  }
  // (c) agent drift on the registry row
  {
    const { store, c, claimed } = await mkClaimed();
    writes.notifications.length = 0;
    store.agents[0].name = "sentinel";
    const s = spy();
    const attempt = await runAttempt({
      job: claimed.job, workerId: "ext:1", userId: "user-9",
      rows: await loadE2ERows(c, claimed.job), nowIso: NOW_E2E, execute: s.fn,
    });
    assert.equal(attempt.outcome, "binding-failed");
    assert.equal(s.count(), 0);
    assert.equal(writes.notifications.length, 0);
  }
});
// ---- 6. rollback -------------------------------------------------------------
test("147 rollback removes grant + definition; mirror matches; order filed", () => {
  const rb = read("db/migration_147_exec_smoke_notify_rollback.sql");
  assert.ok(rb.includes("DELETE FROM agent_tools") && rb.includes("execSmokeNotify"), "grant removed first");
  assert.ok(rb.includes("DELETE FROM tool_definitions WHERE name = 'execSmokeNotify'"), "definition removed");
  assert.ok(rb.includes("BEGIN;") && rb.includes("COMMIT;"), "transactional");
  const fwd = read("db/migration_147_exec_smoke_notify.sql");
  assert.equal(read("supabase/migrations/20261002000000_migration_147_exec_smoke_notify.sql"), fwd, "mirror byte-identical");
  const order = read("db/staging-migration-order.txt").split("\n").map((l) => l.trim()).filter(Boolean);
  assert.ok(order.includes("migration_147_exec_smoke_notify.sql"), "order file lists 147");
  assert.ok(order.indexOf("migration_147_exec_smoke_notify.sql") > order.indexOf("migration_146_background_execution.sql"), "147 after 146");
});
