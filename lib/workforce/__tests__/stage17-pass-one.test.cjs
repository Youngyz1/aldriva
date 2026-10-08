/**
 * Stage 17 (pass one) — stored-state truth tests.
 *
 * Hermetic: real lib logic executes (reclaim, decide action, applier,
 * view-models, sweep route with stubbed orchestrator); ONLY boundaries are
 * stubbed via the shared harness. Every test asserts on outcomes (row
 * states, redirect slugs, recorded calls), never merely that a stub ran.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { NextRequest } = require("next/server");
const harness = require("../../actions/__tests__/helpers/hermetic.cjs");
const { makeFakeDb, loadWithStubs, redirectUrl } = harness;

harness.installHook();
const { reclaimStaleLeases } = require("../../exec/recovery");
const { applyApprovedMemory } = require("../../workforce/memory-apply");
const { buildCommandCenterViewModel } = require("../../workforce/command-center");
const { buildAgentDetailViewModel } = require("../../workforce/agents");
const { buildActivityFeed } = require("../../workforce/activity");

const NOW = "2026-09-30T12:00:00.000Z";
const PAST_LEASE = "2026-09-30T11:00:00.000Z";

// ── O-1: reclaim closes the orphan, leaves task math alone ─────────────────

function reclaimDb(over = {}) {
  return makeFakeDb({
    agent_tasks: [{
      id: "task-1", agent_id: "a1", tenant_id: null, approval_id: "ap-1",
      status: "running", attempt_count: 2, max_attempts: 5,
      lease_owner: "dead-worker", lease_expires_at: PAST_LEASE,
      claim_token_hash: "h", run_after: null, ...over,
    }],
    agent_runs: [{
      id: "run-1", task_id: "task-1", attempt_no: 2, status: "running",
      approval_id: "ap-1", completed_at: null, error: null,
    }],
  });
}

test("O-1 requeue: orphan run failed with fixed reason; task math untouched", async () => {
  const db = reclaimDb();
  const out = await reclaimStaleLeases(db, { nowIso: NOW });
  assert.deepEqual(out.requeued, ["task-1"]);
  const run = db.tables.agent_runs[0];
  assert.equal(run.status, "failed", "orphan attempt closed");
  assert.equal(run.error, "exec-lease-expired:superseded", "fixed explanatory string");
  assert.equal(run.completed_at, NOW);
  const task = db.tables.agent_tasks[0];
  assert.equal(task.status, "queued", "task requeued");
  assert.equal(task.attempt_count, 2, "attempt count unchanged");
  assert.ok(task.run_after && task.run_after > NOW, "backoff preserved");
  assert.equal(task.lease_owner, null, "lease cleared");
});

test("O-1 exhaust: task failed AND orphan run failed", async () => {
  const db = reclaimDb({ attempt_count: 5, max_attempts: 5 });
  const fixed = { ...db.tables.agent_runs[0], attempt_no: 5 };
  db.tables.agent_runs[0] = fixed;
  const out = await reclaimStaleLeases(db, { nowIso: NOW });
  assert.deepEqual(out.exhausted, ["task-1"]);
  assert.equal(db.tables.agent_tasks[0].status, "failed");
  assert.equal(db.tables.agent_tasks[0].result_ref, "exec-retry-exhausted");
  assert.equal(db.tables.agent_runs[0].status, "failed", "orphan closed on exhaust too");
});

test("O-1 idempotent: second reclaim touches nothing terminal", async () => {
  const db = reclaimDb();
  await reclaimStaleLeases(db, { nowIso: NOW });
  const updatesAfterFirst = db.calls.updates.length;
  await reclaimStaleLeases(db, { nowIso: NOW });
  assert.equal(db.calls.updates.length, updatesAfterFirst, "no writes on replay");
});

test("O-1 leaves an already-terminal run alone", async () => {
  const db = reclaimDb();
  db.tables.agent_runs[0].status = "completed";
  await reclaimStaleLeases(db, { nowIso: NOW });
  const runUpdates = db.calls.updates.filter((u) => u.table === "agent_runs");
  assert.ok(runUpdates.every((u) => u.count === 0), "conditional close matched zero terminal rows");
  assert.equal(db.tables.agent_runs[0].status, "completed", "terminal run never overwritten");
  assert.equal(db.tables.agent_tasks[0].status, "queued", "task path unaffected");
});

// ── O-2: decision transitions the originating run ───────────────────────────

function decideForm(id, decision) {
  const fd = new FormData();
  fd.set("approvalId", id);
  fd.set("decision", decision);
  return fd;
}

test("O-2 rejected approval cancels its awaiting run, terminal run untouched", async () => {
  const db = makeFakeDb({
    approvals: [{
      id: "ap-9", tenant_id: null, action: "request_qa_run", risk: "low",
      status: "pending", expires_at: "2999-01-01T00:00:00.000Z",
    }],
    agent_runs: [
      { id: "run-live", approval_id: "ap-9", status: "awaiting_approval" },
      { id: "run-done", approval_id: "ap-9", status: "completed" },
    ],
  });
  const { mod } = loadWithStubs("lib/actions/workforce-approvals.ts", { adminDb: db });
  let url = null;
  try {
    await mod.decideWorkforceApproval(decideForm("ap-9", "rejected"));
  } catch (e) { url = redirectUrl(e); }
  assert.ok(url.includes("?decided=rejected"));
  assert.equal(db.tables.agent_runs.find((r) => r.id === "run-live").status, "cancelled");
  assert.equal(db.tables.agent_runs.find((r) => r.id === "run-done").status, "completed", "terminal row untouched");
});

test("O-2 run-transition failure never fails the decision", async () => {
  const db = makeFakeDb({
    approvals: [{
      id: "ap-9", tenant_id: null, action: "request_qa_run", risk: "low",
      status: "pending", expires_at: "2999-01-01T00:00:00.000Z",
    }],
    agent_runs: [{ id: "run-live", approval_id: "ap-9", status: "awaiting_approval" }],
  });
  db.failTables = new Set(["agent_runs"]);
  const { mod } = loadWithStubs("lib/actions/workforce-approvals.ts", { adminDb: db });
  let url = null;
  try {
    await mod.decideWorkforceApproval(decideForm("ap-9", "approved"));
  } catch (e) { url = redirectUrl(e); }
  assert.ok(url.includes("?decided=approved"), "decision stands despite transition failure");
  assert.equal(db.tables.approvals[0].status, "approved");
  assert.equal(db.tables.agent_runs[0].status, "awaiting_approval", "failed transition retried later");
});

// ── O-5: approver threaded into the RPC, replay idempotent ─────────────────

const PROPOSAL = {
  op: "CREATE", scope: "platform-shared", agent: "shared",
  fact_key: "standup", fact_value: "Daily at 09:00.", base_version: 0,
};

function memoryDb() {
  return makeFakeDb({
    approvals: [{
      id: "ap-m", action: "memory_propose", status: "approved", tenant_id: null,
      requested_by_agent_id: "agent-1", approver_id: "human-9",
      audit_ref: null, proposed_outcome: { memory_proposal: PROPOSAL }, evidence: {},
    }],
  }, (fn) => {
    if (fn !== "apply_agent_memory") return { data: null, error: { message: "unknown fn" } };
    return { data: [{ applied: true, fact_id: "fact-1", version: 1, reason: "created" }], error: null };
  });
}

test("O-5 agent-proposed apply passes the human approver id", async () => {
  const db = memoryDb();
  const out = await applyApprovedMemory(db, { approvalId: "ap-m", nowIso: NOW });
  assert.equal(out.applied.length, 1);
  assert.equal(db.calls.rpcs.length, 1);
  assert.equal(db.calls.rpcs[0].params.p_approver, "human-9", "decided approver recorded");
  assert.equal(db.calls.rpcs[0].params.p_proposer_agent, "agent-1", "proposer preserved");
});

test("O-5 replay still idempotent with approver threaded", async () => {
  const db = memoryDb();
  await applyApprovedMemory(db, { approvalId: "ap-m", nowIso: NOW });
  db.tables.approvals[0].audit_ref = "memory:applied:fact-1:v1";
  const out = await applyApprovedMemory(db, { approvalId: "ap-m", nowIso: NOW });
  assert.equal(db.calls.rpcs.length, 2, "RPC re-entered");
  assert.equal(db.calls.rpcs[1].params.p_approver, "human-9", "approver stable across replay");
  assert.ok(out.applied.length === 1 || out.skipped.length === 1, "converges without duplication");
});

// ── O-3: sweep stamps agent_run_id (orchestrator stubbed: model = boundary) ─

test("O-3 sweep stamps only unstamped incidents, non-fatally", async () => {
  process.env.CRON_SECRET = "sweep-secret";
  const path = require("node:path");
  const Module = require("node:module");
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === "@/lib/ai/orchestrator") return path.join(__dirname, "helpers", "stub-orchestrator.cjs");
    return orig.call(this, request, parent, isMain, options);
  };
  try {
    const db = makeFakeDb({
      incidents: [
        { id: "inc-1", status: "open", agent_run_id: null },
        { id: "inc-2", status: "open", agent_run_id: "run-old" },
      ],
    });
    const { mod } = loadWithStubs("app/api/cron/sentinel-sweep/route.ts", { adminDb: db });
    const res = await mod.POST(new NextRequest("http://test/api/cron/sentinel-sweep", {
      method: "POST",
      headers: { authorization: "Bearer sweep-secret" },
    }));
    assert.equal(res.status, 200);
    const inc1 = db.tables.incidents.find((i) => i.id === "inc-1");
    const inc2 = db.tables.incidents.find((i) => i.id === "inc-2");
    assert.equal(inc1.agent_run_id, "run-stub-9", "unstamped incident linked");
    assert.equal(inc2.agent_run_id, "run-old", "existing stamp never overwritten");
  } finally {
    Module._resolveFilename = orig;
    delete process.env.CRON_SECRET;
  }
});

// ── O-6/O-7 read-side fixtures ──────────────────────────────────────────────

function commandRaw() {
  return {
    agents: [
      { id: "a1", display_name: "Dylan", name: "dylan", status: "active" },
      { id: "a2", display_name: "QA", name: "qa", status: "active" },
    ],
    runs: [
      // Stale phantom: approval already decided, run never transitioned.
      { id: "r-stale", agent_id: "a1", tenant_id: null, task_id: "t-1", status: "awaiting_approval", triggered_by: "gateway", error: null, created_at: "2026-09-29T00:00:00Z", completed_at: "2026-09-29T00:00:00Z", approval_id: "ap-decided" },
      { id: "r-live", agent_id: "a1", tenant_id: null, task_id: "t-2", status: "running", triggered_by: "gateway", error: null, created_at: "2026-09-30T00:00:00Z", completed_at: null, approval_id: null },
    ],
    tasks: [
      // Born-completed gateway task whose run is still live (O-6 case).
      { id: "t-1", agent_id: "a1", tenant_id: null, title: "old", status: "completed", created_at: "2026-09-29T00:00:00Z" },
      { id: "t-2", agent_id: "a1", tenant_id: null, title: "new", status: "completed", created_at: "2026-09-30T00:00:00Z" },
    ],
    approvals: [],
    reports: [], incidents: [], events: [],
    qaRunCount: 2,
    decidedApprovalIds: ["ap-decided"],
  };
}

test("O-7 staleness guard: decided phantom excluded from busy and counts", () => {
  const vm = buildCommandCenterViewModel(commandRaw());
  assert.equal(vm.counts.awaitingApproval, 0, "stale awaiting run not counted");
  assert.equal(vm.counts.runningRuns, 1, "live run counted");
  const dylan = vm.agents.find((a) => a.agent.id === "a1");
  assert.equal(dylan.busy, true, "busy from the live run");
  assert.equal(vm.counts.activeTasks, 1, "only the completed task with a LIVE run counts (stale phantom excluded)");
});

test("O-7 agent detail: current task non-terminal, activity completed-first", () => {
  const vm = buildAgentDetailViewModel({
    agent: { id: "a1", display_name: "Dylan", autonomy_level: "L0" },
    tools: [],
    tasks: [
      { id: "t-old", title: "old", status: "completed", created_at: "2026-09-29T00:00:00Z" },
      { id: "t-new", title: "new", status: "running", created_at: "2026-09-30T00:00:00Z" },
    ],
    runs: [
      { id: "r1", status: "running", triggered_by: "gateway", error: null, created_at: "2026-09-30T00:00:00Z", completed_at: null },
      { id: "r0", status: "completed", triggered_by: "gateway", error: null, created_at: "2026-09-29T00:00:00Z", completed_at: "2026-09-29T01:00:00Z" },
    ],
    reports: [],
    knowledge: { platformApproved: 0, agentRoleDocs: [] },
    decidedApprovalIds: [],
  });
  assert.equal(vm.currentTask.id, "t-new", "newest non-terminal task is current");
  assert.equal(vm.lastActivityAt, "2026-09-30T00:00:00Z", "newest run completion-or-creation");
});

test("O-7 activity: awaiting_approval is not finished", () => {
  const feed = buildActivityFeed({
    agents: [{ id: "a1", display_name: "Dylan" }],
    runs: [{ id: "r1", agent_id: "a1", task_id: "t1", status: "awaiting_approval", triggered_by: "gateway", created_at: "2026-09-30T00:00:00Z", completed_at: "2026-09-30T00:00:00Z" }],
    tasks: [], approvals: [], reports: [], incidents: [], events: [],
  });
  const entry = feed.find((e) => e.key === "run-r1");
  assert.ok(entry, "run entry exists");
  assert.ok(!entry.title.startsWith("run completed") && !entry.title.startsWith("run failed"), `not rendered finished, got: ${entry.title}`);
  assert.equal(entry.ts, "2026-09-30T00:00:00Z", "falls back to creation, not a false completion");
});

// ── O-6 labels + static guards ──────────────────────────────────────────────

test("O-6 exec claims label manual; QA standing smoke keeps schedule", () => {
  const claim = fs.readFileSync(require("node:path").join(harness.ROOT, "lib/exec/claim.ts"), "utf8");
  assert.ok(claim.includes("triggered_by: 'manual'"), "exec attempts labelled manual");
  assert.ok(!claim.includes("triggered_by: 'schedule'"), "no schedule label left in exec claim");
  const qa = fs.readFileSync(require("node:path").join(harness.ROOT, "lib/qa/claim.ts"), "utf8");
  assert.ok(qa.includes("triggered_by: 'schedule'"), "QA standing smoke keeps schedule");
});

test("static: migration order current; guard untouched; writes conditional", () => {
  const dbFiles = fs.readdirSync(require("node:path").join(harness.ROOT, "db")).filter((f) => /^migration_1\d\d_/.test(f) && !f.includes("rollback"));
  const nums = dbFiles.map((f) => Number(f.match(/^migration_(\d+)_/)[1]));
  assert.equal(Math.max(...nums), 157, "migration 157 is the current latest migration");
  const approvals = fs.readFileSync(require("node:path").join(harness.ROOT, "lib/workforce/approvals.ts"), "utf8");
  const guardStart = approvals.indexOf("export async function decideApproval");
  const nextExport = approvals.indexOf("\nexport ", guardStart + 10);
  const guardBody = approvals.slice(guardStart, nextExport === -1 ? undefined : nextExport);
  assert.ok(guardBody.includes(".eq('status', 'pending')"), "conditional-update guard intact");
  assert.ok(!guardBody.includes("agent_runs"), "guard never touches runs");
  for (const [rel, state] of [
    ["lib/exec/recovery.ts", "running"],
    ["lib/workforce/approvals.ts", "awaiting_approval"],
  ]) {
    const src = fs.readFileSync(require("node:path").join(harness.ROOT, rel), "utf8");
    assert.ok(src.includes(`.eq('status', '${state}')`), `${rel} writes conditional on ${state}`);
  }
});
