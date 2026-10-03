/**
 * Stage 10.8 hermetic tests: /api/exec/* route security posture.
 *
 * No database, no network. Static source scans (sentinel-events precedent).
 * Covers: execClaim rate limit on all four routes; Layer-1 worker auth
 * (fail-closed, 401) on claim/heartbeat/run and its ABSENCE on ingest
 * (claim-token-only); generic 500 messages (no raw echoes); no arbitrary
 * action execution (request bodies never name a tool; only the run route
 * dispatches, via bound context through dispatchApprovedTool); service-role
 * confined to routes; no client-side secrets.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

const ROUTES = [
  "app/api/exec/claim/route.ts",
  "app/api/exec/heartbeat/route.ts",
  "app/api/exec/ingest/route.ts",
  "app/api/exec/run/route.ts",
];

test("all exec routes exist and are rate-limited", () => {
  for (const rel of ROUTES) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} exists`);
    const src = read(rel);
    assert.ok(src.includes("enforceRateLimit('execClaim'"), `${rel} rate-limited (execClaim bucket)`);
  }
});

test("Layer-1 worker auth on claim/heartbeat/run; ingest is claim-token-only", () => {
  for (const rel of [
    "app/api/exec/claim/route.ts",
    "app/api/exec/heartbeat/route.ts",
    "app/api/exec/run/route.ts",
  ]) {
    const src = read(rel);
    assert.ok(src.includes("isAuthorizedWorkerRequest"), `${rel} checks Layer-1`);
    assert.ok(src.includes("EXEC_WORKER_TOKEN"), `${rel} reads worker secret`);
    assert.ok(src.includes("status: 401"), `${rel} rejects with 401`);
  }
  const ingest = read("app/api/exec/ingest/route.ts");
  assert.ok(!ingest.includes("isAuthorizedWorkerRequest"), "ingest never accepts Layer-1 (claim token only)");
  assert.ok(!ingest.includes("EXEC_WORKER_TOKEN"), "ingest never reads the worker secret");
  assert.ok(ingest.includes("claimToken"), "ingest authenticates per-claim token");
});

test("generic error responses (no raw echoes, no oracle details)", () => {
  for (const rel of ROUTES) {
    const src = read(rel);
    assert.ok(!/NextResponse\.json\(\{\s*error:\s*msg/.test(src), `${rel} no raw msg echo`);
    assert.ok(!/error:\s*err\.message/.test(src), `${rel} no err.message echo`);
    assert.ok(!/error:\s*String\(err\)/.test(src), `${rel} no String(err) echo`);
    assert.ok(src.includes("console.error"), `${rel} logs server-side`);
  }
});

test("no arbitrary tool execution endpoint", () => {
  for (const rel of ROUTES) {
    const src = read(rel);
    assert.ok(!/body\[.action.\]/.test(src) && !/body\.action/.test(src), `${rel} never reads an action from the request`);
    assert.ok(!/body\[.tool.\]/.test(src) && !/body\.tool\b/.test(src), `${rel} never reads a tool from the request`);
    assert.ok(!src.includes("executeTenantTool") && !src.includes("executeAITool"), `${rel} never dispatches tools directly`);
    assert.ok(!src.includes("tools-registry"), `${rel} never imports the tool registry`);
  }
  const run = read("app/api/exec/run/route.ts");
  assert.ok(run.includes("claimExecution"), "run claims first");
  assert.ok(run.includes("runAttempt"), "run executes through the budgeted runner");
  assert.ok(run.includes("dispatchApprovedTool"), "run dispatches only the bound context");
  assert.ok(run.includes("ingestAttemptResult"), "run ingests through forward-only ingest");
});

test("service-role confined to routes; no client-side secrets", () => {
  for (const rel of ROUTES) {
    const src = read(rel);
    assert.ok(src.includes("createSupabaseAdmin"), `${rel} uses service-role server-side (expected)`);
    assert.ok(!src.includes("NEXT_PUBLIC_"), `${rel} no client-exposed env`);
  }
  for (const mod of [
    "lib/exec/envelope.ts", "lib/exec/claim.ts", "lib/exec/binding.ts",
    "lib/exec/runner.ts", "lib/exec/recovery.ts", "lib/exec/ingest.ts",
    "lib/exec/materialize.ts", "lib/exec/emit.ts",
  ]) {
    const src = read(mod);
    assert.ok(!src.includes("createSupabaseAdmin"), `${mod} takes injected client (no service-role import)`);
    assert.ok(!src.includes("process.env.EXEC_WORKER_TOKEN"), `${mod} never reads worker secrets`);
  }
});
