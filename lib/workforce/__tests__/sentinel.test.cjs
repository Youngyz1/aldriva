/**
 * Stage 9 hermetic tests: Sentinel overview + incident list/detail data access.
 *
 * No database, no network. Fake chainable client captures the query chain.
 * Verifies: (1) overview/list/detail/event reads against the REAL migration-143
 * schema (statuses open/investigating/resolved/expired, severities s1-s4, the 10
 * event kinds incl. qa_failure — nothing invented), bounded + newest-first,
 * (2) tenant contract: platform view (null) unfiltered, tenant view strict
 * .eq('tenant_id', …) — incidents share the tasks/reports contract, NOT QA's
 * .or() (platform rows are admin-only by RLS), (3) detail hops run→task,
 * approval, reports-by-run (reports.ts pattern), (4) no-secrets: metadata /
 * actor columns never selected, message truncated + redacted, serialized VM
 * scanned, module source has no write calls, (5) empty states + missing → null
 * (page 404s) + id-shape guard, (6) page sources: requireAdmin present, no
 * lifecycle-write controls (read-only enforcement).
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

const {
  fetchSentinelOverview,
  buildSentinelOverviewViewModel,
  fetchIncidentList,
  fetchIncidentFilterCounts,
  fetchEventList,
  fetchIncidentDetail,
  buildIncidentDetailViewModel,
  redactSentinelMessage,
  isIncidentStatusValue,
  isIncidentSeverityValue,
  isEventKindValue,
  isIncidentIdShape,
} = require("../sentinel");

const INC1 = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", tenant_id: null, status: "open", severity: "s2",
  title: "api_error — /api/ai/gateway — orchestrator_error", summary: null,
  dedupe_key: "api_error:/api/ai/gateway::orchestrator_error:platform",
  event_count: 3, first_seen_at: "2026-09-27T10:00:00Z", last_seen_at: "2026-09-27T12:00:00Z",
  agent_run_id: "r1", created_at: "2026-09-27T10:00:00Z", updated_at: "2026-09-27T12:00:00Z",
};
const INC2 = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", tenant_id: "t-1", status: "investigating", severity: "s4",
  title: "guard_rejection — chat", summary: "PII block on outbound text.",
  dedupe_key: "guard_rejection::output_guard:pii_email:t-1",
  event_count: 1, first_seen_at: "2026-09-27T11:00:00Z", last_seen_at: "2026-09-27T11:00:00Z",
  agent_run_id: null, created_at: "2026-09-27T11:00:00Z", updated_at: "2026-09-27T11:00:00Z",
};
const INC3 = {
  id: "cccccccc-cccc-cccc-cccc-cccccccccccc", tenant_id: null, status: "resolved", severity: "s3",
  title: "job_error — purge", summary: null,
  dedupe_key: "job_error:/api/cron/purge-accounts::purge_fatal:platform",
  event_count: 5, first_seen_at: "2026-09-26T03:00:00Z", last_seen_at: "2026-09-26T04:00:00Z",
  agent_run_id: null, created_at: "2026-09-26T03:00:00Z", updated_at: "2026-09-26T05:00:00Z",
};
const LONG_MSG = `orchestrator failed; api_key=RAW_MUST_NOT_RENDER sk_test_RAW_MUST_NOT_RENDER password=hunter2 ${"E".repeat(500)}`;
const EV1 = {
  id: "e1", kind: "api_error", severity_hint: "error", route: "/api/ai/gateway", tool_name: null,
  status_code: 500, error_code: "orchestrator_error", message: LONG_MSG,
  dedupe_key: INC1.dedupe_key, source: "aldriva", created_at: "2026-09-27T12:00:00Z",
};
const EV2 = {
  id: "e2", kind: "qa_failure", severity_hint: "warn", route: "/api/qa/ingest", tool_name: "qa_ingest",
  status_code: null, error_code: "qa_first:smoke", message: "smoke failed: 1 failed",
  dedupe_key: "qa_failure:/api/qa/ingest:qa_ingest:qa_first:smoke:platform", source: "qa_sweep",
  created_at: "2026-09-27T11:30:00Z",
};
const EV3 = {
  id: "e3", kind: "guard_rejection", severity_hint: "warn", route: null, tool_name: "output_guard",
  status_code: 422, error_code: "pii_email", message: "blocked email excerpt",
  dedupe_key: INC2.dedupe_key, source: "aldriva", created_at: "2026-09-27T11:00:00Z",
};
const ROWS = {
  incidents: [INC1, INC2, INC3],
  incident_events: [{ event_id: "e1" }, { event_id: "e2" }],
  system_events: [EV1, EV2, EV3],
  agent_runs: [{ id: "r1", task_id: "t1", approval_id: "p1" }],
  agent_tasks: [{ id: "t1", title: "Sweep investigation", status: "completed" }],
  approvals: [{ id: "p1", action: "notifyOwner", status: "approved" }],
  agent_reports: [{ id: "rep1", report_type: "incident", summary: "Sweep summary", created_at: "2026-09-27T12:30:00Z" }],
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
    const tables = this.client.tables || ROWS;
    resolve({ data: tables[this.table] || [], error: null, count: null });
    return Promise.resolve();
  }
}

function fakeClient(queries, tables) {
  return {
    queries,
    tables: tables || ROWS,
    from(table) {
      const q = new FakeQuery(this, table);
      queries.push(q);
      return q;
    },
  };
}

function callsFor(queries, table, nth = 0) {
  const found = queries.filter((x) => x.table === table);
  assert.ok(found.length > nth, `expected a query on ${table}`);
  return found[nth].calls;
}

test("value sets are the real schema sets — nothing invented", () => {
  for (const s of ["open", "investigating", "resolved", "expired"]) assert.equal(isIncidentStatusValue(s), true, s);
  for (const s of ["closed", "acknowledged", "pending", ""]) assert.equal(isIncidentStatusValue(s), false, `invented status rejected: ${s || "(empty)"}`);
  for (const s of ["s1", "s2", "s3", "s4"]) assert.equal(isIncidentSeverityValue(s), true, s);
  assert.equal(isIncidentSeverityValue("s0"), false);
  assert.equal(isIncidentSeverityValue("critical"), false);
  for (const k of ["api_error", "job_error", "webhook_error", "payment_reconciliation", "auth_failure", "storage_error", "guard_rejection", "approval_block", "agent_tool_error", "qa_failure"]) {
    assert.equal(isEventKindValue(k), true, k);
  }
  assert.equal(isEventKindValue("deploy"), false);
  assert.equal(isEventKindValue("cron"), false);
});

test("overview reads active incidents + recent events + qa failures, bounded", async () => {
  const queries = [];
  const raw = await fetchSentinelOverview(fakeClient(queries), null);
  assert.equal(raw.active.length, 3);
  assert.equal(raw.recentEvents.length, 3);
  assert.equal(raw.recentQaFailures.length, 3, "fake returns all rows; kind filter asserted below");
  const incCalls = callsFor(queries, "incidents");
  assert.ok(incCalls.some(([m, c, v]) => m === "in" && c === "status" && v.includes("open") && v.includes("investigating")), "active-only window");
  assert.ok(incCalls.some(([m, n]) => m === "limit" && n === 50), "bounded");
  assert.ok(incCalls.some(([m, c, o]) => m === "order" && c === "last_seen_at" && o && o.ascending === false), "newest first");
  const evQueries = queries.filter((x) => x.table === "system_events");
  assert.equal(evQueries.length, 2, "recent events + qa failures");
  const qaCalls = evQueries[1].calls;
  assert.ok(qaCalls.some(([m, c, v]) => m === "eq" && c === "kind" && v === "qa_failure"), "qa_failure kind filter");
  assert.ok(qaCalls.some(([m, n]) => m === "limit" && n === 5), "qa window bounded to 5");
});

test("overview view model: counts, severity histogram, attention, empties", () => {
  const vm = buildSentinelOverviewViewModel({
    active: [INC1, INC2],
    recentEvents: [EV1],
    recentQaFailures: [],
  });
  assert.deepEqual(vm.counts, { open: 1, investigating: 1, active: 2, attention: 1 });
  assert.deepEqual(vm.severity, { s2: 1, s4: 1 });
  assert.equal(vm.attention.length, 1, "open s2 needs attention; investigating s4 does not");
  assert.equal(vm.attention[0].id, INC1.id);
  assert.deepEqual([vm.empty.incidents, vm.empty.events, vm.empty.qa, vm.empty.attention], [false, false, true, false]);
  const empty = buildSentinelOverviewViewModel({ active: [], recentEvents: [], recentQaFailures: [] });
  assert.deepEqual([empty.empty.incidents, empty.empty.events, empty.empty.qa, empty.empty.attention], [true, true, true, true]);
  assert.deepEqual(empty.counts, { open: 0, investigating: 0, active: 0, attention: 0 });
});

test("tenant contract: platform view unfiltered; tenant view strict eq (never .or())", async () => {
  let queries = [];
  await fetchIncidentList(fakeClient(queries), null, null, null);
  let calls = callsFor(queries, "incidents");
  assert.ok(!calls.some(([m, c]) => m === "eq" && c === "tenant_id"), "platform view: no tenant filter — platform incidents stay visible");

  queries = [];
  await fetchIncidentList(fakeClient(queries), "t-9", null, null);
  calls = callsFor(queries, "incidents");
  assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "tenant_id" && v === "t-9"), "tenant view filters by tenant_id");
  assert.ok(!calls.some(([m]) => m === "or"), "incidents use strict eq, NOT QA's .or() (platform rows are admin-only by RLS)");

  queries = [];
  await fetchSentinelOverview(fakeClient(queries), "t-9");
  for (const t of ["incidents", "system_events"]) {
    const cs = callsFor(queries, t);
    assert.ok(cs.some(([m, c, v]) => m === "eq" && c === "tenant_id" && v === "t-9"), `overview ${t} tenant-scoped`);
  }

  queries = [];
  await fetchIncidentDetail(fakeClient(queries), INC2.id, "t-1");
  const detailCalls = callsFor(queries, "incidents");
  assert.ok(detailCalls.some(([m, c, v]) => m === "eq" && c === "tenant_id" && v === "t-1"), "detail tenant-scoped");
});

test("list filters by real status + severity, bounded, newest-first", async () => {
  const queries = [];
  const rows = await fetchIncidentList(fakeClient(queries), null, "open", "s2");
  assert.equal(rows.length, 3, "fake ignores filters; chain asserted below");
  const calls = callsFor(queries, "incidents");
  assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "status" && v === "open"), "status filter");
  assert.ok(calls.some(([m, c, v]) => m === "eq" && c === "severity" && v === "s2"), "severity filter");
  assert.ok(calls.some(([m, n]) => m === "limit" && n === 50), "bounded");

  const counts = await fetchIncidentFilterCounts(fakeClient(queries), null);
  assert.deepEqual(counts.byStatus, { open: 1, investigating: 1, resolved: 1 });
  assert.deepEqual(counts.bySeverity, { s2: 1, s4: 1, s3: 1 });
});

test("detail resolves incident + join timeline + run/task/approval/reports hops", async () => {
  const queries = [];
  const raw = await fetchIncidentDetail(fakeClient(queries), INC1.id, null);
  assert.ok(raw, "detail resolves");
  assert.equal(raw.incident.title, INC1.title);
  assert.equal(raw.events.length, 3, "fake returns all system_events; join asserted below");
  const joinCalls = callsFor(queries, "incident_events");
  assert.ok(joinCalls.some(([m, c, v]) => m === "eq" && c === "incident_id" && v === INC1.id), "timeline joins by incident_id");
  assert.ok(!joinCalls.some(([m, c]) => m === "eq" && c === "tenant_id"), "join inherits scope from parent (no tenant column)");
  const runCalls = callsFor(queries, "agent_runs");
  assert.ok(runCalls.some(([m, c, v]) => m === "eq" && c === "id" && v === "r1"), "run fetched by agent_run_id");
  assert.equal(raw.run.task_id, "t1");
  assert.equal(raw.task.title, "Sweep investigation");
  assert.equal(raw.approval.action, "notifyOwner");
  assert.equal(raw.reports.length, 1);
  assert.equal(raw.reports[0].report_type, "incident");
  const agentCalls = callsFor(queries, "approvals");
  assert.ok(!agentCalls.some(([m, c]) => m === "eq" && c === "tenant_id"), "approval lookup never tenant-filtered");
});

test("detail with no run link issues no hop queries; nulls normalize", async () => {
  const queries = [];
  // Narrow the fake to INC2: the harness ignores .eq filters, so a shared
  // table would return INC1 (which has a run) for every detail query.
  const tables = { ...ROWS, incidents: [INC2], incident_events: [] };
  const raw = await fetchIncidentDetail(fakeClient(queries, tables), INC2.id, "t-1");
  assert.ok(raw, "detail resolves");
  assert.equal(raw.run, null);
  assert.equal(raw.task, null);
  assert.equal(raw.approval, null);
  assert.deepEqual(
    queries.filter((x) => ["agent_runs", "agent_tasks", "approvals", "agent_reports"].includes(x.table)),
    [],
    "no hop queries without agent_run_id"
  );
  const vm = buildIncidentDetailViewModel(raw);
  assert.deepEqual([vm.empty.run, vm.empty.reports], [true, true], "no run → no hops, no reports");
  assert.equal(vm.empty.summary, false, "INC2 has a summary");
});

test("detail view model: kind histogram, qa linkage count, empties", async () => {
  const queries = [];
  const raw = await fetchIncidentDetail(fakeClient(queries), INC1.id, null);
  const vm = buildIncidentDetailViewModel(raw);
  assert.equal(vm.counts.events, 3);
  assert.deepEqual(vm.counts.byKind, { api_error: 1, qa_failure: 1, guard_rejection: 1 });
  assert.equal(vm.counts.qaFailureEvents, 1, "qa_failure events counted for the QA-linkage note");
  assert.equal(vm.empty.events, false);
  assert.equal(vm.empty.summary, true, "INC1 summary null → honest empty");
});

test("forbidden columns are never selected", async () => {
  const queries = [];
  await fetchIncidentDetail(fakeClient(queries), INC1.id, null);
  await fetchIncidentList(fakeClient(queries), null, null, null);
  await fetchEventList(fakeClient(queries), null, null);
  const banned = new Set(["metadata", "actor_id", "agent_id", "claim_token_hash", "password", "secret", "token"]);
  for (const q of queries) {
    for (const [m, cols] of q.calls) {
      if (m !== "select") continue;
      for (const tok of String(cols).split(/[,\s]+/)) {
        assert.ok(!banned.has(tok), `${q.table} select must not include ${tok}`);
      }
    }
  }
});

test("message redaction: secrets scrubbed, long text truncated", () => {
  assert.equal(redactSentinelMessage(null), null);
  const r = redactSentinelMessage("boom api_key=supersecret session=abc123 cookie=sess_xyz");
  assert.ok(!r.includes("supersecret") && !r.includes("abc123") && !r.includes("sess_xyz"), "pairs scrubbed");
  assert.ok(r.includes("api_key=[redacted]"), "key name preserved as label");
  assert.ok(!redactSentinelMessage("k sk_test_abc123XYZ").includes("sk_test_abc123XYZ"), "stripe key scrubbed");
  const pem = redactSentinelMessage("x -----BEGIN RSA PRIVATE KEY-----\nMIIB -----END RSA PRIVATE KEY----- y");
  assert.ok(!pem.includes("MIIB"), "PEM scrubbed");
});

test("detail messages truncated + redacted; no raw payloads in view model", async () => {
  const queries = [];
  const raw = await fetchIncidentDetail(fakeClient(queries), INC1.id, null);
  const byId = Object.fromEntries(raw.events.map((e) => [e.id, e]));
  assert.ok(byId["e1"].message.length <= 320, `message truncated (got ${byId["e1"].message.length})`);
  assert.ok(byId["e1"].message.endsWith("…[truncated]"), "marker present");
  assert.ok(!byId["e1"].message.includes("RAW_MUST_NOT_RENDER"), "secret scrubbed");
  assert.ok(!byId["e1"].message.includes("hunter2"), "password scrubbed");
  const vm = buildIncidentDetailViewModel(raw);
  const dumped = JSON.stringify(vm).toLowerCase();
  for (const banned of ["raw_must_not_render", "hunter2", "supersecret", "service_role", "metadata", "insert", "update incidents", "delete from"]) {
    assert.ok(!dumped.includes(banned), `view model must not contain ${banned}`);
  }
});

test("module performs zero writes (read-only enforcement)", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib", "workforce", "sentinel.ts"), "utf8");
  assert.ok(!/\.insert\(/.test(src), "no inserts");
  assert.ok(!/\.update\(/.test(src), "no updates");
  assert.ok(!/\.delete\(/.test(src), "no deletes");
  assert.ok(!/\.upsert\(/.test(src), "no upserts");
  assert.ok(!/supabase-admin|createSupabaseAdmin/.test(src), "no service-role import");
  assert.ok(!/closeStaleIncidents\s*\(/.test(src), "lifecycle function never invoked (name may appear in comments only)");
});

test("detail missing resolves null (page 404s); id shape guard", async () => {
  const client = { from: (t) => (t === "incidents" ? { select: () => ({ eq: () => ({ limit: () => ({ then: (r) => { r({ data: [], error: null }); return Promise.resolve(); } }) }) }) } : fakeClient([]).from(t)) };
  const raw = await fetchIncidentDetail(client, INC1.id, null);
  assert.equal(raw, null);
  assert.equal(isIncidentIdShape(INC1.id), true);
  assert.equal(isIncidentIdShape("zzz"), false);
  assert.equal(isIncidentIdShape("not-a-uuid-at-all"), false);
});

test("sentinel pages: requireAdmin present, no lifecycle-write controls", () => {
  for (const rel of [
    "app/admin/workforce/sentinel/page.tsx",
    "app/admin/workforce/sentinel/incidents/page.tsx",
    "app/admin/workforce/sentinel/incidents/[id]/page.tsx",
  ]) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.ok(!/^"use client"/m.test(src), `${rel} is a server component`);
    assert.ok(src.includes("await requireAdmin()"), `${rel} calls requireAdmin()`);
    assert.ok(!/<form[\s>]/.test(src), `${rel} has no forms (no acknowledge/resolve/close controls)`);
    assert.ok(!/<button[\s>]/.test(src), `${rel} has no buttons (actions are navigation links only)`);
    assert.ok(!/\.update\(|\.delete\(|revalidatePath|closeStaleIncidents\s*\(/i.test(src), `${rel} issues no writes`);
    assert.ok(/read-only/i.test(src), `${rel} states its read-only scope honestly`);
  }
});
