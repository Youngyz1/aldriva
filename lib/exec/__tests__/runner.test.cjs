/**
 * Stage 10.4 hermetic tests: budgeted attempt runner.
 *
 * No database, no network. Injected fake dispatch. Covers: successful
 * execution (single dispatch, output capped), timeout (retryable, slow
 * executor never dispatches twice), tool failure retryable vs permanent,
 * thrown executor → retryable error, binding failure blocks dispatch
 * (executor never called), expired lease blocks dispatch, output truncation.
 */
const assert = require("node:assert/strict");
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

const { runAttempt } = require("../runner");
const { mintExecutionEnvelope } = require("../envelope");

const NOW = "2026-09-29T10:00:00Z";
const AGENT = "11111111-1111-1111-1111-111111111111";
const TENANT = "22222222-2222-2222-2222-222222222222";
const APPROVAL = "55555555-5555-5555-5555-555555555555";
const KEY = "44444444-4444-4444-4444-444444444444";

function job(over = {}) {
  const m = mintExecutionEnvelope({
    rawArgs: JSON.stringify({ suite: "smoke", environment: "staging", idempotencyKey: KEY }),
    tenantId: TENANT, agentId: AGENT, agentName: "qa",
    taskId: null, runId: null, action: "request_qa_run",
    budget: { maxAttempts: 3, attemptTimeoutMs: 5000, maxOutputChars: 4000 },
  });
  assert.equal(m.ok, true);
  return {
    jobId: "job-1", attemptNo: 1, agentId: AGENT, tenantId: TENANT, approvalId: APPROVAL,
    action: "request_qa_run", envelope: { ...m.envelope, approvalId: APPROVAL },
    runId: "run-1", leaseExpiresAt: "2026-09-29T10:15:00Z", ...over,
  };
}

function rows(over = {}) {
  return {
    approval: {
      id: APPROVAL, action: "request_qa_run", risk: "medium", status: "approved",
      expires_at: "2026-09-30T00:00:00Z", tenant_id: TENANT, proposed_outcome: null,
    },
    agent: { id: AGENT, name: "qa", autonomy_level: "L0", status: "active" },
    toolDef: { name: "request_qa_run", scope: "transactional", risk: "medium", approval_required: true },
    ...over,
  };
}

function run(input) {
  return runAttempt({
    job: job(), workerId: "w1", userId: "user-1", rows: rows(), nowIso: NOW,
    execute: async () => ({ ok: true, output: { receipt: "ok" } }), ...input,
  });
}

test("successful execution dispatches exactly once with the bound context", async () => {
  let calls = 0;
  let seenCtx = null;
  const r = await run({ execute: async (ctx, userId) => { calls++; seenCtx = { ctx, userId }; return { ok: true, output: { receipt: "ok" } }; } });
  assert.equal(r.outcome, "succeeded");
  assert.equal(r.retryable, false);
  assert.equal(calls, 1, "one approved execution = one dispatch, no loop");
  assert.equal(seenCtx.ctx.action, "request_qa_run");
  assert.equal(seenCtx.userId, "user-1");
  assert.deepEqual(r.output, { receipt: "ok" });
  assert.ok(typeof r.durationMs === "number");
});

test("timeout is retryable; slow executor result discarded", async () => {
  let finished = false;
  const r = await runAttempt({
    job: job({ envelope: { ...job().envelope, budget: { maxAttempts: 3, attemptTimeoutMs: 50, maxOutputChars: 4000 } } }),
    workerId: "w1", userId: "u", rows: rows(), nowIso: NOW,
    execute: async () => { await new Promise((res) => setTimeout(res, 5000)); finished = true; return { ok: true, output: {} }; },
  });
  assert.equal(r.outcome, "timeout");
  assert.equal(r.retryable, true);
  assert.equal(finished, false, "returned before the slow executor finished");
});

test("tool failure carries the executor retryable flag; throws are retryable", async () => {
  const retryable = await run({ execute: async () => ({ ok: false, error: "502 upstream", retryable: true }) });
  assert.equal(retryable.outcome, "tool-failed");
  assert.equal(retryable.retryable, true);
  assert.equal(retryable.error, "502 upstream");
  const permanent = await run({ execute: async () => ({ ok: false, error: "invalid args", retryable: false }) });
  assert.equal(permanent.outcome, "tool-failed");
  assert.equal(permanent.retryable, false);
  const thrown = await run({ execute: async () => { throw new Error("ECONNRESET boom"); } });
  assert.equal(thrown.outcome, "error");
  assert.equal(thrown.retryable, true);
});

test("binding failure and expired lease block dispatch entirely", async () => {
  let calls = 0;
  const spy = async () => { calls++; return { ok: true, output: {} }; };
  const badApproval = await run({ rows: rows({ approval: null }), execute: spy });
  assert.equal(badApproval.outcome, "binding-failed");
  assert.equal(badApproval.retryable, false, "binding failures never retry");
  assert.ok(badApproval.error);
  const stale = await run({
    job: job({ leaseExpiresAt: "2026-09-29T09:00:00Z" }), execute: spy,
  });
  assert.equal(stale.outcome, "lease-expired");
  assert.equal(stale.retryable, false);
  assert.equal(calls, 0, "no dispatch without live lease + binding");
});

test("output truncated to budget; unserializable degrades honestly", async () => {
  const big = await run({ execute: async () => ({ ok: true, output: { blob: "x".repeat(9000) } }) });
  assert.equal(big.outcome, "succeeded");
  assert.ok(JSON.stringify(big.output).length <= 4020, "capped near budget");
  assert.ok(JSON.stringify(big.output).includes("truncated"), "marker present");
  const circ = {};
  circ.self = circ;
  const weird = await run({ execute: async () => ({ ok: true, output: circ }) });
  assert.equal(weird.output, "[unserializable output]");
});
