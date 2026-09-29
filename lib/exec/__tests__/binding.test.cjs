/**
 * Stage 10.3 hermetic tests: six-way authorization binding.
 *
 * No database, no network. Covers: happy-path bind (required + optional
 * approval), and every mismatch — stale/expired/revoked/missing approval,
 * changed tenant/agent/action/args, unknown tool, approval-required tool
 * without approval, approval-action drift, envelope-vs-outcome drift.
 * All binding failures are permanent (never retryable) by contract.
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

const { checkBinding } = require("../binding");
const { mintExecutionEnvelope } = require("../envelope");

const NOW = "2026-09-29T10:00:00Z";
const AGENT = "11111111-1111-1111-1111-111111111111";
const TENANT = "22222222-2222-2222-2222-222222222222";
const APPROVAL = "55555555-5555-5555-5555-555555555555";
const KEY = "44444444-4444-4444-4444-444444444444";
const ARGS = { suite: "smoke", environment: "staging", idempotencyKey: KEY };

function base() {
  const m = mintExecutionEnvelope({
    rawArgs: JSON.stringify(ARGS), tenantId: TENANT, agentId: AGENT, agentName: "qa",
    taskId: null, runId: null, action: "request_qa_run",
  });
  assert.equal(m.ok, true);
  const envelope = { ...m.envelope, approvalId: APPROVAL };
  return {
    envelope,
    job: { id: "job-1", tenant_id: TENANT, agent_id: AGENT, approval_id: APPROVAL, attempt_no: 1 },
    approval: {
      id: APPROVAL, action: "request_qa_run", risk: "medium", status: "approved",
      expires_at: "2026-09-30T00:00:00Z", tenant_id: TENANT, proposed_outcome: envelope,
    },
    agent: { id: AGENT, name: "qa", autonomy_level: "L0", status: "active" },
    toolDef: { name: "request_qa_run", scope: "transactional", risk: "medium", approval_required: true },
    nowIso: NOW,
  };
}

test("happy path: required approval binds all six identities", () => {
  const r = checkBinding(base());
  assert.equal(r.ok, true);
  assert.equal(r.context.tenantId, TENANT);
  assert.equal(r.context.action, "request_qa_run");
  assert.equal(r.context.approvalId, APPROVAL);
  assert.equal(r.context.jobId, "job-1");
  assert.equal(r.context.attemptNo, 1);
});

test("low-risk tool without approval binds (approval optional)", () => {
  const input = base();
  input.toolDef = { name: "getEvent", scope: "tenant_scoped", risk: "low", approval_required: false };
  input.envelope = { ...input.envelope, action: "getEvent", args: { id: "x" }, argsCanonical: '{"id":"x"}' };
  input.job = { ...input.job, approval_id: null };
  input.approval = null;
  const r = checkBinding(input);
  assert.equal(r.ok, true);
  assert.equal(r.context.approvalId, null);
});

test("stale / revoked / missing / expired approvals never execute", () => {
  for (const [label, mutate] of [
    ["rejected", (a) => ({ ...a, status: "rejected" })],
    ["expired", (a) => ({ ...a, status: "expired" })],
    ["pending", (a) => ({ ...a, status: "pending" })],
    ["time-expired", (a) => ({ ...a, expires_at: "2026-09-28T00:00:00Z" })],
    ["wrong-row", (a) => ({ ...a, id: "99999999-9999-9999-9999-999999999999" })],
  ]) {
    const input = base();
    input.approval = mutate(input.approval);
    const r = checkBinding(input);
    assert.equal(r.ok, false, label);
  }
  const missing = base();
  missing.approval = null;
  assert.equal(checkBinding(missing).ok, false, "missing approval row");
});

test("approval-required tool without any approval never executes", () => {
  const input = base();
  input.job = { ...input.job, approval_id: null };
  input.approval = null;
  assert.equal(checkBinding(input).ok, false);
});

test("changed tenant / agent / action rejected (no reusable token)", () => {
  const t = base();
  t.job = { ...t.job, tenant_id: null };
  assert.equal(checkBinding(t).ok, false, "job tenant drift");

  const t2 = base();
  t2.approval = { ...t2.approval, tenant_id: null };
  assert.equal(checkBinding(t2).ok, false, "approval tenant drift");

  const a = base();
  a.agent = { ...a.agent, id: TENANT };
  assert.equal(checkBinding(a).ok, false, "agent drift");

  const n = base();
  n.agent = { ...n.agent, name: "sentinel" };
  assert.equal(checkBinding(n).ok, false, "agent name drift");

  const x = base();
  x.toolDef = { ...x.toolDef, name: "notifyOwner" };
  assert.equal(checkBinding(x).ok, false, "action/registry drift");

  const xa = base();
  xa.approval = { ...xa.approval, action: "notifyOwner" };
  assert.equal(checkBinding(xa).ok, false, "approval action drift");
});

test("changed arguments rejected, including approval-time drift", () => {
  const input = base();
  const tampered = { ...input.envelope, args: { suite: "auth" } };
  assert.equal(checkBinding({ ...input, envelope: tampered }).ok, false, "canonical mismatch");

  const drifted = base();
  drifted.approval = {
    ...drifted.approval,
    proposed_outcome: { ...drifted.envelope, argsCanonical: '{"suite":"auth"}' },
  };
  assert.equal(checkBinding(drifted).ok, false, "approved X, execute Y impossible");
});

test("unknown / inactive / mismatched tool and agent rejected", () => {
  const u = base();
  u.toolDef = null;
  assert.equal(checkBinding(u).ok, false, "unknown tool");

  const i = base();
  i.agent = null;
  assert.equal(checkBinding(i).ok, false, "missing agent");

  const d = base();
  d.agent = { ...d.agent, status: "disabled" };
  assert.equal(checkBinding(d).ok, false, "inactive agent");
});
