/**
 * Stage 16 — behavioral tests for privileged Workforce server actions.
 *
 * Hermetic: real action logic executes; ONLY boundaries are stubbed
 * (auth, database clients, rate limiter, next/cache, next/navigation).
 * Every test asserts on OUTCOMES (redirect slug + fake-DB call record),
 * never merely that a stub ran.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const { makeFakeDb, loadWithStubs, redirectUrl } = require("./helpers/hermetic.cjs");

const PENDING = {
  id: "approval-1", tenant_id: null, action: "request_qa_run", risk: "low",
  status: "pending", expires_at: "2999-01-01T00:00:00.000Z",
};

function approvalForm(approvalId, decision) {
  const fd = new FormData();
  fd.set("approvalId", approvalId);
  fd.set("decision", decision);
  return fd;
}

// ── decideWorkforceApproval ─────────────────────────────────────────────────

test("decide: non-admin rejected before any DB call", async () => {
  const { mod, stubs } = loadWithStubs("lib/actions/workforce-approvals.ts", {
    auth: { mode: "reject" },
    adminDb: makeFakeDb({ approvals: [{ ...PENDING }] }),
  });
  let threw = null;
  try {
    await mod.decideWorkforceApproval(approvalForm("approval-1", "approved"));
  } catch (e) { threw = e; }
  assert.ok(threw, "requireAdmin must throw for non-admin");
  assert.equal(stubs.adminFactoryCalls, 0, "no DB client may be created for non-admin");
  assert.equal(stubs.redirects.length, 0, "no redirect after auth throw");
});

test("decide: invalid decision writes nothing", async () => {
  const db = makeFakeDb({ approvals: [{ ...PENDING }] });
  const { mod, stubs } = loadWithStubs("lib/actions/workforce-approvals.ts", { adminDb: db });
  let url = null;
  try {
    await mod.decideWorkforceApproval(approvalForm("approval-1", "maybe"));
  } catch (e) { url = redirectUrl(e); }
  assert.ok(url.includes("?decided=rejected"), `invalid decision redirects rejected, got ${url}`);
  assert.equal(db.calls.updates.length, 0, "invalid decision must not write");
  assert.equal(db.tables.approvals[0].status, "pending", "row untouched");
  assert.ok(stubs.redirects.length === 1, "one redirect issued");
});

test("decide: rate-limited writes nothing", async () => {
  const db = makeFakeDb({ approvals: [{ ...PENDING }] });
  const { mod, stubs } = loadWithStubs("lib/actions/workforce-approvals.ts", {
    adminDb: db, rate: { allowed: false },
  });
  let url = null;
  try {
    await mod.decideWorkforceApproval(approvalForm("approval-1", "approved"));
  } catch (e) { url = redirectUrl(e); }
  assert.ok(url.includes("?decided=rate-limited"), `rate limit slug, got ${url}`);
  assert.equal(db.calls.selects.length, 0, "rate limit must precede all DB reads");
  assert.equal(db.calls.updates.length, 0, "rate limit must precede all DB writes");
  assert.equal(stubs.adminFactoryCalls, 0, "no DB client under rate limit");
});

test("decide: already-decided approval not re-decidable", async () => {
  const db = makeFakeDb({ approvals: [{ ...PENDING, status: "approved" }] });
  const { mod } = loadWithStubs("lib/actions/workforce-approvals.ts", { adminDb: db });
  let url = null;
  try {
    await mod.decideWorkforceApproval(approvalForm("approval-1", "rejected"));
  } catch (e) { url = redirectUrl(e); }
  assert.ok(url.includes("?decided=rejected"), `decided row rejected, got ${url}`);
  assert.equal(db.calls.updates.length, 0, "decided row must not be updated");
});

test("decide: expired approval not decidable", async () => {
  const db = makeFakeDb({ approvals: [{ ...PENDING, expires_at: "2000-01-01T00:00:00.000Z" }] });
  const { mod } = loadWithStubs("lib/actions/workforce-approvals.ts", { adminDb: db });
  let url = null;
  try {
    await mod.decideWorkforceApproval(approvalForm("approval-1", "approved"));
  } catch (e) { url = redirectUrl(e); }
  assert.ok(url.includes("?decided=rejected"), `expired row rejected, got ${url}`);
  assert.equal(db.calls.updates.length, 0, "expired row must not be updated");
});

test("decide: valid approval writes decide + run transition (both conditional)", async () => {
  const db = makeFakeDb({
    approvals: [{ ...PENDING }],
    agent_runs: [{ id: "run-1", approval_id: "approval-1", status: "awaiting_approval" }],
  });
  const { mod } = loadWithStubs("lib/actions/workforce-approvals.ts", { adminDb: db });
  let url = null;
  try {
    await mod.decideWorkforceApproval(approvalForm("approval-1", "approved"));
  } catch (e) { url = redirectUrl(e); }
  assert.ok(url.includes("?decided=approved"), `approved slug, got ${url}`);
  assert.equal(db.calls.updates.length, 2, "decide write + run transition, nothing else");
  assert.equal(db.tables.approvals[0].status, "approved", "row decided");
  assert.equal(db.tables.agent_runs[0].status, "completed", "originating run completed");
});

// ── createMemoryDirect / createMemoryDirectFrom ─────────────────────────────

function memoryForm(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const GOOD = {
  fact_key: "standup time", fact_value: "Daily standup at 09:00.", scope: "platform", agent: "", expires_at: "",
};

test("memory: non-admin rejected before any DB call", async () => {
  const { mod, stubs } = loadWithStubs("lib/actions/workforce-memory.ts", {
    auth: { mode: "reject" }, adminDb: makeFakeDb(),
  });
  let threw = null;
  try {
    await mod.createMemoryDirect(memoryForm(GOOD));
  } catch (e) { threw = e; }
  assert.ok(threw, "requireAdmin must throw for non-admin");
  assert.equal(stubs.adminFactoryCalls, 0, "no DB client may be created for non-admin");
});

test("memory: secret-pattern value rejected with zero rpc", async () => {
  const db = makeFakeDb();
  const { mod } = loadWithStubs("lib/actions/workforce-memory.ts", { adminDb: db });
  const notice = await mod.createMemoryDirectFrom(
    { ...GOOD, fact_value: "deploy token=abc123 do not share" }, "admin-user-id"
  );
  assert.equal(notice, "error-secret", "secret value rejected");
  assert.equal(db.calls.rpcs.length, 0, "no RPC on secret rejection");
  assert.equal(db.calls.selects.length, 0, "no reads on secret rejection");
});

test("memory: unknown tenant rejected with zero rpc", async () => {
  const db = makeFakeDb({ organizers: [] });
  const { mod } = loadWithStubs("lib/actions/workforce-memory.ts", { adminDb: db });
  const notice = await mod.createMemoryDirectFrom(
    { ...GOOD, scope: "33333333-3333-3333-3333-333333333333" }, "admin-user-id"
  );
  assert.equal(notice, "error-scope", "unknown tenant rejected");
  assert.equal(db.calls.rpcs.length, 0, "no RPC on scope rejection");
});

test("memory: unknown agent rejected with zero rpc", async () => {
  const db = makeFakeDb({ agents: [] });
  const { mod } = loadWithStubs("lib/actions/workforce-memory.ts", { adminDb: db });
  const notice = await mod.createMemoryDirectFrom(
    { ...GOOD, agent: "44444444-4444-4444-4444-444444444444" }, "admin-user-id"
  );
  assert.equal(notice, "error-agent", "unknown agent rejected");
  assert.equal(db.calls.rpcs.length, 0, "no RPC on agent rejection");
});

test("memory: rate-limited with zero DB calls", async () => {
  const db = makeFakeDb();
  const { mod, stubs } = loadWithStubs("lib/actions/workforce-memory.ts", {
    adminDb: db, rate: { allowed: false },
  });
  let url = null;
  try {
    await mod.createMemoryDirect(memoryForm(GOOD));
  } catch (e) { url = redirectUrl(e); }
  assert.ok(url.includes("?created=rate-limited"), `rate limit slug, got ${url}`);
  assert.equal(db.calls.selects.length + db.calls.rpcs.length, 0, "no DB under rate limit");
  assert.equal(stubs.adminFactoryCalls, 0, "no DB client under rate limit");
});

test("memory: valid create calls the atomic RPC once", async () => {
  const db = makeFakeDb(
    {},
    () => ({ data: [{ applied: true, fact_id: "fact-1", version: 1, reason: "created" }], error: null })
  );
  const { mod } = loadWithStubs("lib/actions/workforce-memory.ts", { adminDb: db });
  const notice = await mod.createMemoryDirectFrom({ ...GOOD }, "admin-user-id");
  assert.equal(notice, "ok", "valid create succeeds");
  assert.equal(db.calls.rpcs.length, 1, "exactly one RPC");
  assert.equal(db.calls.rpcs[0].fn, "apply_agent_memory", "atomic RPC used");
  assert.equal(db.calls.rpcs[0].params.p_require_approval, false, "human path needs no approval row");
  assert.equal(db.calls.rpcs[0].params.p_source, "human", "human provenance recorded");
});
