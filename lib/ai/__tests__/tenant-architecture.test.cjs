/**
 * Phase 0 multi-tenant AI architecture — static regression tests.
 *
 * Repository-evidence only (no database connection): asserts the new
 * migrations, tenant context, tool registry, guards wiring, provider
 * router, and payment-write invariant hold by file content.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const DB = path.join(ROOT, "db");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

/** File content with SQL comments stripped (headers mention banned words). */
function readSql(p) {
  return read(p).replace(/--[^\n]*\n/g, "\n");
}

// ── Migration files exist, sequential, with rollbacks ───────────────────────

const MIGRATIONS = [
  ["migration_108_connected_accounts.sql", "connected_accounts"],
  ["migration_109_channel_assets.sql", "channel_assets"],
  ["migration_110_customer_identities.sql", "customer_identities"],
  ["migration_111_conversations_messages.sql", "conversations"],
  ["migration_112_ai_provider_configs.sql", "ai_provider_configs"],
  ["migration_113_ai_tool_invocations.sql", "ai_tool_invocations"],
  ["migration_114_notification_preferences.sql", "notification_preferences"],
];

test("migrations 108-114 exist with rollbacks, continuing db/ canon past 107", () => {
  assert.ok(
    fs.existsSync(path.join(DB, "migration_107_handle_new_user_revoke_public_execute.sql")),
    "107 must still be the pre-existing latest"
  );
  for (const [file] of MIGRATIONS) {
    assert.ok(fs.existsSync(path.join(DB, file)), `db/${file} must exist`);
    const rollback = file.replace(/\.sql$/, "_rollback.sql");
    assert.ok(fs.existsSync(path.join(DB, rollback)), `db/${rollback} must exist`);
  }
});

// ── Tenant FK + RLS posture per new table ───────────────────────────────────

test("every new tenant table keys tenant_id to organizers(id) ON DELETE CASCADE", () => {
  const expectations = {
    "migration_108_connected_accounts.sql": ["tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE"],
    "migration_109_channel_assets.sql": [
      "tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE",
      "connected_account_id UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE",
    ],
    "migration_110_customer_identities.sql": ["tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE"],
    "migration_111_conversations_messages.sql": [
      "tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE",
      "conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE",
    ],
    "migration_112_ai_provider_configs.sql": ["tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE"],
    "migration_114_notification_preferences.sql": ["tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE"],
  };
  for (const [file, needles] of Object.entries(expectations)) {
    const sql = read(path.join(DB, file));
    for (const needle of needles) {
      assert.ok(sql.includes(needle), `${file} must contain: ${needle}`);
    }
  }
  // ai_tool_invocations tenant_id is nullable ONLY for fail-closed logging.
  const inv = read(path.join(DB, "migration_113_ai_tool_invocations.sql"));
  assert.ok(
    inv.includes("tenant_id UUID REFERENCES organizers(id) ON DELETE CASCADE"),
    "113 tenant_id must be nullable FK to organizers(id)"
  );
});

test("all new tables enable RLS and reuse is_entity_member(), no ad hoc membership", () => {
  const tables = [
    "connected_accounts",
    "channel_assets",
    "customer_identities",
    "conversations",
    "messages",
    "ai_provider_configs",
    "ai_tool_invocations",
    "notification_preferences",
  ];
  const files = MIGRATIONS.map(([f]) => read(path.join(DB, f))).join("\n");
  for (const t of tables) {
    assert.ok(
      files.includes(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`),
      `${t} must enable RLS`
    );
  }
  assert.ok(files.includes("is_entity_member(tenant_id,"), "policies must call is_entity_member(tenant_id, …)");
  assert.ok(
    !/FROM entity_members/.test(files),
    "migrations must not query entity_members directly (use is_entity_member)"
  );
});

test("ai_tool_invocations NULL-tenant rows are never readable by non-admin roles", () => {
  const sql = read(path.join(DB, "migration_113_ai_tool_invocations.sql"));
  // The only SELECT policy gates member reads on tenant_id IS NOT NULL.
  assert.ok(sql.includes("tenant_id IS NOT NULL"), "member SELECT must require tenant_id IS NOT NULL");
  // No INSERT/UPDATE/DELETE policy for client roles (service-role writes only).
  assert.ok(!/FOR INSERT/.test(sql), "no client INSERT policy allowed");
  assert.ok(!/FOR UPDATE/.test(sql), "no client UPDATE policy allowed");
  assert.ok(!/FOR DELETE/.test(sql), "no client DELETE policy allowed");
});

test("no plaintext-secret columns on ai_provider_configs / customer_identities", () => {
  const sql =
    readSql(path.join(DB, "migration_112_ai_provider_configs.sql")) +
    readSql(path.join(DB, "migration_110_customer_identities.sql"));
  // Column identifiers sit at line start (two-space indent); COMMENT prose
  // legitimately discusses the no-secrets rule, so only match identifiers.
  for (const col of ["api_key", "secret", "access_token", "refresh_token", "private_key"]) {
    assert.ok(
      !new RegExp(`^\\s{2}${col}\\s`, "m").test(sql),
      `must not define column: ${col}`
    );
  }
});

test("generic conversations/messages are distinct from ai_conversations/ai_messages", () => {
  const sql = readSql(path.join(DB, "migration_111_conversations_messages.sql"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS conversations ("), "generic conversations table");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS messages ("), "generic messages table");
  // No DDL touching the admin tables (COMMENT prose may name them for contrast).
  assert.ok(!/CREATE TABLE[^;]*ai_conversations/.test(sql), "must not create ai_conversations");
  assert.ok(!/CREATE TABLE[^;]*ai_messages/.test(sql), "must not create ai_messages");
  assert.ok(!/REFERENCES ai_conversations/.test(sql), "must not FK ai_conversations");
  assert.ok(!/REFERENCES ai_messages/.test(sql), "must not FK ai_messages");
  assert.ok(!/ALTER TABLE ai_/.test(sql), "must not alter ai_* tables");
  assert.ok(sql.includes("tenant_id UUID NOT NULL REFERENCES organizers(id)"), "generic tables are tenant-scoped");
});

test("connected_accounts provider starts with meta CHECK", () => {
  const sql = read(path.join(DB, "migration_108_connected_accounts.sql"));
  assert.ok(sql.includes("CHECK (provider IN ('meta'))"), "provider CHECK must start with meta");
});

// ── Tenant context delegates, never reimplements ────────────────────────────

test("tenant-context wraps entity-auth and never queries membership directly", () => {
  const src = read(path.join(ROOT, "lib", "tenant-context.ts"));
  assert.ok(src.includes("getEntityRole"), "must delegate to getEntityRole");
  assert.ok(src.includes("hasEntityAccess"), "must delegate to hasEntityAccess");
  assert.ok(src.includes("ENTITY_ROLES_ALL"), "must reuse ENTITY_ROLES_ALL tiers");
  assert.ok(!src.includes("from('entity_members')"), "must not query entity_members directly");
  assert.ok(!src.includes('from("entity_members")'), "must not query entity_members directly");
  assert.ok(src.includes("channel_assets"), "channel path resolves via channel_assets");
  assert.ok(src.includes("connected_accounts"), "channel path verifies connected_accounts");
});

// ── Tool registry: scopes + fail-closed dispatch ────────────────────────────

test("registry distinguishes public_read / tenant_scoped / transactional", () => {
  const src = read(path.join(ROOT, "lib", "ai", "tools-registry.ts"));
  const tenantDir = path.join(ROOT, "lib", "ai", "tools", "tenant");
  const tenantSrc = fs
    .readdirSync(tenantDir)
    .filter((f) => f.startsWith("tenant-") && f.endsWith(".ts"))
    .map((f) => read(path.join(tenantDir, f)))
    .join("\n");
  assert.ok(src.includes("PUBLIC_AI_TOOL_DEFINITIONS"), "public tier export");
  assert.ok(src.includes("TENANT_AI_TOOL_DEFINITIONS"), "tenant tier export");
  assert.ok(src.includes("scope: 'public_read'"), "existing tools tagged public_read");
  assert.ok(tenantSrc.includes("scope: 'tenant_scoped'"), "tenant tools tagged tenant_scoped");
  assert.ok(tenantSrc.includes("scope: 'transactional'"), "notification tools tagged transactional");
  assert.ok(src.includes("executeTenantTool"), "tenant executor export");
  assert.ok(
    src.includes("requires a tenant context"),
    "executeAITool must refuse tenant tools without context"
  );
});

test("all tenant tools pass through screenToolResult (same guards, no new ones)", () => {
  const dir = path.join(ROOT, "lib", "ai", "tools", "tenant");
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("tenant-"));
  assert.ok(files.length >= 5, "expected tenant tool modules");
  for (const f of files) {
    if (f === "tool-context.ts") continue;
    const src = read(path.join(dir, f));
    // Read tools screen rows; transactional tools screen copy instead.
    const guarded =
      src.includes("screenToolResult(") || src.includes("screenModelOutput(");
    assert.ok(guarded, `${f} must call screenToolResult() or screenModelOutput()`);
  }
  // No new guard implementations in tenant tools.
  const all = files.map((f) => read(path.join(dir, f))).join("\n");
  assert.ok(!all.includes("function screenModelOutput"), "must not reimplement output guard");
  assert.ok(!all.includes("function screenUntrustedInput"), "must not reimplement input guard");
  assert.ok(!all.includes("function guardBeforeDisplay"), "must not reimplement display guard");
});

test("tenant tools take resolved context, never a raw tenant_id argument", () => {
  const dir = path.join(ROOT, "lib", "ai", "tools", "tenant");
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("tenant-") && f !== "tool-context.ts");
  for (const f of files) {
    const src = read(path.join(dir, f));
    assert.ok(src.includes("TenantToolContext"), `${f} must take TenantToolContext`);
    assert.ok(src.includes("requireToolContext("), `${f} must validate context fail-closed`);
    assert.ok(!src.includes("args.tenantId"), `${f} must never read tenant from caller args`);
    assert.ok(!src.includes("args.tenant_id"), `${f} must never read tenant from caller args`);
  }
});

// ── Payment invariant: AI paths never write payment status ──────────────────

test("no AI-tool code writes payment status or calls credit RPCs", () => {
  const aiDir = path.join(ROOT, "lib", "ai");
  const hits = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(ts|js)$/.test(entry.name)) continue;
      let src = read(p);
      // Strip comments: RPC names appear in header docs stating the ban.
      src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
      for (const needle of [
        "record_donation_and_credit",
        "record_ticket_and_credit",
        "record_product_paid_and_credit",
      ]) {
        if (src.includes(needle)) hits.push(`${p}: ${needle}`);
      }
    }
  }
  walk(aiDir);
  assert.deepEqual(hits, [], `AI code must never invoke credit RPCs: ${hits.join("; ")}`);

  // Tenant business tools are read-only / service-delegated: no direct
  // writes. (The audit-log .insert() lives in tool-context.ts, not here.)
  const tenantDir = path.join(aiDir, "tools", "tenant");
  const businessSrc = fs
    .readdirSync(tenantDir)
    .filter((f) => f.startsWith("tenant-") && f.endsWith(".ts"))
    .map((f) => read(path.join(tenantDir, f)))
    .join("\n");
  assert.ok(!/\.update\(/.test(businessSrc), "tenant business tools must never UPDATE rows directly");
  assert.ok(!/\.insert\(/.test(businessSrc), "tenant business tools must never INSERT rows directly (notifications go through lib/notifications.ts)");
  assert.ok(!/\.delete\(/.test(businessSrc), "tenant business tools must never DELETE rows directly");
  assert.ok(!/\.upsert\(/.test(businessSrc), "tenant business tools must never UPSERT rows directly");
});

// ── Provider router wraps the factory ───────────────────────────────────────

test("tenant provider router wraps getAIProvider, never constructs SDK clients", () => {
  const src = read(path.join(ROOT, "lib", "ai", "tenant-provider.ts"));
  assert.ok(src.includes("getAIProvider"), "must wrap getAIProvider()");
  assert.ok(src.includes("from './provider-factory'"), "must import the existing factory");
  assert.ok(!src.includes("new GeminiProvider"), "must not construct GeminiProvider directly");
  assert.ok(!src.includes("new OpenRouterProvider"), "must not construct OpenRouterProvider directly");
  assert.ok(src.includes("'aldriva'"), "'aldriva' must resolve through existing selection logic");
});

// ── Cross-tenant / malformed-arg parity with the 9 existing tools ─────────────

test("tenant dispatch fails closed before any query, like unknown-tool rejection", () => {
  const src = read(path.join(ROOT, "lib", "ai", "tools-registry.ts"));
  const fnIdx = src.indexOf("export async function executeTenantTool");
  assert.ok(fnIdx !== -1, "executeTenantTool must exist");
  const dispatchIdx = src.indexOf("switch (name) {", fnIdx);
  const guardIdx = src.indexOf("invalid tenant context", fnIdx);
  assert.ok(guardIdx !== -1 && guardIdx < dispatchIdx, "ctx validation must precede the tool switch");
  assert.ok(src.includes("failed_closed"), "denial must log failed_closed (NULL-tenant row)");
});

test("malformed JSON args get identical treatment in both executors", () => {
  const src = read(path.join(ROOT, "lib", "ai", "tools-registry.ts"));
  const occurrences = src.match(/Failed to parse JSON args for tool/g) || [];
  assert.equal(occurrences.length, 2, "both executeAITool and executeTenantTool warn-and-default on bad JSON");
});

// ── Notification prefs separation ───────────────────────────────────────────

test("notification_preferences is tenant-scoped and leaves profiles.preferences alone", () => {
  const sql = read(path.join(DB, "migration_114_notification_preferences.sql"));
  assert.ok(
    sql.includes("tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE"),
    "tenant-scoped to organizers(id)"
  );
  assert.ok(!/ALTER TABLE profiles/.test(sql), "must not alter profiles.preferences");
  assert.ok(!/UPDATE profiles/.test(sql), "must not write profiles rows");
  const notifySrc = read(path.join(ROOT, "lib", "ai", "tools", "tenant", "tenant-notifications.ts"));
  assert.ok(
    notifySrc.includes("from('@/lib/notifications')") || notifySrc.includes('from("@/lib/notifications")') || notifySrc.includes("lib/notifications"),
    "must call the existing lib/notifications.ts service"
  );
  assert.ok(
    notifySrc.includes("notification_preferences"),
    "notifyOwner must honor tenant notification_preferences"
  );
});
