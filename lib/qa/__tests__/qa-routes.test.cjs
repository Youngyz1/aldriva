/**
 * Stage 16 — behavioral tests for the QA worker routes.
 *
 * Hermetic: real route handlers + real token/ingest logic execute; ONLY
 * boundaries are stubbed (rate limiter, database client, system-events).
 * next/server is real. Outcomes asserted on HTTP status + body + fake-DB
 * call record.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("node:crypto");
const { NextRequest } = require("next/server");
const { makeFakeDb, loadWithStubs } = require("../../actions/__tests__/helpers/hermetic.cjs");

const SECRET = "qa-ingest-secret";
const PREV = "qa-ingest-prev-secret";

function withSecrets(fn) {
  const old = { token: process.env.QA_INGEST_TOKEN, prev: process.env.QA_INGEST_TOKEN_PREV };
  process.env.QA_INGEST_TOKEN = SECRET;
  process.env.QA_INGEST_TOKEN_PREV = PREV;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (old.token === undefined) delete process.env.QA_INGEST_TOKEN; else process.env.QA_INGEST_TOKEN = old.token;
      if (old.prev === undefined) delete process.env.QA_INGEST_TOKEN_PREV; else process.env.QA_INGEST_TOKEN_PREV = old.prev;
    });
}

function pollReq(token) {
  return new NextRequest("http://test/api/qa/poll?worker_run_id=wr-1", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function ingestReq(token, body) {
  return new NextRequest("http://test/api/qa/ingest", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function loadPoll(adminDb) {
  return loadWithStubs("app/api/qa/poll/route.ts", { adminDb });
}
function loadIngest(adminDb) {
  return loadWithStubs("app/api/qa/ingest/route.ts", { adminDb });
}

// ── poll: Layer-1 ───────────────────────────────────────────────────────────

test("poll: no token → 401 with generic body", () =>
  withSecrets(async () => {
    const { mod, stubs } = loadPoll(makeFakeDb());
    const res = await mod.GET(pollReq(null));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "Unauthorized" });
    assert.deepEqual(stubs.events[0]?.denialArgs, ["[request]", "GET /api/qa/poll", "worker_unauthorized"]);
  }));

test("poll: wrong token → 401", () =>
  withSecrets(async () => {
    const { mod } = loadPoll(makeFakeDb());
    const res = await mod.GET(pollReq("wrong-token"));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "Unauthorized" });
  }));

test("poll: PREV token accepted (reaches handler, not 401)", () =>
  withSecrets(async () => {
    const { mod } = loadPoll(makeFakeDb());
    // No worker_run_id → 400 proves Layer-1 passed with the PREV secret.
    const bare = new NextRequest("http://test/api/qa/poll", {
      headers: { authorization: `Bearer ${PREV}` },
    });
    const res = await mod.GET(bare);
    assert.equal(res.status, 400, "PREV accepted: past auth, fails on missing param");
    assert.deepEqual(await res.json(), { error: "worker_run_id is required" });
  }));

test("poll: current token with no claimable work → 200 claimed:false", () =>
  withSecrets(async () => {
    const { mod } = loadPoll(makeFakeDb({ qa_runs: [] }));
    const res = await mod.GET(pollReq(SECRET));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.claimed, false, "real pollAndClaim runs against the fake: nothing to claim");
  }));

// ── ingest: Layer-2 claim token ─────────────────────────────────────────────

const TOKEN = "claim-plaintext-token";
const HASH = crypto.createHash("sha256").update(TOKEN, "utf8").digest("hex");
const FUTURE = "2999-01-01T00:00:00.000Z";

function runRow(over = {}) {
  return {
    id: "run-1", suite: "smoke", environment: "staging", target_tenant_id: null,
    status: "running", claim_token_hash: HASH, claim_expires_at: FUTURE, metadata: {},
    passed: 0, failed: 0, skipped: 0, finished_at: null, ...over,
  };
}

const GOOD_BODY = {
  runId: "run-1", status: "passed",
  results: [{ name: "t1", file: "a.spec.ts", status: "passed" }],
};

test("ingest: missing run and bad token share one 401 (no oracle)", () =>
  withSecrets(async () => {
    const { mod } = loadIngest(makeFakeDb({ qa_runs: [] }));
    const res = await mod.POST(ingestReq("wrong", GOOD_BODY));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "Unauthorized" });
  }));

test("ingest: claim-token mismatch on existing run → 401, nothing written", () =>
  withSecrets(async () => {
    const db = makeFakeDb({ qa_runs: [runRow()], qa_test_results: [] });
    const { mod } = loadIngest(db);
    const res = await mod.POST(ingestReq("wrong-token", GOOD_BODY));
    assert.equal(res.status, 401);
    assert.equal((db.tables.qa_test_results ?? []).length, 0, "mismatch writes no results");
  }));

test("ingest: valid token ingests once; replay is idempotent", () =>
  withSecrets(async () => {
    const db = makeFakeDb({ qa_runs: [runRow()], qa_test_results: [] });
    const { mod } = loadIngest(db);
    const first = await mod.POST(ingestReq(TOKEN, GOOD_BODY));
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.ok, true);
    assert.equal((db.tables.qa_test_results ?? []).length, 1, "one result set stored");
    const second = await mod.POST(ingestReq(TOKEN, GOOD_BODY));
    const secondBody = await second.json();
    assert.equal(secondBody.duplicate, true, "replay converges to duplicate no-op");
    assert.equal((db.tables.qa_test_results ?? []).length, 1, "no second result set stored");
  }));
