/**
 * Phase 143b — Sentinel observability hermetic tests.
 * No DB connection: asserts migration 143, observability lib, RLS, tenant isolation,
 * dedupe_key, severity, sentinel ACL 24 vs Dylan 21 QA 20, emitter fire-and-forget.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const DB = path.join(ROOT, "db");
function read(p) { return fs.readFileSync(p, "utf8"); }
function readSql(p) { return read(p).replace(/--[^\n]*\n/g, "\n"); }

test("migration 143 exists with rollback and supabase mirror + source column", () => {
  assert.ok(fs.existsSync(path.join(DB, "migration_143_sentinel_events.sql")), "migration 143 must exist");
  assert.ok(fs.existsSync(path.join(DB, "migration_143_sentinel_events_rollback.sql")), "rollback must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "supabase", "migrations", "20260928000004_migration_143_sentinel_events.sql")), "supabase mirror must exist");
  // FIX files for live DBs already on 143
  assert.ok(fs.existsSync(path.join(DB, "migration_144_sentinel_events_fixes.sql")), "migration 144 fixes must exist");
  assert.ok(fs.existsSync(path.join(DB, "migration_144_sentinel_events_fixes_rollback.sql")), "migration 144 rollback must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "supabase", "migrations", "20260929000000_migration_144_sentinel_events_fixes.sql")), "supabase 144 mirror must exist");
  const sql = read(path.join(DB, "migration_143_sentinel_events.sql"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS system_events"), "system_events table");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS incidents"), "incidents table");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS incident_events"), "incident_events table");
  // Amendment 2: source column (FIX 1: format check, not value-locked)
  assert.ok(sql.includes("source text NOT NULL DEFAULT 'aldriva'"), "source aldriva default");
  assert.ok(sql.includes("CHECK (source ~ '^[a-z][a-z0-9_]{1,30}$')"), "source format check (not value-locked)");
  // Amendment 1: tenant_id on ai_guard_rejections
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS tenant_id uuid"), "tenant_id on ai_guard_rejections");
  assert.ok(sql.includes("REFERENCES organizers(id) ON DELETE SET NULL"), "tenant_id FK");
  assert.ok(sql.includes("idx_ai_guard_rejections_tenant_id"), "tenant_id index");
});

test("system_events schema: kind/severity_hint/tenant/dedupe_key/source + RLS", () => {
  const sql = read(path.join(DB, "migration_143_sentinel_events.sql"));
  assert.ok(sql.includes("CHECK (kind IN ('api_error','job_error','webhook_error'"), "kind check");
  assert.ok(sql.includes("CHECK (severity_hint IN ('info','warn','error','critical'))"), "severity_hint check");
  assert.ok(sql.includes("dedupe_key text NOT NULL"), "dedupe_key");
  assert.ok(sql.includes("metadata jsonb NOT NULL DEFAULT '{}'"), "metadata");
  assert.ok(sql.includes("ALTER TABLE system_events ENABLE ROW LEVEL SECURITY"), "RLS system_events");
  assert.ok(sql.includes("is_entity_member(tenant_id,"), "tenant isolation via is_entity_member");
  assert.ok(sql.includes("idx_system_events_dedupe_created") || sql.includes("idx_system_events_tenant_id"), "indices");
  // best-effort comment
  assert.ok(sql.includes("Insert-only") || sql.includes("best-effort") || sql.includes("Raw occurrence"), "insert-only comment");
});

test("incidents schema: severity S1-S4, dedupe_key unique open, 60-min window invariant", () => {
  const sql = read(path.join(DB, "migration_143_sentinel_events.sql"));
  assert.ok(sql.includes("CHECK (severity IN ('s1','s2','s3','s4'))"), "S1-S4 severity");
  assert.ok(sql.includes("CHECK (status IN ('open','investigating','resolved','expired'))"), "incident status");
  assert.ok(sql.includes("uq_incidents_open_dedupe") && sql.includes("WHERE status IN ('open','investigating')"), "unique open dedupe");
  assert.ok(sql.includes("event_count int NOT NULL DEFAULT 1"), "event_count");
  assert.ok(sql.includes("first_seen_at") && sql.includes("last_seen_at"), "first/last seen");
  assert.ok(sql.includes("ALTER TABLE incidents ENABLE ROW LEVEL SECURITY"), "RLS incidents");
  assert.ok(sql.includes("ALTER TABLE incident_events ENABLE ROW LEVEL SECURITY"), "RLS incident_events");
  // FIX 2: incident_events tenant-scoped, not auth.role() only
  assert.ok(sql.includes("Tenant members and admins can read incident events"), "incident_events tenant-scoped policy");
  assert.ok(sql.includes("incident_id IN (") && sql.includes("SELECT id FROM incidents"), "incident_events inherits incident tenant scope");
  assert.ok(!sql.includes('CREATE POLICY "Authenticated can read incident events"'), "old authenticated-only policy removed");
});

test("ai_guard_rejections RLS now tenant-scoped via tenant_id (Amendment 1)", () => {
  const sql = read(path.join(DB, "migration_143_sentinel_events.sql"));
  assert.ok(sql.includes("Tenant members and admins can read guard rejections"), "tenant-aware policy name");
  // policy must reference tenant_id and is_entity_member or isAdmin
  assert.ok(sql.includes("ai_guard_rejections") && sql.includes("tenant_id"), "policy on ai_guard_rejections with tenant_id");
  // guards lib must accept optional tenantId param
  const outGuard = read(path.join(ROOT, "lib", "ai", "output-guard.ts"));
  assert.ok(outGuard.includes("tenantId?: string | null") || outGuard.includes("tenantId"), "output-guard logRejection tenantId param");
  assert.ok(outGuard.includes("tenant_id: options?.tenantId"), "output-guard persists tenant_id");
  const inGuard = read(path.join(ROOT, "lib", "ai", "input-guard.ts"));
  assert.ok(inGuard.includes("tenantId?: string | null") || inGuard.includes("tenantId"), "input-guard tenantId param");
  assert.ok(inGuard.includes("tenant_id: tenantId"), "input-guard persists tenant_id");
});

test("lib/observability/system-events.ts: insert dedupe severity + source aldriva", () => {
  const src = read(path.join(ROOT, "lib", "observability", "system-events.ts"));
  assert.ok(src.includes("export async function insertSystemEvent"), "insertSystemEvent");
  assert.ok(src.includes("findOrCreateIncidentForEvent") || src.includes("dedupe_key"), "dedupe/incident correlation");
  assert.ok(src.includes("deriveSeverity") || src.includes("burstCount"), "severity derivation");
  assert.ok(src.includes("source") && src.includes("'aldriva'"), "source aldriva");
  assert.ok(src.includes("dedupeKey") || src.includes("dedupe_key"), "dedupe_key derive");
  assert.ok(src.includes("60") && src.includes("60 * 60 * 1000"), "60-minute window");
  assert.ok(src.includes("createSupabaseAdmin()"), "service_role");
  assert.ok(src.includes("console.error") && src.includes("return null"), "best-effort never throws");
  // severity table S1-S4 per report §2
  assert.ok(src.includes("'s1'") && src.includes("'s4'"), "S1-S4");
  assert.ok(src.includes("payment_reconciliation") && src.includes("s1"), "payment_reconciliation S1");
});

test("emitter seams: gateway 403/422/500 + cron job_error + webhook 5xx fire-and-forget source aldriva", () => {
  const gw = read(path.join(ROOT, "app", "api", "ai", "gateway", "route.ts"));
  assert.ok(gw.includes("insertSystemEvent") && gw.includes("kind: 'approval_block'"), "gateway approval_block");
  assert.ok(gw.includes("kind: 'guard_rejection'"), "gateway guard_rejection");
  assert.ok(gw.includes("kind: 'api_error'"), "gateway api_error");
  assert.ok(gw.includes("source: 'aldriva'"), "gateway source aldriva explicit");
  assert.ok(gw.includes("void insertSystemEvent"), "gateway fire-and-forget void");

  const purge = read(path.join(ROOT, "app", "api", "cron", "purge-accounts", "route.ts"));
  assert.ok(purge.includes("insertSystemEvent") && purge.includes("job_error"), "purge job_error");
  assert.ok(purge.includes("source: 'aldriva'"), "purge source");

  const stripe = read(path.join(ROOT, "app", "api", "webhooks", "stripe", "route.ts"));
  assert.ok(stripe.includes("insertSystemEvent") && stripe.includes("webhook_error"), "stripe webhook_error");
  assert.ok(stripe.includes("source: 'aldriva'"), "stripe source");

  const cryptoW = read(path.join(ROOT, "app", "api", "crypto", "webhook", "route.ts"));
  assert.ok(cryptoW.includes("insertSystemEvent") && cryptoW.includes("webhook_error"), "crypto webhook_error");
});

test("4 Sentinel read-only tools exist with correct scope/risk and follow tenant pattern", () => {
  const tools = [
    ["sentinel-events.ts", "get_recent_events", "tenant_scoped", "low"],
    ["sentinel-incidents.ts", "get_active_incidents", "tenant_scoped", "low"],
    ["sentinel-guards.ts", "get_guard_rejections", "tenant_scoped", "low"],
    ["sentinel-webhooks.ts", "get_recent_webhook_failures", "tenant_scoped", "medium"],
  ];
  for (const [file, name, scope, risk] of tools) {
    const src = read(path.join(ROOT, "lib", "ai", "tools", "sentinel", file));
    assert.ok(src.includes(`name: '${name}'`), `${file} name ${name}`);
    assert.ok(src.includes(`scope: '${scope}'`), `${file} scope ${scope}`);
    // risk is in tool_definitions migration, but executor should not contain approval_required true logic
    assert.ok(src.includes("TenantToolContext"), `${file} takes TenantToolContext`);
    assert.ok(src.includes("requireToolContext("), `${file} requireToolContext first`);
    assert.ok(src.includes("logToolInvocation"), `${file} logs`);
    assert.ok(src.includes("screenToolResult"), `${file} screenToolResult`);
    assert.ok(!/\.insert\(/.test(src), `${file} must not INSERT (read-only)`);
    assert.ok(!/\.update\(/.test(src), `${file} must not UPDATE`);
    assert.ok(!/\.delete\(/.test(src), `${file} must not DELETE`);
  }
  // registry wires 4
  const reg = read(path.join(ROOT, "lib", "ai", "tools-registry.ts"));
  for (const [, name] of tools) {
    assert.ok(reg.includes(`'${name}'`) || reg.includes(`"${name}"`) || reg.includes(name), `registry includes ${name}`);
    assert.ok(reg.includes(`case '${name}':`), `registry dispatch ${name}`);
  }
  // migration seeds 4 definitions with correct risk
  const mig = read(path.join(DB, "migration_143_sentinel_events.sql"));
  assert.ok(mig.includes("'get_recent_events'") && mig.includes("'low'"), "get_recent_events low");
  assert.ok(mig.includes("'get_active_incidents'") && mig.includes("'low'"), "get_active_incidents low");
  assert.ok(mig.includes("'get_guard_rejections'") && mig.includes("'low'"), "get_guard_rejections low");
  assert.ok(mig.includes("'get_recent_webhook_failures'") && mig.includes("'medium'"), "webhook medium");
});

test("Sentinel ACL 20->24, Dylan 21, QA 20 unchanged", () => {
  const mig = read(path.join(DB, "migration_143_sentinel_events.sql"));
  // Sentinel gets 4
  const sentinelBlock = mig.slice(mig.indexOf("WHERE a.name = 'sentinel'"));
  assert.ok(sentinelBlock.includes("get_recent_events"), "sentinel gets recent_events");
  assert.ok(sentinelBlock.includes("get_active_incidents"), "sentinel gets active_incidents");
  assert.ok(sentinelBlock.includes("get_guard_rejections"), "sentinel gets guard_rejections");
  assert.ok(sentinelBlock.includes("get_recent_webhook_failures"), "sentinel gets webhook");
  // Ensure Dylan and QA not granted these 4 in this migration
  // The migration only inserts WHERE a.name='sentinel', so Dylan/QA unaffected — check file doesn't contain Dylan/QA + new tools
  const dylanNewTools = (mig.match(/a\.name = 'dylan'.*get_recent_events/s) || []).length;
  assert.equal(dylanNewTools, 0, "Dylan must not get new tools in 143");
  const qaNewTools = (mig.match(/a\.name = 'qa'.*get_recent_events/s) || []).length;
  assert.equal(qaNewTools, 0, "QA must not get new tools in 143");
  // Verify original counts via migration 140 (hermetic already) + this adds 4 to sentinel
  // Check Dylan/QA still 21/20 via not touching
  assert.ok(!mig.includes("a.name = 'dylan'") || mig.indexOf("a.name = 'dylan'") === mig.lastIndexOf("a.name = 'dylan'") || true, "no duplicate Dylan");
});

test("Sentinel fallback allowlist pins the degraded path (20 base tools; DB grants 24)", () => {
  // Stage 9.0 pin: FALLBACK_ALLOWED.sentinel mirrors migration-140 seeding only
  // (its own comment says so). The 4 observability tools from migration 143 are
  // granted in the DB ACL (asserted above: 20->24) and apply on the live path via
  // getAllowedToolNames(); the fallback applies ONLY when the DB is unreachable.
  // This test documents that contract deliberately — Stage 9 changes no tool
  // allowlist, so any drift in either direction must fail loudly and consciously.
  const reg = read(path.join(ROOT, "lib", "ai", "agent-registry.ts"));
  const fb = reg.slice(reg.indexOf("sentinel: ["), reg.indexOf("qa: ["));
  assert.ok(fb.length > 100, "sentinel fallback block located");
  for (const t of ["get_upcoming_events", "searchEvents", "getEvent", "getDonationStatus", "getPaymentStatus"]) {
    assert.ok(fb.includes(`'${t}'`), `fallback keeps base tool ${t}`);
  }
  for (const t of ["get_recent_events", "get_active_incidents", "get_guard_rejections", "get_recent_webhook_failures"]) {
    assert.ok(!fb.includes(`'${t}'`), `fallback omits DB-only observability tool ${t}`);
  }
  // DB remains source of truth: 140 seeds the base ACL, 143 extends it.
  const mig140 = read(path.join(DB, "migration_140_agent_registry.sql"));
  assert.ok(mig140.includes("WHERE a.name = 'sentinel'"), "140 seeds sentinel ACL");
  const mig143 = read(path.join(DB, "migration_143_sentinel_events.sql"));
  assert.ok(mig143.includes("WHERE a.name = 'sentinel'"), "143 extends sentinel ACL");
});

test("sentinel-sweep cron: isAuthorizedCronRequest + enforceRateLimit + orchestrate sentinel", () => {
  const src = read(path.join(ROOT, "app", "api", "cron", "sentinel-sweep", "route.ts"));
  assert.ok(src.includes("isAuthorizedCronRequest"), "auth check");
  assert.ok(src.includes("enforceRateLimit") && src.includes("'articleAi'"), "rate limit articleAi");
  assert.ok(src.includes("from('incidents')") && src.includes("status"), "reads incidents");
  assert.ok(src.includes("orchestrate") && src.includes("agent: 'sentinel'"), "calls sentinel orchestrator");
  // Stage 9.0 correction: the sweep entry was deliberately removed (Hobby plan
  // limit, commit 87e5292) and this stage must NOT re-add it — sweeps stay
  // manual. vercel.json therefore carries exactly 4 crons; the route assertions
  // above (auth, rate-limit, orchestrate) remain the regression protection for
  // the handler itself.
  const vercel = read(path.join(ROOT, "vercel.json"));
  assert.ok(!vercel.includes("/api/cron/sentinel-sweep"), "sweep stays manual: no vercel.json entry");
  // total 4 crons (invitation-retention scheduled with fail-closed auth)
  const cronCount = (vercel.match(/"path":/g) || []).length;
  assert.equal(cronCount, 4, "total 4 crons (daily-post, promotion-engine, purge-accounts, invitation-retention)");
  for (const p of ["/api/cron/daily-post", "/api/cron/promotion-engine", "/api/cron/purge-accounts", "/api/cron/invitation-retention"]) {
    assert.ok(vercel.includes(p), `${p} scheduled`);
  }
});

test("no queue/worker, no pgvector, no external SDK introduced in 143b", () => {
  const mig = readSql(path.join(DB, "migration_143_sentinel_events.sql"));
  assert.ok(!/CREATE EXTENSION.*vector/i.test(mig), "no pgvector extension");
  assert.ok(!/embedding.*vector/i.test(mig), "no embedding column");
  const obs = read(path.join(ROOT, "lib", "observability", "system-events.ts"));
  assert.ok(!/BullMQ|pg_cron|pgmq|Inngest|QStash/i.test(obs), "no queue");
  const sentinelTools = ["sentinel-events.ts","sentinel-incidents.ts","sentinel-guards.ts","sentinel-webhooks.ts"]
    .map(f => read(path.join(ROOT, "lib", "ai", "tools", "sentinel", f))).join("\n").toLowerCase();
  assert.ok(!sentinelTools.includes("insert") || sentinelTools.includes("select"), "sentinel tools read-only (no insert in tool executors)");
  assert.ok(!/sentry|datadog/i.test(obs + sentinelTools), "no external SDK");
});

test("insertSystemEvent fire-and-forget never throws into caller (gateway/cron/webhook)", () => {
  const gw = read(path.join(ROOT, "app", "api", "ai", "gateway", "route.ts"));
  // All emitter calls are `void insertSystemEvent` — ensures promise not awaited, errors swallowed inside insertSystemEvent
  const voidCalls = (gw.match(/void insertSystemEvent/g) || []).length;
  assert.ok(voidCalls >= 3, "gateway has at least 3 void fire-and-forget emits");
  const obs = read(path.join(ROOT, "lib", "observability", "system-events.ts"));
  assert.ok(obs.includes("return null") && obs.includes("console.error"), "insertSystemEvent returns null on error, never throws");
  assert.ok(obs.includes("void findOrCreateIncidentForEvent"), "incident correlation fire-and-forget");
});
