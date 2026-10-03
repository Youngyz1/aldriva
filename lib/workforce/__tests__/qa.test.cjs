/**
 * Stage 8 hermetic tests: QA runs list + run detail data access.
 *
 * No database, no network. Fake chainable client captures the query chain.
 * Verifies: (1) list reads PERSISTED qa_runs rows with the REAL schema
 * statuses (requested/approved/running/passed/failed/cancelled/expired —
 * no invented values), bounded + newest-first, (2) tenant-null handling:
 * platform-wide (null) applies no tenant filter, tenant-scoped uses
 * .or() so null-tenant platform-level smoke runs are NEVER hidden,
 * (3) detail resolves run + agent + approval + per-test results with
 * agent/approval lookups never tenant-filtered, (4) no-secrets scan:
 * claim_token_hash/claim_expires_at/idempotency_key/metadata are never
 * selected, error text is truncated + redacted, non-https artifact URLs
 * dropped, serialized VM scanned, (5) reverse linkage
 * fetchQaRunsByApproval, (6) empty states, (7) missing → null (page 404s)
 * + id-shape guard.
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
  fetchQaRunList,
  fetchQaStatusCounts,
  fetchQaRunDetail,
  fetchQaRunsByApproval,
  buildQaRunDetailViewModel,
  redactQaError,
  isDisplayableArtifactUrl,
  qaDurationLabel,
  isQaStatusValue,
  isQaRunIdShape,
} = require("../qa");

// The honest failure shape: a platform-level (null-tenant) smoke run that
// FAILED, requested by the QA agent through an approval — i.e. the known
// donate-spec signal. The UI must show this, never hide it.
const FAILED_RUN = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  suite: "smoke", environment: "staging", target_tenant_id: null,
  commit_sha: "abc1234", triggered_by: "schedule",
  requested_by_agent_id: "a1", approval_id: "p1",
  status: "failed", passed: 2, failed: 1, skipped: 0,
  external_run_id: "123", artifact_base_url: null,
  error: "smoke failed: fundraiser-donate receipt assertion; api_key=RAW_MUST_NOT_RENDER sk_test_RAW_MUST_NOT_RENDER",
  started_at: "2026-09-26T03:17:00Z", finished_at: "2026-09-26T03:22:00Z",
  claimed_at: "2026-09-26T03:17:05Z", created_at: "2026-09-26T03:00:00Z",
};
const LONG_ERROR = `x: ${"E".repeat(500)} password=hunter2 hunter2`;
const RESULTS = [
  {
    id: "r1", name: "donate shows Thank you receipt", file: "e2e/fundraiser-donate.spec.ts",
    status: "failed", duration_ms: 45000, error: LONG_ERROR,
    screenshot_url: "https://github.com/org/repo/actions/runs/1/shot.png",
    trace_url: null, logs_url: null,
  },
  {
    id: "r2", name: "login works", file: "e2e/auth-login.spec.ts",
    status: "passed", duration_ms: 3000, error: null,
    screenshot_url: null, trace_url: null, logs_url: null,
  },
  {
    id: "r3", name: "sneaky artifact", file: "e2e/auth-login.spec.ts",
    status: "passed", duration_ms: 1000, error: null,
    screenshot_url: "http://evil.example/shot.png", trace_url: null, logs_url: null,
  },
];
const ROWS = {
  qa_runs: [FAILED_RUN],
  agents: [{ id: "a1", name: "qa", display_name: "QA" }],
  approvals: [{ id: "p1", action: "request_qa_run", status: "approved" }],
  qa_test_results: RESULTS,
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
  or(cond) { this.calls.push(["or", cond]); return this; }
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

test("list reads persisted runs with real-schema status filter, bounded, newest-first", async () => {
  const queries = [];
  const rows = await fetchQaRunList(fakeClient(queries), null, "failed");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "failed", "the failing donate-spec-shaped run is returned, not hidden");
  const calls = firstCalls(queries, "qa_runs");
  assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "status" && v === "failed"), "status filter applied");
  assert.ok(calls.some(([m, n]) => m === "limit" && n === 50), "bounded");
  assert.ok(
    calls.some(([m, c, o]) => m === "order" && c === "created_at" && o && o.ascending === false),
    "newest first"
  );
});

test("status values are the real schema set — nothing invented", () => {
  for (const s of ["requested", "approved", "running", "passed", "failed", "cancelled", "expired"]) {
    assert.equal(isQaStatusValue(s), true, s);
  }
  for (const s of ["pending", "success", "error", "queued", ""]) {
    assert.equal(isQaStatusValue(s), false, `invented status rejected: ${s || "(empty)"}`);
  }
});

test("tenant-null handling: platform view unfiltered; tenant view keeps null-tenant runs", async () => {
  let queries = [];
  await fetchQaRunList(fakeClient(queries), null, null);
  let calls = firstCalls(queries, "qa_runs");
  assert.ok(!calls.some(([m, c]) => (m === "eq" || m === "or") && String(c).includes("target_tenant_id")), "platform view: no tenant filter");

  queries = [];
  await fetchQaRunList(fakeClient(queries), "tenant-9", null);
  calls = firstCalls(queries, "qa_runs");
  assert.ok(!calls.some(([m, c]) => m === "eq" && c === "target_tenant_id"), "tenant view never uses strict eq (would hide platform runs)");
  const orCall = calls.find(([m]) => m === "or");
  assert.ok(orCall, "tenant view scopes via .or()");
  assert.ok(String(orCall[1]).includes("target_tenant_id.is.null"), "null-tenant platform runs stay visible");

  queries = [];
  await fetchQaStatusCounts(fakeClient(queries), "tenant-9");
  calls = firstCalls(queries, "qa_runs");
  assert.ok(calls.some(([m]) => m === "or"), "counts share the same tenant-null contract");
});

test("detail resolves run + agent + approval + results; registries never tenant-filtered", async () => {
  const queries = [];
  const raw = await fetchQaRunDetail(fakeClient(queries), FAILED_RUN.id, "tenant-9");
  assert.ok(raw, "detail resolves");
  assert.equal(raw.run.suite, "smoke");
  assert.equal(raw.agent.display_name, "QA");
  assert.equal(raw.approval.action, "request_qa_run");
  assert.equal(raw.results.length, 3);
  const runCalls = firstCalls(queries, "qa_runs");
  assert.ok(runCalls.some(([m]) => m === "or"), "detail honors tenant-null contract");
  const agentCalls = firstCalls(queries, "agents");
  assert.ok(!agentCalls.some(([m, c]) => m === "eq" && c === "tenant_id"), "agent lookup never tenant-filtered");
  const approvalCalls = firstCalls(queries, "approvals");
  assert.ok(!approvalCalls.some(([m, c]) => m === "eq" && c === "tenant_id"), "approval lookup never tenant-filtered");
});

test("forbidden columns are never selected from qa_runs", async () => {
  const queries = [];
  await fetchQaRunDetail(fakeClient(queries), FAILED_RUN.id, null);
  const selects = firstCalls(queries, "qa_runs")
    .filter(([m]) => m === "select")
    .map(([, cols]) => String(cols));
  assert.ok(selects.length > 0, "expected a select on qa_runs");
  for (const banned of ["claim_token_hash", "claim_expires_at", "idempotency_key", "metadata"]) {
    for (const cols of selects) {
      assert.ok(!cols.includes(banned), `qa_runs select must not include ${banned}`);
    }
  }
});

test("error redaction: secrets scrubbed, long text truncated", () => {
  assert.equal(redactQaError(null), null);
  const redacted = redactQaError("boom api_key=supersecret and sk_test_abc123XYZ here");
  assert.ok(!redacted.includes("supersecret"), "key=value secret scrubbed");
  assert.ok(!redacted.includes("sk_test_abc123XYZ"), "stripe-style key scrubbed");
  assert.ok(redacted.includes("api_key=[redacted]"), "key name preserved as label");
  const pem = redactQaError("x -----BEGIN RSA PRIVATE KEY-----\nMIIB -----END RSA PRIVATE KEY----- y");
  assert.ok(!pem.includes("MIIB"), "PEM block scrubbed");
  const pw = redactQaError("login failed password=hunter2 ok");
  assert.ok(!pw.includes("hunter2"), "password scrubbed");
});

test("detail errors truncated + redacted; artifacts honesty (https only)", async () => {
  const queries = [];
  const raw = await fetchQaRunDetail(fakeClient(queries), FAILED_RUN.id, null);
  assert.ok(!raw.run.error.includes("RAW_MUST_NOT_RENDER"), "run error redacted");
  const byName = Object.fromEntries(raw.results.map((r) => [r.name, r]));
  const donate = byName["donate shows Thank you receipt"];
  assert.ok(donate.error.length <= 320, `test error truncated (got ${donate.error.length})`);
  assert.ok(donate.error.endsWith("…[truncated]"), "over-length error cut with marker");
  assert.ok(!donate.error.includes("hunter2"), "test error secret scrubbed");
  assert.equal(donate.screenshot_url, "https://github.com/org/repo/actions/runs/1/shot.png", "https artifact kept");
  assert.equal(donate.hasArtifacts, true);
  assert.equal(byName["login works"].hasArtifacts, false, "null artifacts → honest false");
  assert.equal(byName["sneaky artifact"].screenshot_url, null, "non-https artifact dropped");
  assert.equal(isDisplayableArtifactUrl(null), false);
  assert.equal(isDisplayableArtifactUrl("http://x.example/a.png"), false);
  assert.equal(isDisplayableArtifactUrl("not a url"), false);
  assert.equal(isDisplayableArtifactUrl("https://github.com/a.png"), true);
});

test("no secrets or credential-adjacent values in the detail view model", async () => {
  const queries = [];
  const raw = await fetchQaRunDetail(fakeClient(queries), FAILED_RUN.id, null);
  const vm = buildQaRunDetailViewModel(raw);
  const dumped = JSON.stringify(vm).toLowerCase();
  for (const banned of ["claim_token_hash", "claim_expires_at", "idempotency_key", "service_role", "api_key=supersecret", "raw_must_not_render", "hunter2", "metadata"]) {
    assert.ok(!dumped.includes(banned), `view model must not contain ${banned}`);
  }
  assert.equal(vm.counts.failed, 1, "per-test failed count recomputed from results");
  assert.equal(vm.counts.total, 3);
  assert.equal(vm.empty.results, false);
  assert.equal(vm.empty.artifacts, false);
  assert.equal(vm.empty.error, false);
  assert.ok(vm.durationMs === 300000, `duration 5m from started→finished (got ${vm.durationMs})`);
});

test("view-model empty states (no results, no links, no error, no timing)", () => {
  const vm = buildQaRunDetailViewModel({
    run: { ...FAILED_RUN, requested_by_agent_id: null, approval_id: null, error: null, started_at: null, finished_at: null },
    agent: null, approval: null, results: [],
  });
  assert.deepEqual(
    [vm.empty.results, vm.empty.agent, vm.empty.approval, vm.empty.artifacts, vm.empty.error],
    [true, true, true, true, true]
  );
  assert.equal(vm.durationMs, null);
  assert.equal(qaDurationLabel(null, "2026-09-26T03:22:00Z"), null);
  assert.equal(qaDurationLabel("2026-09-26T03:17:00Z", "2026-09-26T03:22:00Z"), "5m 0s");
});

test("reverse linkage: qa runs by approval", async () => {
  const queries = [];
  const links = await fetchQaRunsByApproval(fakeClient(queries), "p1");
  assert.equal(links.length, 1);
  const calls = firstCalls(queries, "qa_runs");
  assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "approval_id" && v === "p1"), "filtered by approval_id");
});

test("detail missing resolves null (page 404s); id shape guard", async () => {
  const client = { from: (t) => (t === "qa_runs" ? { select: () => ({ eq: () => ({ limit: () => ({ or: () => ({ then: (r) => { r({ data: [], error: null }); return Promise.resolve(); } }) }) }) }) } : fakeClient([]).from(t)) };
  const raw = await fetchQaRunDetail(client, FAILED_RUN.id, null);
  assert.equal(raw, null);
  assert.equal(isQaRunIdShape(FAILED_RUN.id), true);
  assert.equal(isQaRunIdShape("zzz"), false);
  assert.equal(isQaRunIdShape("1"), false);
});
