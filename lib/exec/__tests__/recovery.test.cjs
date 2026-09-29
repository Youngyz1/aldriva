/**
 * Stage 10.5 hermetic tests: heartbeat + stale-lease recovery.
 *
 * No database, no network. Fake emulates conditional updates. Covers:
 * heartbeat success/renewal, wrong worker, bad token, expired lease not
 * renewable, non-running job, unknown job, reclaim requeue with deterministic
 * backoff, budget exhaustion terminal, reclaim race (exactly one winner),
 * backoff determinism + cap, duplicate reclaim safe.
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

const { heartbeatClaim, reclaimStaleLeases, computeBackoffMs } = require("../recovery");
const { mintExecClaimToken } = require("../tokens");

const NOW = "2026-09-29T10:00:00Z";
const PAST = "2026-09-29T09:00:00Z";
const FUTURE = "2026-09-29T10:15:00Z";

function makeStore() {
  return { agent_tasks: [] };
}

class FakeQuery {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.eqs = [];
    this.lteCond = null;
    this.patch = null;
    this.orderCol = null;
    this.limitN = null;
  }
  select() { return this; }
  eq(c, v) { this.eqs.push([c, v]); return this; }
  lte(c, v) { this.lteCond = [c, v]; return this; }
  order(c) { this.orderCol = c; return this; }
  limit(n) { this.limitN = n; return this; }
  update(p) { this.patch = p; return this; }
  match(r) {
    for (const [c, v] of this.eqs) if (r[c] !== v) return false;
    if (this.lteCond) {
      const [c, v] = this.lteCond;
      if (!(r[c] != null && r[c] <= v)) return false;
    }
    return true;
  }
  then(resolve) {
    const rows = this.store[this.table] || [];
    if (this.patch) {
      const hit = rows.filter((r) => this.match(r));
      for (const r of hit) Object.assign(r, this.patch);
      resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
      return Promise.resolve();
    }
    let out = rows.filter((r) => this.match(r));
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    resolve({ data: out, error: null });
    return Promise.resolve();
  }
}

function fakeClient(store) {
  return { from: (table) => new FakeQuery(store, table) };
}

function runningJob(store, over = {}) {
  const minted = mintExecClaimToken(Date.parse(NOW));
  const row = {
    id: `task-${store.agent_tasks.length + 1}`, status: "running",
    lease_owner: "owner", lease_expires_at: FUTURE, claim_token_hash: minted.hash,
    last_heartbeat_at: NOW, attempt_count: 1, max_attempts: 3,
    ...over, _token: minted.token,
  };
  store.agent_tasks.push(row);
  return row;
}

test("backoff deterministic, exponential, capped", () => {
  assert.equal(computeBackoffMs(1), 60_000);
  assert.equal(computeBackoffMs(2), 120_000);
  assert.equal(computeBackoffMs(3), 240_000);
  assert.equal(computeBackoffMs(1), computeBackoffMs(1), "deterministic");
  assert.ok(computeBackoffMs(100) <= 3_600_000, "capped");
  assert.equal(computeBackoffMs(0), 60_000, "floored to first attempt");
});

test("heartbeat renews a live lease; wrong worker/token/job rejected", async () => {
  const store = makeStore();
  const row = runningJob(store);
  const c = fakeClient(store);
  const ok = await heartbeatClaim(c, { taskId: row.id, workerId: "owner", claimToken: row._token, nowIso: NOW });
  assert.equal(ok.ok, true);
  assert.equal(ok.leaseExpiresAt, new Date(Date.parse(NOW) + 15 * 60 * 1000).toISOString(), "expiry renewed from now");
  assert.equal(store.agent_tasks[0].last_heartbeat_at, NOW);
  assert.equal(await heartbeatClaim(c, { taskId: row.id, workerId: "intruder", claimToken: row._token, nowIso: NOW }).then((r) => r.ok), false, "wrong worker");
  assert.equal((await heartbeatClaim(c, { taskId: row.id, workerId: "owner", claimToken: "wrong", nowIso: NOW })).ok, false, "bad token");
  assert.equal((await heartbeatClaim(c, { taskId: "nope", workerId: "owner", claimToken: row._token, nowIso: NOW })).ok, false, "unknown job");
  store.agent_tasks[0].status = "queued";
  assert.equal((await heartbeatClaim(c, { taskId: row.id, workerId: "owner", claimToken: row._token, nowIso: NOW })).ok, false, "non-running job");
});

test("expired lease is not renewable via heartbeat (reclaim path owns it)", async () => {
  const store = makeStore();
  const row = runningJob(store, { lease_expires_at: PAST });
  const out = await heartbeatClaim(fakeClient(store), { taskId: row.id, workerId: "owner", claimToken: row._token, nowIso: NOW });
  assert.equal(out.ok, false, "expired token fails verification");
});

test("reclaim requeues under budget with backoff; exhausts terminally at budget", async () => {
  const store = makeStore();
  const retryable = runningJob(store, { lease_expires_at: PAST, attempt_count: 1, max_attempts: 3 });
  const spent = runningJob(store, { lease_expires_at: PAST, attempt_count: 3, max_attempts: 3 });
  const live = runningJob(store, { lease_expires_at: FUTURE });
  const out = await reclaimStaleLeases(fakeClient(store), { nowIso: NOW });
  assert.deepEqual(out.requeued, [retryable.id]);
  assert.deepEqual(out.exhausted, [spent.id]);
  const rq = store.agent_tasks.find((r) => r.id === retryable.id);
  assert.equal(rq.status, "queued");
  assert.equal(rq.lease_owner, null);
  assert.equal(rq.claim_token_hash, null, "token invalidated on requeue");
  assert.equal(rq.run_after, new Date(Date.parse(NOW) + 60_000).toISOString(), "attempt-1 backoff 60s");
  const ex = store.agent_tasks.find((r) => r.id === spent.id);
  assert.equal(ex.status, "failed");
  assert.equal(ex.result_ref, "exec-retry-exhausted");
  assert.equal(store.agent_tasks.find((r) => r.id === live.id).status, "running", "live lease untouched");
});

test("reclaim race: exactly one winner per row; repeat reclaim safe", async () => {
  const store = makeStore();
  runningJob(store, { lease_expires_at: PAST, attempt_count: 1 });
  const c = fakeClient(store);
  const first = await reclaimStaleLeases(c, { nowIso: NOW });
  const second = await reclaimStaleLeases(c, { nowIso: NOW });
  assert.equal(first.requeued.length, 1);
  assert.deepEqual(second.requeued, [], "already requeued — second finds nothing stale");
  assert.deepEqual(second.exhausted, []);
});
