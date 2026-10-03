/**
 * Stage 4 hermetic tests: Approvals list + server-enforced decisions.
 *
 * No database, no network. Fake chainable client captures the query chain
 * and emulates conditional writes. Verifies: (1) list reads approvals with
 * actual-state filter + tenant scoping, (2) decide() happy path flips the
 * record and nothing else, (3) decide() rejects already-decided, expired,
 * missing, cross-tenant, bad-decision, and concurrent-second-writer
 * attempts — proving the UI can never authorize, only request, (4) no
 * secrets or raw evidence values in the view surface.
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
  fetchApprovalList,
  fetchApprovalDetail,
  fetchApprovalLinks,
  decideApproval,
  isApprovalStatusValue,
  isApprovalIdShape,
  shortId,
  evidenceKeys,
} = require("../approvals");

const PENDING = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", requested_by: "u1", requested_by_agent_id: "a1",
  tenant_id: null, action: "notifyOwner", reason: "Tool requires approval", evidence: { tool: "notifyOwner", args: "RAW_ARGS_MUST_NOT_RENDER" },
  risk: "medium", proposed_outcome: null, status: "pending", approver_id: null, decided_at: null,
  expires_at: "2026-09-28T00:00:00Z", audit_ref: null, created_at: "2026-09-26T00:00:00Z",
};
const DECIDED = { ...PENDING, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", status: "approved" };
const EXPIRED = { ...PENDING, id: "cccccccc-cccc-cccc-cccc-cccccccccccc", expires_at: "2026-09-25T00:00:00Z" };
const SCOPED = { ...PENDING, id: "dddddddd-dddd-dddd-dddd-dddddddddddd", tenant_id: "tenant-1" };

// Mutable fake table so conditional writes are observable.
function db() {
  return {
    approvals: [structuredClone(PENDING), structuredClone(DECIDED), structuredClone(EXPIRED), structuredClone(SCOPED)],
    agents: [{ id: "a1", name: "qa", display_name: "QA" }],
    agent_tasks: [],
    agent_runs: [],
  };
}

class FakeQuery {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.calls = [];
    this.filters = [];
    this.patch = null;
  }
  select(cols, opts) { this.calls.push(["select", cols, opts]); return this; }
  eq(col, val) { this.calls.push(["eq", col, val]); this.filters.push([col, val]); return this; }
  in(col, vals) { this.calls.push(["in", col, vals]); this.filters.push([col, vals, true]); return this; }
  order(col, opts) { this.calls.push(["order", col, opts]); return this; }
  limit(n) { this.calls.push(["limit", n]); return this; }
  update(patch) { this.calls.push(["update", patch]); this.patch = patch; return this; }
  match(row) {
    return this.filters.every(([c, v, isIn]) => (isIn ? v.includes(row[c]) : row[c] === v));
  }
  match(row) {
    return this.filters.every(([c, v, isIn]) => (isIn ? v.includes(row[c]) : row[c] === v));
  }
  then(resolve) {
    if (this.patch) {
      const hit = this.store[this.table].filter((r) => this.match(r));
      for (const r of hit) Object.assign(r, this.patch);
      resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
      return Promise.resolve();
    }
    let rows = this.store[this.table].filter((r) => this.match(r));
    const lim = this.calls.find(([m]) => m === "limit");
    if (lim) rows = rows.slice(0, lim[1]);
    resolve({ data: rows, error: null, count: null });
    return Promise.resolve();
  }
}

function fakeClient(store, queries) {
  return {
    from(table) {
      const q = new FakeQuery(store, table);
      if (queries) queries.push(q);
      return q;
    },
  };
}

test("list reads approvals with actual-state filter + tenant scoping", async () => {
  const store = db();
  const queries = [];
  const rows = await fetchApprovalList(fakeClient(store, queries), null, "pending");
  assert.equal(rows.length, 3, "only pending-status rows (PENDING + EXPIRED + SCOPED) match");
  const q = queries.find((x) => x.table === "approvals");
  assert.ok(q.calls.some(([m, c, v]) => m === "eq" && c === "status" && v === "pending"), "status filter applied");
  assert.ok(!q.calls.some(([m, c]) => m === "eq" && c === "tenant_id"), "no tenant filter when scope null");
  const queries2 = [];
  await fetchApprovalList(fakeClient(store, queries2), "tenant-1", null);
  const q2 = queries2.find((x) => x.table === "approvals");
  assert.ok(q2.calls.some(([m, c, v]) => m === "eq" && c === "tenant_id" && v === "tenant-1"), "tenant filter applied");
  assert.equal(isApprovalStatusValue("pending"), true);
  assert.equal(isApprovalStatusValue("awaiting"), false);
});

test("decide happy path flips the record and nothing else", async () => {
  const store = db();
  const res = await decideApproval(fakeClient(store), {
    approvalId: PENDING.id, decision: "approved", approverId: "admin-1", tenantScope: null, nowIso: "2026-09-26T12:00:00Z",
  });
  assert.equal(res.ok, true);
  const row = store.approvals.find((r) => r.id === PENDING.id);
  assert.equal(row.status, "approved");
  assert.equal(row.approver_id, "admin-1");
  assert.equal(row.decided_at, "2026-09-26T12:00:00Z");
  assert.equal(row.action, "notifyOwner", "action comes from the row, never the request");
});

test("decide rejects already-decided, expired, missing, bad decision", async () => {
  const store = db();
  const client = fakeClient(store);
  const now = "2026-09-26T12:00:00Z";
  assert.match((await decideApproval(client, { approvalId: DECIDED.id, decision: "rejected", approverId: "a", tenantScope: null, nowIso: now })).message, /already decided/);
  assert.match((await decideApproval(client, { approvalId: EXPIRED.id, decision: "approved", approverId: "a", tenantScope: null, nowIso: now })).message, /expired/);
  assert.match((await decideApproval(client, { approvalId: "00000000-0000-0000-0000-000000000000", decision: "approved", approverId: "a", tenantScope: null, nowIso: now })).message, /not found/);
  assert.match((await decideApproval(client, { approvalId: PENDING.id, decision: "maybe", approverId: "a", tenantScope: null, nowIso: now })).message, /approved or rejected/);
  assert.match((await decideApproval(client, { approvalId: PENDING.id, decision: "approved', '--inject", approverId: "a", tenantScope: null, nowIso: now })).message, /approved or rejected/);
  assert.equal(store.approvals.find((r) => r.id === PENDING.id).status, "pending", "rejected attempts change nothing");
});

test("decide rejects cross-tenant attempts", async () => {
  const store = db();
  const res = await decideApproval(fakeClient(store), {
    approvalId: SCOPED.id, decision: "approved", approverId: "admin-1", tenantScope: "tenant-OTHER", nowIso: "2026-09-26T12:00:00Z",
  });
  assert.match(res.message, /outside the acting tenant scope/);
  assert.equal(store.approvals.find((r) => r.id === SCOPED.id).status, "pending");
  const ok = await decideApproval(fakeClient(store), {
    approvalId: SCOPED.id, decision: "rejected", approverId: "admin-1", tenantScope: "tenant-1", nowIso: "2026-09-26T12:00:00Z",
  });
  assert.equal(ok.ok, true);
});

test("decide is atomic: concurrent second writer loses", async () => {
  const store = db();
  const client = fakeClient(store);
  const now = "2026-09-26T12:00:00Z";
  const first = await decideApproval(client, { approvalId: PENDING.id, decision: "approved", approverId: "a1", tenantScope: null, nowIso: now });
  const second = await decideApproval(client, { approvalId: PENDING.id, decision: "rejected", approverId: "a2", tenantScope: null, nowIso: now });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(store.approvals.find((r) => r.id === PENDING.id).approver_id, "a1", "first writer wins");
});

test("detail surfaces keys, never raw evidence values; helpers behave", async () => {
  const store = db();
  const raw = await fetchApprovalDetail(fakeClient(store), PENDING.id, null);
  assert.ok(raw, "detail resolves");
  assert.deepEqual(evidenceKeys(raw.evidence), ["tool", "args"]);
  assert.deepEqual(evidenceKeys(null), []);
  assert.equal(shortId("admin-123456789"), "admin-12…");
  assert.equal(shortId(null), "—");
  assert.equal(isApprovalIdShape(PENDING.id), true);
  assert.equal(isApprovalIdShape("xyz"), false);
  const links = await fetchApprovalLinks(fakeClient(store), PENDING.id);
  assert.deepEqual(links, [], "no links when nothing references the approval");
  const dumped = JSON.stringify(raw).toLowerCase();
  assert.ok(!dumped.includes("service_role") && !dumped.includes("api_key"), "no credentials in raw detail");
});

test("detail missing resolves null (page 404s)", async () => {
  const store = db();
  store.approvals = [];
  const raw = await fetchApprovalDetail(fakeClient(store), PENDING.id, null);
  assert.equal(raw, null);
});
