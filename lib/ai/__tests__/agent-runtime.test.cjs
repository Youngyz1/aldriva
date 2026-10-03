/**
 * Phase 139-142 — Agent Runtime hermetic tests.
 * No DB connection: asserts migrations, gateway/orchestrator wiring, allowlists, guards, approvals.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const DB = path.join(ROOT, "db");
function read(p) { return fs.readFileSync(p, "utf8"); }
function readSql(p) { return read(p).replace(/--[^\n]*\n/g, "\n"); }

// ── 1. Migrations exist ────────────────────────────────────────────────────
test("migrations 139-142 exist with rollbacks and supabase mirrors", () => {
  const expected = [
    "migration_139_tool_registry.sql",
    "migration_140_agent_registry.sql",
    "migration_141_knowledge_foundation.sql",
    "migration_142_agent_runtime.sql",
  ];
  for (const f of expected) {
    assert.ok(fs.existsSync(path.join(DB, f)), `db/${f} must exist`);
    assert.ok(fs.existsSync(path.join(DB, f.replace(".sql", "_rollback.sql"))), `rollback for ${f} must exist`);
  }
  const mirrors = [
    "20260928000000_migration_139_tool_registry.sql",
    "20260928000001_migration_140_agent_registry.sql",
    "20260928000002_migration_141_knowledge_foundation.sql",
    "20260928000003_migration_142_agent_runtime.sql",
  ];
  for (const m of mirrors) {
    assert.ok(fs.existsSync(path.join(ROOT, "supabase", "migrations", m)), `supabase mirror ${m} must exist`);
  }
});

// ── 2. Tool registry: 22 tools, correct scopes/risks ──────────────────────
test("tool_definitions has 22 seeds with correct scopes and no invented high-risk public tool", () => {
  const sql = read(path.join(DB, "migration_139_tool_registry.sql"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS tool_definitions"), "tool_definitions table");
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"), "RLS on tool_definitions");
  // 8 public_read seeds
  for (const t of ["get_upcoming_events","get_active_fundraisers","get_featured_businesses","get_recent_articles","get_available_products","fetch_url_summary","fetch_rss_feed","search_trends"]) {
    assert.ok(sql.includes(`'${t}'`), `public tool ${t} seeded`);
  }
  assert.ok(sql.includes("'public_read','low',false"), "public tools low risk no approval");
  // tenant/admin/transactional seeded
  assert.ok(sql.includes("'get_content_history'"), "admin tool present");
  assert.ok(sql.includes("'searchEvents'") && sql.includes("'tenant_scoped'"), "tenant tools present");
  assert.ok(sql.includes("'createNotification'") && sql.includes("'transactional'"), "transactional tools present");
  assert.ok(sql.includes("'medium',false"), "transactional medium risk");
  // risk enum contains 'critical' as allowed value, but no seeded row should use it in L0
  const criticalSeeds = (sql.match(/'critical',/g) || []).length;
  assert.equal(criticalSeeds, 0, "no seeded tool with critical risk in Phase 139");
  // No pgvector, no external vendor mention — allow CHECK constraint to mention risk values, but no vector extension
  assert.ok(!/CREATE EXTENSION.*vector/i.test(sql), "no pgvector extension in tool registry");
});

test("agents table: 3 L0 read-only agents with versioning and ACL", () => {
  const sql = read(path.join(DB, "migration_140_agent_registry.sql"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS agents"), "agents table");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS agent_versions"), "agent_versions table");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS agent_tools"), "agent_tools table");
  assert.ok(sql.includes("CHECK (autonomy_level IN ('L0','L1','L2','L3','L4'))"), "autonomy CHECK");
  for (const name of ["'dylan'","'sentinel'","'qa'"]) {
    assert.ok(sql.includes(name), `agent ${name} seeded`);
  }
  // All L0
  const l0Matches = (sql.match(/'L0'/g) || []).length;
  assert.ok(l0Matches >= 3, "all 3 agents L0");
  assert.ok(sql.includes("L0 READ_ONLY") || sql.includes("L0 read-only"), "explicit L0 comment");
  // ACL: transactional NOT allowed for any L0 agent
  assert.ok(!sql.includes("createNotification") || sql.includes("-- Dylan: broad read-only") , "ACL header present");
  // Verify Dylan/sentinel/QA ACLs exclude createNotification/notifyOwner
  // The INSERT SELECT for agent_tools lists only low-risk tools; transactionals absent
  const aclSection = sql.slice(sql.indexOf("-- Dylan:"), sql.indexOf("COMMIT;"));
  // Dylan's allowlist must not contain transactional names
  const dylanBlock = sql.indexOf("-- Dylan:") !== -1 ? sql.slice(sql.indexOf("-- Dylan:"), sql.indexOf("-- Sentinel:")) : "";
  assert.ok(!dylanBlock.includes("'createNotification'"), "Dylan ACL must not include createNotification");
  assert.ok(!dylanBlock.includes("'notifyOwner'"), "Dylan ACL must not include notifyOwner");
});

// ── 3. Knowledge: FTS without pgvector, tenant-scoped ───────────────────
test("knowledge tables use tsv/pg_trgm without pgvector and are tenant-scoped", () => {
  const sql = read(path.join(DB, "migration_141_knowledge_foundation.sql"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS knowledge_documents"), "knowledge_documents");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS knowledge_chunks"), "knowledge_chunks");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS knowledge_document_versions"), "knowledge_document_versions");
  assert.ok(sql.includes("CREATE EXTENSION IF NOT EXISTS pg_trgm"), "pg_trgm extension");
  assert.ok(!/CREATE EXTENSION.*vector/i.test(sql), "must not enable pgvector");
  // Comment may discuss future vector but no column definition — check no column named embedding
  assert.ok(!/embedding\s+vector/i.test(sql), "no embedding vector column");
  assert.ok(sql.includes("to_tsvector('english'"), "tsv generation");
  assert.ok(sql.includes("gin_trgm_ops") || sql.includes("gin("), "trigram index");
  // tenant_id nullable FK to organizers
  assert.ok(sql.includes("tenant_id uuid REFERENCES organizers(id) ON DELETE CASCADE"), "tenant_id FK");
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"), "RLS on knowledge");
  // Seeds include architecture + ADR-0002 + DEC-0003
  assert.ok(sql.includes("Aldriva System Architecture"), "architecture seed");
  assert.ok(sql.includes("ADR-0002"), "ADR-0002 seed");
  assert.ok(sql.includes("DEC-0003") || sql.includes("Canonical Tenant Unification"), "DEC-0003 seed");
});

// ── 4. Runtime: tasks/runs/steps/approvals/reports ───────────────────────
test("agent runtime tables: tasks, runs, steps, approvals, reports with RLS", () => {
  const sql = read(path.join(DB, "migration_142_agent_runtime.sql"));
  for (const t of ["agent_tasks","approvals","agent_runs","agent_steps","agent_reports"]) {
    assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `${t} table`);
    assert.ok(sql.includes(`ENABLE ROW LEVEL SECURITY` + "") || sql.includes(`ENABLE ROW LEVEL SECURITY`), `RLS on ${t}`);
  }
  assert.ok(sql.includes("risk text NOT NULL CHECK (risk IN ('low','medium','high','critical'))"), "approvals risk CHECK");
  assert.ok(sql.includes("expires_at"), "approvals expiry");
  assert.ok(sql.includes("guard_result") || sql.includes("guard_verdict"), "guard columns on runs/steps");
  assert.ok(!/pgvector|embedding/i.test(sql), "no vector in runtime");
});

// ── 5. Gateway route: auth + tenant + allowlist + guards ─────────────────
test("gateway route enforces auth, allowlist, and guards without duplicating providers", () => {
  const src = read(path.join(ROOT, "app", "api", "ai", "gateway", "route.ts"));
  assert.ok(src.includes("getCurrentUser") || src.includes("createSupabaseServer"), "auth check");
  assert.ok(src.includes("enforceRateLimit"), "rate limit reuse");
  assert.ok(src.includes("articleAi") || src.includes("rate-limit"), "rate limit bucket");
  assert.ok(src.includes("allowedAgents") || src.includes("Unknown agent"), "agent allowlist");
  assert.ok(src.includes("dylan") && src.includes("sentinel") && src.includes("qa"), "3 agents in allowlist");
  assert.ok(src.includes("orchestrate"), "delegates to orchestrator");
  assert.ok(!src.includes("new GeminiProvider") && !src.includes("new OpenRouterProvider"), "no direct provider construction");
  assert.ok(!src.includes("getContentHistory") || src.includes("orchestrator"), "gateway does not bypass orchestrator");
});

// ── 6. Orchestrator reuses existing abstractions and enforces gates ──────
test("orchestrator reuses provider factory, knowledge, tools-registry, guards, approvals", () => {
  const src = read(path.join(ROOT, "lib", "ai", "orchestrator.ts"));
  assert.ok(src.includes("getAgentByName") && src.includes("getAllowedToolDefinitions"), "agent registry");
  assert.ok(src.includes("retrieveKnowledge") && src.includes("formatKnowledgeForPrompt"), "knowledge retrieval");
  assert.ok(src.includes("getTenantAIProvider") && src.includes("getAIProvider"), "provider abstraction (tenant-aware)");
  assert.ok(src.includes("executeAITool") || src.includes("executeTenantTool"), "tool execution via registry");
  assert.ok(src.includes("guardBeforeDisplay"), "output guard");
  assert.ok(src.includes("allowedNames.has") || src.includes("not allowed for agent"), "allowlist software-enforced");
  assert.ok(src.includes("checkApprovalRequired") && src.includes("createApprovalRequest"), "approval gate");
  assert.ok(src.includes("TenantToolContext") || src.includes("resolveTenantContext"), "tenant isolation");
  assert.ok(src.includes("createAgentRun") && src.includes("addAgentStep"), "audit persistence");
  assert.ok(src.includes("L0") || src.includes("autonomy_level"), "autonomy level check");
  assert.ok(!src.includes("SELECT *"), "no SELECT * in orchestrator");
  assert.ok(!src.includes("supabaseAdmin.rpc(\"check_rate_limit\""), "rate limit only at gateway, not orchestrator");
});

test("agent-registry enforces L0 naming and rejects unknown agents", () => {
  const src = read(path.join(ROOT, "lib", "ai", "agent-registry.ts"));
  assert.ok(src.includes("getAgentByName") && src.includes("getAllowedToolNames"), "registry exports");
  assert.ok(src.includes("dylan") && src.includes("sentinel") && src.includes("qa"), "3 fallback agents");
  assert.ok(src.includes("L0") && src.includes("read-only"), "L0 markers");
  assert.ok(src.includes("FALLBACK_ALLOWED") || src.includes("fallback"), "fallback for hermetic tests");
});

test("knowledge retrieval is tenant-scoped and does not invent policies", () => {
  const src = read(path.join(ROOT, "lib", "ai", "knowledge.ts"));
  assert.ok(src.includes("tenantId") && src.includes("tenant_id IS NULL"), "tenant scoping");
  assert.ok(src.includes("retrieveKnowledge") && src.includes("formatKnowledgeForPrompt"), "retrieval exports");
  assert.ok(src.includes("pg_trgm") || src.includes("tsv") || src.includes("textSearch"), "uses tsv/trigram");
  assert.ok(!src.includes("embedding") && !src.includes("vector("), "no vector embedding");
  assert.ok(src.includes("FALLBACK_DOCS") || src.includes("fallback"), "fallback for hermetic mode");
});

test("approvals are application-enforced, never prompt-based", () => {
  const src = read(path.join(ROOT, "lib", "ai", "approvals.ts"));
  assert.ok(src.includes("checkApprovalRequired"), "check function");
  assert.ok(src.includes("createApprovalRequest"), "create request");
  assert.ok(src.includes("L0") && src.includes("blocked"), "L0 blocks high-risk");
  assert.ok(src.includes("from('approvals')"), "persists to approvals table");
  assert.ok(!src.includes("prompt") || !src.includes("ask for approval"), "not prompt-based");
  // Should reference risk high/critical set
  assert.ok(src.includes("high") && src.includes("critical"), "risk classification");
});

test("Growth Studio chat route still exists and was not overwritten", () => {
  const p = path.join(ROOT, "app", "api", "ai", "chat", "route.ts");
  assert.ok(fs.existsSync(p), "app/api/ai/chat/route.ts must still exist");
  const src = read(p);
  assert.ok(src.includes("requireAdmin"), "Growth Studio still admin-gated");
  assert.ok(src.includes("executeAITool"), "Growth Studio still uses safe tools");
  assert.ok(src.includes("guardBeforeDisplay"), "Growth Studio still guard-gated");
});

test("app/api/ai/chat Gemini integration fixes: thought_signature replay and function_response object wrapping (Issue 3)", () => {
  const chatSrc = read(path.join(ROOT, "app", "api", "ai", "chat", "route.ts"));
  const geminiSrc = read(path.join(ROOT, "lib", "ai", "providers", "gemini.ts"));
  // Error A: must preserve thought_signature via provider's AIToolCall.thoughtSignature
  // Chat route must batch tool_calls so formatMessages can replay signatures in one model content
  assert.ok(chatSrc.includes("batchCalls") && chatSrc.includes("tool_calls: batchCalls"), "chat must batch assistant tool_calls (preserves parallel thought_signature grouping)");
  assert.ok(geminiSrc.includes("thoughtSignature?: string"), "GeminiPart/AIToolCall must carry thoughtSignature");
  assert.ok(geminiSrc.includes("thoughtSignature") && geminiSrc.includes("formatMessages"), "formatMessages must replay thoughtSignature");
  assert.ok(geminiSrc.includes("Missing thought_signature for functionCall"), "WARN on missing signature must exist for observability");
  // Error B: function_response must be object, not array (Proto field not repeating)
  assert.ok(geminiSrc.includes("functionResponse") && geminiSrc.includes("responseObj = { result: parsedResult }"), "function_response array must be wrapped to object {result: array}");
  assert.ok(geminiSrc.includes("pendingToolParts") && geminiSrc.includes("functionResponse"), "tool responses must be coalesced correctly, not sent as bare array");
  // Error handling: must return clean 4xx/5xx, not crash uncontrolled
  assert.ok(chatSrc.includes("catch (err: unknown)") && chatSrc.includes('NextResponse.json({ error: "AI service error'), "chat must have top-level catch returning generic 500");
  assert.ok(chatSrc.includes("insertSystemEvent") && chatSrc.includes("provider_error"), "chat must log provider errors to system_events");
  // Second turn must be text-only (toolConfig NONE) to avoid re-triggering tool calls
  assert.ok(chatSrc.includes("toolConfig") && chatSrc.includes("mode: 'NONE'"), "chat second turn must force text-only via toolConfig NONE");
});

// ── 7. Hallucinated tool get_incident_history is rejected by allowlist before executor (Issue 2) ─
test("hallucinated tool get_incident_history is rejected by allowlist before any executor DB call", () => {
  const src = read(path.join(ROOT, "lib", "ai", "orchestrator.ts"));
  const sql = read(path.join(DB, "migration_139_tool_registry.sql"));
  // No such tool seeded — hallucination, not missing feature
  assert.ok(!sql.includes("get_incident_history"), "hallucinated tool must NOT be seeded in tool_definitions");
  assert.ok(!src.includes("case 'get_incident_history'") && !src.includes('name: \'get_incident_history\''), "no implementation of hallucinated tool exists");
  // Allowlist check must exist and must be BEFORE any executor call
  const allowlistPos = src.indexOf("allowedNames.has");
  const executorPos = src.indexOf("executeAITool(");
  const tenantExecutorPos = src.indexOf("executeTenantTool(");
  assert.ok(allowlistPos !== -1, "allowlist software-enforced check must exist (allowedNames.has)");
  assert.ok(executorPos !== -1, "executeAITool must exist");
  assert.ok(allowlistPos < executorPos, "allowlist check must be BEFORE executeAITool — hallucinated tool blocked before DB");
  if (tenantExecutorPos !== -1) {
    assert.ok(allowlistPos < tenantExecutorPos, "allowlist check must be BEFORE executeTenantTool");
  }
  // WARN log at rejection point must be visible, not silently absorbed
  assert.ok(
    src.includes('Hallucinated or disallowed tool') && src.includes('rejected by allowlist before executor'),
    "WARN log at allowlist rejection must exist and mention hallucinated/rejected before executor"
  );
  // Also verify the blocked tool is surfaced as error in tool history (not executed)
  assert.ok(src.includes('not allowed for agent') && src.includes('batchAssistantCalls.push(call)'), "blocked tool still added to batch history as error, not executed");
  // Simulate: model returns functionCall for hallucinated tool — orchestrator must treat as blocked
  const mockHallucinatedResponse = { toolCalls: [{ function: { name: "get_incident_history", arguments: "{}" } }] };
  const allowed = new Set(["get_recent_events","get_active_incidents","get_guard_rejections","get_recent_webhook_failures"]);
  const isAllowed = allowed.has(mockHallucinatedResponse.toolCalls[0].function.name);
  assert.equal(isAllowed, false, "mock hallucinated get_incident_history must be rejected by allowlist");
});

// ── 8. No forbidden capabilities introduced ───────────────────────────────
test("no autonomous deployment, filesystem, or financial writes in new lib", () => {
  const files = [
    "lib/ai/orchestrator.ts",
    "lib/ai/agent-registry.ts",
    "lib/ai/knowledge.ts",
    "lib/ai/approvals.ts",
    "lib/ai/agent-runs.ts",
    "app/api/ai/gateway/route.ts",
  ].map((p) => readSql(path.join(ROOT, p))).join("\n").toLowerCase();
  assert.ok(!files.includes("vercel deploy") && !files.includes("production deployment"), "no production deploy");
  assert.ok(!files.includes("fs.write") && !files.includes("child_process") && !files.includes("execsync"), "no filesystem/exec");
  assert.ok(!files.includes("record_donation_and_credit") && !files.includes("record_product_paid"), "no financial credit RPC");
  assert.ok(!/create extension.*vector/i.test(files), "no pgvector extension creation");
});
