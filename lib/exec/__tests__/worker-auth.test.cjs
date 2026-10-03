/**
 * Stage 16 — worker authentication tests (B1d).
 *
 * Behavioral: real token primitives execute (transpiled TS); real exec-claim
 * route handler executes to its 401. Stubs only at boundaries (rate limiter,
 * DB client, system-events recorder). Outcomes asserted on booleans, HTTP
 * status/body, and recorded event content — including a negative scan proving
 * presented tokens never reach the audit trail.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const { NextRequest } = require("next/server");
const harness = require("../../actions/__tests__/helpers/hermetic.cjs");
const { makeFakeDb, loadWithStubs } = harness;
const fs = require("node:fs");
const path = require("node:path");

harness.installHook();
const execTokens = require("../tokens");
const qaTokens = require("../../qa/tokens");

const S = "worker-secret";
const P = "worker-prev-secret";

// ── behavioral: Layer-1 bearer ──────────────────────────────────────────────

test("exec Layer-1: unset/empty/wrong fail closed; secret and PREV pass", () => {
  assert.equal(execTokens.isAuthorizedWorkerRequest(null, S, P), false);
  assert.equal(execTokens.isAuthorizedWorkerRequest("Bearer x", undefined, undefined), false);
  assert.equal(execTokens.isAuthorizedWorkerRequest("Bearer x", "", null), false);
  assert.equal(execTokens.isAuthorizedWorkerRequest("Bearer wrong", S, P), false);
  assert.equal(execTokens.isAuthorizedWorkerRequest(`Bearer ${S}`, S, P), true);
  assert.equal(execTokens.isAuthorizedWorkerRequest(`Bearer ${P}`, S, P), true, "PREV rotation accepted");
  assert.equal(execTokens.isAuthorizedWorkerRequest(`Bearer ${P}`, undefined, P), true, "PREV alone suffices");
});

test("QA Layer-1: unset/empty/wrong fail closed; secret and PREV pass", () => {
  assert.equal(qaTokens.isAuthorizedPollRequest(null, S, P), false);
  assert.equal(qaTokens.isAuthorizedPollRequest("Bearer x", undefined, undefined), false);
  assert.equal(qaTokens.isAuthorizedPollRequest("Bearer wrong", S, P), false);
  assert.equal(qaTokens.isAuthorizedPollRequest(`Bearer ${S}`, S, P), true);
  assert.equal(qaTokens.isAuthorizedPollRequest(`Bearer ${P}`, S, P), true, "PREV rotation accepted");
});

// ── behavioral: Layer-2 claim tokens ────────────────────────────────────────

test("claim tokens: mismatch/expiry fail; exact match passes", () => {
  const minted = execTokens.mintExecClaimToken(Date.parse("2026-01-01T00:00:00Z"));
  assert.equal(
    execTokens.verifyExecClaimToken(minted.token, minted.hash, minted.expiresAtIso, "2026-01-01T00:05:00Z"),
    true
  );
  assert.equal(execTokens.verifyExecClaimToken("wrong", minted.hash, minted.expiresAtIso, "2026-01-01T00:05:00Z"), false);
  assert.equal(execTokens.verifyExecClaimToken(minted.token, minted.hash, minted.expiresAtIso, "2026-01-01T05:00:00Z"), false, "expired");
  assert.equal(execTokens.verifyExecClaimToken(minted.token, null, minted.expiresAtIso, "2026-01-01T00:05:00Z"), false, "missing hash");
});

// ── static: constant-time, never === ────────────────────────────────────────

test("token comparisons are constant-time, never raw equality", () => {
  for (const rel of ["lib/exec/tokens.ts", "lib/qa/tokens.ts"]) {
    const src = fs.readFileSync(path.join(harness.ROOT, rel), "utf8");
    assert.ok(src.includes("timingSafeEqual"), `${rel} must use timingSafeEqual`);
    assert.ok(!/===\s*secret\b/.test(src), `${rel} no raw === secret`);
    assert.ok(!/\bsecret\s*===/.test(src), `${rel} no raw secret ===`);
    assert.ok(!/===\s*prevSecret\b/.test(src), `${rel} no raw === prevSecret`);
    assert.ok(!/authHeader\s*===/.test(src), `${rel} no raw header compare`);
  }
});

// ── behavioral: 401 audit shape carries no token material ───────────────────

test("exec claim 401 logs fixed denial with zero token material", async () => {
  const events = [];
  const { mod } = loadWithStubs("app/api/exec/claim/route.ts", {
    adminDb: makeFakeDb(), events,
  });
  const presented = "WRONG-presented-token-xyz";
  const res = await mod.POST(
    new NextRequest("http://test/api/exec/claim", {
      method: "POST",
      headers: { authorization: `Bearer ${presented}` },
    })
  );
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Unauthorized" });
  assert.equal(events.length, 1, "one denial call recorded");
  // The route hands the logger (request, fixed label, fixed code) — the token
  // travels only inside the request object, which the real helper never
  // serializes (stage15 static shape test pins its fixed message).
  assert.deepEqual(events[0].denialArgs, ["[request]", "POST /api/exec/claim", "worker_unauthorized"]);
  assert.ok(!JSON.stringify(events[0]).includes(presented), "presented token appears in no logger argument");
});

test("QA poll 401 logs fixed denial with zero token material", async () => {
  process.env.QA_INGEST_TOKEN = "qa-secret";
  process.env.QA_INGEST_TOKEN_PREV = "qa-prev";
  try {
    const events = [];
    const { mod } = loadWithStubs("app/api/qa/poll/route.ts", {
      adminDb: makeFakeDb(), events,
    });
    const presented = "WRONG-qa-token-xyz";
    const res = await mod.GET(
      new NextRequest("http://test/api/qa/poll?worker_run_id=w", {
        headers: { authorization: `Bearer ${presented}` },
      })
    );
    assert.equal(res.status, 401);
    const blob = JSON.stringify(events[0] ?? {});
    assert.ok(!blob.includes(presented), "presented token must not reach the audit trail");
    assert.deepEqual(events[0]?.denialArgs, ["[request]", "GET /api/qa/poll", "worker_unauthorized"]);
  } finally {
    delete process.env.QA_INGEST_TOKEN;
    delete process.env.QA_INGEST_TOKEN_PREV;
  }
});
