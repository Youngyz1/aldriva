/**
 * Stage 10.0 hermetic tests: canonical execution envelope.
 *
 * No database, no network. Covers: valid envelope, invalid envelope, missing
 * tenant (null = platform job, wrong type = invalid), missing agent,
 * missing approval (null at mint), missing action, malformed arguments,
 * argument canonicalization (key order irrelevant, byte-stable), schema/version
 * mismatch, tampered execution identity, changed arguments/tenant/agent
 * (binding rejects every drift).
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

const { mintExecutionEnvelope, parseExecutionEnvelope, verifyEnvelopeBinding, canonicalizeArgs, EXEC_ENVELOPE_VERSION, EXEC_DEFAULT_BUDGET } = require("../envelope");

const AGENT = "11111111-1111-1111-1111-111111111111";
const TENANT = "22222222-2222-2222-2222-222222222222";
const TASK = "33333333-3333-3333-3333-333333333333";
const KEY = "44444444-4444-4444-4444-444444444444";

function mint(over = {}) {
  return mintExecutionEnvelope({
    rawArgs: JSON.stringify({ suite: "smoke", environment: "staging", idempotencyKey: KEY }),
    tenantId: TENANT, agentId: AGENT, agentName: "qa", taskId: TASK, runId: null,
    action: "request_qa_run", ...over,
  });
}

test("valid envelope carries all identities + version + budget", () => {
  const r = mint();
  assert.equal(r.ok, true);
  const e = r.envelope;
  assert.equal(e.version, EXEC_ENVELOPE_VERSION);
  assert.equal(e.tenantId, TENANT);
  assert.equal(e.agentId, AGENT);
  assert.equal(e.agentName, "qa");
  assert.equal(e.approvalId, null, "null at mint; populated on materialization");
  assert.equal(e.taskId, TASK);
  assert.equal(e.action, "request_qa_run");
  assert.deepEqual(e.budget, EXEC_DEFAULT_BUDGET);
  assert.ok(!Number.isNaN(Date.parse(e.createdAt)));
  assert.ok(isUuidLike(e.idempotencyKey), "minted when not supplied");
});

function isUuidLike(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

test("missing tenant (null) = platform job, valid; wrong type invalid", () => {
  const platform = mint({ tenantId: null });
  assert.equal(platform.ok, true);
  assert.equal(platform.envelope.tenantId, null);
  assert.equal(mint({ tenantId: 42 }).ok, false);
  assert.equal(mint({ tenantId: "not-a-uuid" }).ok, false);
});

test("idempotency continuity: valid caller key adopted, else minted", () => {
  const adopted = mint();
  assert.equal(adopted.envelope.idempotencyKey, KEY, "QA tool key preserved for dedupe continuity");
  const fresh = mintExecutionEnvelope({
    rawArgs: JSON.stringify({ ping: true }),
    tenantId: null, agentId: AGENT, agentName: "qa", taskId: null, runId: null, action: "request_qa_run",
  });
  assert.equal(fresh.ok, true);
  assert.ok(isUuidLike(fresh.envelope.idempotencyKey), "minted when args carry no key");
  assert.notEqual(fresh.envelope.idempotencyKey, mintExecutionEnvelope({
    rawArgs: JSON.stringify({ ping: true }),
    tenantId: null, agentId: AGENT, agentName: "qa", taskId: null, runId: null, action: "request_qa_run",
  }).envelope.idempotencyKey, "fresh keys unique per mint");
});

test("missing agent / approval / action rejected (approval null allowed)", () => {
  assert.equal(mint({ agentId: "bad" }).ok, false);
  assert.equal(mint({ agentId: "" }).ok, false);
  assert.equal(mint({ agentName: "" }).ok, false);
  assert.equal(mint({ action: "" }).ok, false);
  assert.equal(mint({ action: "evil tool!" }).ok, false);
  assert.equal(mint({ action: "x".repeat(200) }).ok, false);
});

test("malformed arguments fail closed (never partial envelopes)", () => {
  assert.deepEqual(mint({ rawArgs: "{truncated" }).ok, false);
  assert.deepEqual(mint({ rawArgs: "" }).ok, false);
  assert.deepEqual(mint({ rawArgs: null }).ok, false);
  assert.deepEqual(mint({ rawArgs: "[1,2]" }).ok, false, "arrays are not arg objects");
  assert.deepEqual(mint({ rawArgs: '"str"' }).ok, false);
  assert.deepEqual(mint({ rawArgs: JSON.stringify({ a: 1 }), idempotencyKey: "bad" }).ok, false);
});

test("argument canonicalization: key order irrelevant, byte-stable", () => {
  const a = canonicalizeArgs({ z: 1, a: { d: 4, c: 3 }, m: [3, 2] });
  const b = canonicalizeArgs({ m: [3, 2], a: { c: 3, d: 4 }, z: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"c":3,"d":4},"m":[3,2],"z":1}');
  assert.equal(canonicalizeArgs("str"), null);
  assert.equal(canonicalizeArgs(42), null);
  assert.equal(canonicalizeArgs(null), null);
});

test("parse validates stored envelopes; version mismatch rejected, never reinterpreted", () => {
  const good = mint();
  assert.equal(parseExecutionEnvelope(good.envelope).ok, true);
  assert.equal(parseExecutionEnvelope({ ...good.envelope, version: 999 }).ok, false);
  assert.equal(parseExecutionEnvelope({ ...good.envelope, version: "1" }).ok, false);
  assert.equal(parseExecutionEnvelope(null).ok, false);
  assert.equal(parseExecutionEnvelope("str").ok, false);
  assert.equal(parseExecutionEnvelope([]).ok, false);
});

test("tampered execution identity rejected", () => {
  const good = mint().envelope;
  assert.equal(parseExecutionEnvelope({ ...good, idempotencyKey: "bad" }).ok, false);
  assert.equal(parseExecutionEnvelope({ ...good, agentId: TENANT }).ok, true, "wrong-but-valid UUID parses (binding catches it below)");
  const withApproval = { ...good, approvalId: "55555555-5555-5555-5555-555555555555" };
  assert.equal(parseExecutionEnvelope(withApproval).ok, true);
  assert.equal(parseExecutionEnvelope({ ...good, approvalId: "bad" }).ok, false);
  // args/argsCanonical must agree — spliced canonical form rejected
  assert.equal(parseExecutionEnvelope({ ...good, argsCanonical: '{"x":1}' }).ok, false);
  assert.equal(parseExecutionEnvelope({ ...good, args: { x: 1 } }).ok, false);
  assert.equal(parseExecutionEnvelope({ ...good, budget: { maxAttempts: 99, attemptTimeoutMs: 1, maxOutputChars: 1 } }).ok, false);
  assert.equal(parseExecutionEnvelope({ ...good, budget: null }).ok, false);
});

test("binding rejects every drift: args, tenant, agent, action, approval", () => {
  const e = { ...mint().envelope, approvalId: "55555555-5555-5555-5555-555555555555" };
  const live = {
    tenantId: e.tenantId, agentId: e.agentId, agentName: e.agentName,
    action: e.action, argsCanonical: e.argsCanonical, approvalId: e.approvalId,
  };
  assert.deepEqual(verifyEnvelopeBinding(e, live), { ok: true });
  assert.equal(verifyEnvelopeBinding(e, { ...live, argsCanonical: '{"suite":"auth"}' }).ok, false);
  assert.equal(verifyEnvelopeBinding(e, { ...live, tenantId: null }).ok, false);
  assert.equal(verifyEnvelopeBinding(e, { ...live, tenantId: "66666666-6666-6666-6666-666666666666" }).ok, false);
  assert.equal(verifyEnvelopeBinding(e, { ...live, agentId: TENANT }).ok, false);
  assert.equal(verifyEnvelopeBinding(e, { ...live, agentName: "sentinel" }).ok, false);
  assert.equal(verifyEnvelopeBinding(e, { ...live, action: "notifyOwner" }).ok, false);
  assert.equal(verifyEnvelopeBinding(e, { ...live, approvalId: "77777777-7777-7777-7777-777777777777" }).ok, false);
  // Mint-time envelope (approvalId null) binds to any live approval id —
  // the job record, not the envelope, carries the link until materialized.
  const fresh = mint().envelope;
  assert.deepEqual(verifyEnvelopeBinding(fresh, { ...live, tenantId: fresh.tenantId, agentId: fresh.agentId, agentName: fresh.agentName, action: fresh.action, argsCanonical: fresh.argsCanonical, approvalId: "any" }).ok, true);
});
