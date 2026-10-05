/**
 * Stage 15 (pass one) — security hardening invariant tests (repository-evidence only).
 *
 * Covers, hermetically (source-text evidence, no imports, no network, no DB):
 *  (a) migration 151 narrows SELECT only — no write policies, admin predicate
 *      present, old policies dropped, rollback restores, mirror identical,
 *      order entry present;
 *  (b) rate-limit wiring for decideWorkforceApproval + createMemoryDirect;
 *  (c) worker-401 logging shape (fixed message, no token material, throttled,
 *      fail-open) on all six worker/QA routes;
 *  (d) getToolGate catch fails closed;
 *  (e) QA poll-token PREV rotation matches the exec construction.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const MIGRATION = path.join(ROOT, "db", "migration_151_workforce_rls_narrowing.sql");
const ROLLBACK = path.join(ROOT, "db", "migration_151_workforce_rls_narrowing_rollback.sql");
const MIRROR = path.join(
  ROOT, "supabase", "migrations",
  "20261005000000_migration_151_workforce_rls_narrowing.sql"
);
const ORDER = path.join(ROOT, "db", "staging-migration-order.txt");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

const OLD_POLICIES = [
  "Authenticated can read agents",
  "Authenticated can read agent versions",
  "Authenticated can read agent tools",
  "Authenticated can read tool definitions",
  "Authenticated can read agent tasks",
  "Authenticated can read approvals",
  "Authenticated can read agent runs",
  "Authenticated can read agent reports",
  "Authenticated can read agent steps",
  "Authenticated can read knowledge versions",
  "Authenticated can read chunks",
  "Authenticated can read qa runs",
  "Authenticated can read qa test results",
];

// ── (a) migration 151 static invariants ─────────────────────────────────────

test("migration 151 creates SELECT policies only — no write policies", () => {
  const sql = read(MIGRATION);
  assert.ok(sql.includes("BEGIN;") && sql.includes("COMMIT;"), "must be transactional");
  for (const kind of ["FOR INSERT", "FOR UPDATE", "FOR DELETE", "FOR ALL"]) {
    assert.ok(!sql.includes(kind), `migration must not contain ${kind}`);
  }
  // The only GRANT/REVOKE is the qa_runs column lockdown (S-14).
  assert.ok(sql.includes("REVOKE SELECT ON qa_runs FROM anon, authenticated"), "qa_runs table grant must be revoked");
  const grantAt = sql.indexOf("GRANT SELECT (");
  assert.ok(grantAt !== -1, "qa_runs per-column grant must exist");
  const grantBlock = sql.slice(grantAt, sql.indexOf(") ON qa_runs", grantAt));
  for (const secret of ["claim_token_hash", "claim_expires_at", "idempotency_key", "metadata"]) {
    assert.ok(!grantBlock.includes(secret), `secret column ${secret} must not be granted`);
  }
  assert.ok(!sql.includes("CREATE TABLE"), "no new tables");
});

test("migration 151 drops every broad policy it replaces", () => {
  const sql = read(MIGRATION);
  for (const name of OLD_POLICIES) {
    assert.ok(
      sql.includes(`DROP POLICY IF EXISTS "${name}"`),
      `must drop replaced policy "${name}"`
    );
  }
});

test("migration 151 new policies carry the admin predicate", () => {
  const sql = read(MIGRATION);
  const creates = [...sql.matchAll(/CREATE POLICY "([^"]+)"\s+ON (\w+) FOR SELECT/g)];
  assert.equal(creates.length, 13, `expected 13 new policies, saw ${creates.length}`);
  const adminPred = "profiles.role = 'admin' AND profiles.status = 'active'";
  const adminCount = sql.split(adminPred).length - 1;
  assert.ok(adminCount >= 13, `admin predicate must appear in every new policy (saw ${adminCount})`);
  assert.ok(sql.includes("is_entity_member("), "member predicate must follow the 143 pattern");
  assert.ok(sql.includes("agent_runs r"), "steps must scope via parent agent_runs");
  assert.ok(sql.includes("qa_runs q"), "qa results must scope via parent qa_runs");
  assert.ok(sql.includes("knowledge_documents d"), "versions/chunks must scope via parent document");
  assert.ok(sql.includes("d.status = 'approved'"), "non-admin chunk/version reads require approved parent");
});

test("rollback restores the exact prior policies and grants", () => {
  const rb = read(ROLLBACK);
  assert.ok(rb.includes("BEGIN;") && rb.includes("COMMIT;"), "rollback must be transactional");
  for (const name of OLD_POLICIES) {
    assert.ok(
      rb.includes(`CREATE POLICY "${name}"`),
      `rollback must restore "${name}"`
    );
  }
  assert.ok(rb.includes("GRANT SELECT ON qa_runs TO anon, authenticated"), "rollback must restore full-column grant");
});

test("mirror is identical and order entry is present", () => {
  assert.equal(read(MIRROR), read(MIGRATION), "supabase mirror must be byte-identical");
  const lines = read(ORDER).trim().split("\n");
  assert.equal(lines[lines.length - 1], "migration_152_studio_chat_persistence.sql", "order file must append latest last (152 after 151)");
  assert.ok(!read(ORDER).includes("_rollback"), "order file must exclude rollbacks");
});

// ── (b) rate-limit wiring ───────────────────────────────────────────────────

test("new buckets declared with generous per-user limits", () => {
  const rl = read(path.join(ROOT, "lib", "rate-limit.ts"));
  assert.ok(rl.includes("decideWorkforceApproval: { limit: 30, windowSeconds: 60 }"), "decide bucket 30/60s");
  assert.ok(rl.includes("createMemoryDirect: { limit: 30, windowSeconds: 60 }"), "memory bucket 30/60s");
  assert.ok(rl.includes("authDenialLog: { limit: 1, windowSeconds: 60 }"), "denial-log throttle 1/60s");
});

test("decide action throttles per admin with existing notice style", () => {
  const src = read(path.join(ROOT, "lib", "actions", "workforce-approvals.ts"));
  assert.ok(src.includes('checkRateLimit("decideWorkforceApproval", `user:${user.id}`)'), "per-user check before work");
  assert.ok(src.includes('notice = "rate-limited"'), "rate-limited notice slug");
  assert.ok(src.includes("?decided=${notice}"), "existing redirect style preserved");
  const checkAt = src.indexOf('checkRateLimit("decideWorkforceApproval"');
  const decideAt = src.indexOf("decideApproval(admin");
  assert.ok(checkAt !== -1 && decideAt !== -1 && checkAt < decideAt, "throttle must precede the decide write");
});

test("memory direct-create throttles per admin with existing notice style", () => {
  const src = read(path.join(ROOT, "lib", "actions", "workforce-memory.ts"));
  assert.ok(src.includes('checkRateLimit("createMemoryDirect", `user:${user.id}`)'), "per-user check before work");
  assert.ok(src.includes('"rate-limited"'), "rate-limited notice slug");
  assert.ok(src.includes("?created=${notice}") || src.includes("?created=${notice}"), "existing redirect style preserved");
});

// ── (c) worker-401 logging ──────────────────────────────────────────────────

const DENIAL_ROUTES = [
  ["app/api/exec/claim/route.ts", "POST /api/exec/claim", "worker_unauthorized"],
  ["app/api/exec/heartbeat/route.ts", "POST /api/exec/heartbeat", "worker_unauthorized"],
  ["app/api/exec/run/route.ts", "POST /api/exec/run", "worker_unauthorized"],
  ["app/api/exec/ingest/route.ts", "POST /api/exec/ingest", "claim_token_rejected"],
  ["app/api/qa/poll/route.ts", "GET /api/qa/poll", "worker_unauthorized"],
  ["app/api/qa/ingest/route.ts", "POST /api/qa/ingest", "claim_token_rejected"],
];

test("all six worker/QA routes log denials with fixed labels, responses unchanged", () => {
  for (const [rel, label, code] of DENIAL_ROUTES) {
    const src = read(path.join(ROOT, rel));
    assert.ok(
      src.includes(`logThrottledAuthDenial(req, '${label}', '${code}')`),
      `${rel} must log with fixed label+code`
    );
  }
  // Response bodies unchanged: bearer-gated routes still 401 Unauthorized;
  // exec ingest has no 401 path by design (token failures are 422 reasons).
  for (const rel of [
    "app/api/exec/claim/route.ts",
    "app/api/exec/heartbeat/route.ts",
    "app/api/exec/run/route.ts",
    "app/api/qa/poll/route.ts",
    "app/api/qa/ingest/route.ts",
  ]) {
    const src = read(path.join(ROOT, rel));
    assert.ok(src.includes("error: 'Unauthorized'"), `${rel} must keep the generic 401 body`);
  }
  const ingest = read(path.join(ROOT, "app/api/exec/ingest/route.ts"));
  assert.ok(ingest.includes("return NextResponse.json({ error: out.reason }, { status: 422 })"), "exec ingest keeps its 422 reason shape");
});

test("denial helper: auth_failure kind, fixed message, throttled, fail-open, no secrets", () => {
  const src = read(path.join(ROOT, "lib", "observability", "system-events.ts"));
  const at = src.indexOf("logThrottledAuthDenial");
  assert.ok(at !== -1, "helper must exist");
  const body = src.slice(at, at + 1400);
  assert.ok(body.includes("kind: 'auth_failure'"), "must use the existing auth_failure kind");
  assert.ok(body.includes("message: 'Worker authentication failed'"), "message must be a fixed literal");
  assert.ok(!body.match(/message: `[^`]*\$\{/), "message must not interpolate anything");
  assert.ok(body.includes("checkRateLimit('authDenialLog'"), "must throttle via the rate-limit primitive");
  assert.ok(body.includes("catch {"), "must be fail-open");
  for (const banned of ["authorization", "claimToken", "claim_token", "headers.get", "secret", "Bearer"]) {
    assert.ok(!body.includes(banned), `helper must not touch ${banned}`);
  }
});

// ── (d) getToolGate fail-closed ─────────────────────────────────────────────

test("getToolGate catch fails closed as approval-required", () => {
  const src = read(path.join(ROOT, "lib", "ai", "orchestrator.ts"));
  const at = src.indexOf("async function getToolGate");
  assert.ok(at !== -1, "getToolGate must exist");
  const fn = src.slice(at, src.indexOf("\n}\n", at));
  const catchAt = fn.indexOf("} catch {");
  assert.ok(catchAt !== -1, "catch fallback must exist");
  const catchClose = fn.indexOf("\n  }", catchAt);
  assert.ok(catchClose !== -1, "catch block must terminate");
  const catchBlock = fn.slice(catchAt, catchClose);
  assert.ok(catchBlock.includes("approvalRequired: true"), "catch fallback must require approval");
  assert.ok(!catchBlock.includes("approvalRequired: false"), "catch must not fail open");
});

// ── (e) QA poll-token rotation ──────────────────────────────────────────────

test("QA poll auth accepts PREV with constant-time fail-closed behavior", () => {
  const src = read(path.join(ROOT, "lib", "qa", "tokens.ts"));
  assert.ok(src.includes("prevSecret: string | undefined | null = null"), "must accept a PREV secret");
  assert.ok(src.includes("for (const s of [secret, prevSecret])"), "must try both secrets like exec");
  assert.ok(src.includes("timingSafeEqual"), "must stay constant-time");
  const route = read(path.join(ROOT, "app", "api", "qa", "poll", "route.ts"));
  assert.ok(
    route.includes("isAuthorizedPollRequest(header, secret, prev)"),
    "poll route must pass QA_INGEST_TOKEN_PREV"
  );
});
