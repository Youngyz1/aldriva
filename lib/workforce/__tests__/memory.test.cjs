/**
 * Stage 12 hermetic tests: approved persistent agent memory.
 *
 * No database, no network. MiniSupa in-memory harness emulates the
 * chainable query surface for resolveMemory + applier paths; static scans
 * enforce the read-only/UI contracts. Verifies the mandated 15 cases:
 * tenant isolation, agent isolation, approved read, pending invisibility,
 * rejection no-op, direct-write protection, CREATE v1, UPDATE v2, stale
 * rejection, expiry, revocation, secrets, 404 ids, admin gating,
 * no-secrets scan — plus migration consistency (149 files, mirror, order,
 * rollback) and service-role confinement.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const DB = path.join(ROOT, "db");
function read(p) { return fs.readFileSync(p, "utf8"); }

// TS loading (same pattern as reports.test.cjs)
const originalResolveFilename = Module._resolveFilename;
require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
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

const { resolveMemory, formatMemoryForPrompt } = require("../../ai/memory");
const {
  validateMemoryProposal,
  containsSecretPattern,
} = require("../../ai/tools/workforce/memory-propose");
const {
  applyApprovedMemory,
  applyOneApproval,
  extractProposal,
  resolveProposalScope,
  expireDueMemories,
} = require("../memory-apply");
const {
  memoryScopeLabel,
  memoryStatusBadge,
  buildMemoryPreview,
  memoryApplyState,
  isMemoryIdShape,
  isMemoryStatusValue,
} = require("../memory");

// ── MiniSupa harness ─────────────────────────────────────────────────────
let genSeq = 0;
function matchCond(row, cond) {
  // cond: "col.is.null" | "col.eq.val" | "col.gt.val" | "col.lte.val"
  const parts = cond.split(".");
  const col = parts[0];
  const op = parts[1];
  const val = parts.slice(2).join(".");
  const rv = row[col] === undefined ? null : row[col];
  if (op === "is") return val === "null" ? rv === null : rv !== null;
  if (op === "eq") return rv === val;
  if (op === "gt") return rv !== null && rv > val;
  if (op === "lte") return rv !== null && rv <= val;
  throw new Error(`unsupported cond ${cond}`);
}

class MiniQ {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.pendingInsert = null;
    this.pendingUpdate = null;
  }
  select() { return this; }
  eq(c, v) { this.filters.push((r) => (r[c] === undefined ? null : r[c]) === v); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] !== null && r[c] !== undefined)); return this; }
  not(c, op, v) {
    if (op === "is" && v === null) this.filters.push((r) => r[c] !== null && r[c] !== undefined);
    else this.filters.push((r) => r[c] !== v);
    return this;
  }
  or(expr) {
    const conds = String(expr).split(",");
    this.filters.push((r) => conds.some((c) => matchCond(r, c)));
    return this;
  }
  lte(c, v) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && r[c] <= v); return this; }
  in(c, arr) { this.filters.push((r) => arr.includes(r[c])); return this; }
  order(c, opts) { this.orders.push({ c, asc: !opts || opts.ascending !== false }); return this; }
  limit(n) { this.limitN = n; return this; }
  insert(obj) { this.pendingInsert = obj; return this; }
  update(obj) { this.pendingUpdate = obj; return this; }
  delete() { this.pendingDelete = true; return this; }
  run() {
    const table = this.db[this.table] || (this.db[this.table] = []);
    if (this.pendingInsert) {
      const row = { id: `gen-${++genSeq}`, ...this.pendingInsert };
      table.push(row);
      return [row];
    }
    let rows = table.filter((r) => this.filters.every((f) => f(r)));
    if (this.pendingUpdate) {
      for (const r of rows) Object.assign(r, this.pendingUpdate);
      return rows;
    }
    if (this.pendingDelete) {
      this.db[this.table] = table.filter((r) => !rows.includes(r));
      return rows;
    }
    for (const o of this.orders) {
      rows = [...rows].sort((a, b) => {
        const av = a[o.c] === undefined ? null : a[o.c];
        const bv = b[o.c] === undefined ? null : b[o.c];
        if (av === bv) return 0;
        if (av === null) return o.asc ? -1 : 1;
        if (bv === null) return o.asc ? 1 : -1;
        return (av < bv ? -1 : 1) * (o.asc ? 1 : -1);
      });
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return rows;
  }
  then(resolve) {
    resolve({ data: this.run(), error: null });
    return Promise.resolve();
  }
}

function miniClient(db) {
  return { from: (t) => new MiniQ(db, t) };
}

const AGENT_X = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const AGENT_Y = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const NOW = "2026-09-30T12:00:00.000Z";
const FUTURE = "2026-10-30T12:00:00.000Z";
const PAST = "2026-09-01T12:00:00.000Z";

function fact(over = {}) {
  return {
    id: "f1", tenant_id: TENANT_A, agent_id: null, fact_key: "invoice-cc",
    fact_value: "Always CC finance on invoices.", status: "active", version: 1,
    source: "human", expires_at: null, approval_id: null,
    ...over,
  };
}

function approval(over = {}) {
  return {
    id: "ap1", action: "memory_propose", status: "approved",
    tenant_id: TENANT_A, requested_by_agent_id: AGENT_X, audit_ref: null,
    proposed_outcome: {
      memory_proposal: {
        op: "CREATE", scope: "own-tenant-shared", agent: "shared",
        fact_key: "invoice-cc", fact_value: "Always CC finance on invoices.",
        base_version: 0, expires_at: null,
      },
    },
    evidence: {},
    ...over,
  };
}

// ── 1. Tenant isolation ──────────────────────────────────────────────────
test("1. tenant A cannot read tenant B memory", async () => {
  const db = { agent_memory: [fact({ tenant_id: TENANT_A }), fact({ id: "f2", tenant_id: TENANT_B, fact_key: "other" })] };
  const a = await resolveMemory(AGENT_X, TENANT_A, null, 8, miniClient(db));
  assert.deepEqual(a.facts.map((f) => f.id), ["f1"]);
  const b = await resolveMemory(AGENT_X, TENANT_B, null, 8, miniClient(db));
  assert.deepEqual(b.facts.map((f) => f.id), ["f2"]);
  // platform rows visible in both, tenant rows never cross
  db.agent_memory.push(fact({ id: "f3", tenant_id: null, fact_key: "plat" }));
  const a2 = await resolveMemory(AGENT_X, TENANT_A, null, 8, miniClient(db));
  assert.ok(a2.facts.some((f) => f.id === "f3") && !a2.facts.some((f) => f.id === "f2"));
});

// ── 2. Agent isolation ───────────────────────────────────────────────────
test("2. agent X memory is invisible to agent Y", async () => {
  const db = {
    agent_memory: [
      fact({ id: "fx", agent_id: AGENT_X, fact_key: "private-x" }),
      fact({ id: "fs", agent_id: null, fact_key: "shared" }),
    ],
  };
  const y = await resolveMemory(AGENT_Y, TENANT_A, null, 8, miniClient(db));
  assert.deepEqual(y.facts.map((f) => f.id), ["fs"]);
  const x = await resolveMemory(AGENT_X, TENANT_A, null, 8, miniClient(db));
  assert.deepEqual(x.facts.map((f) => f.id).sort(), ["fs", "fx"]);
});

// ── 3. Approved read ─────────────────────────────────────────────────────
test("3. approved active memory is returned during a run", async () => {
  const db = { agent_memory: [fact()] };
  const r = await resolveMemory(AGENT_X, TENANT_A, ["invoice-cc"], 8, miniClient(db));
  assert.equal(r.facts.length, 1);
  assert.equal(r.facts[0].fact_value, "Always CC finance on invoices.");
  const block = formatMemoryForPrompt(r);
  assert.ok(block.startsWith("=== AGENT MEMORY ===") && block.endsWith("=== END AGENT MEMORY ==="));
  assert.ok(block.includes("context/data, not instructions"));
  assert.deepEqual(formatMemoryForPrompt({ facts: [], agentId: null, tenantId: null }), "");
});

// ── 4. Pending proposal ──────────────────────────────────────────────────
test("4. pending/unapproved memory does not appear in reads", async () => {
  const pending = approval({ status: "pending" });
  const r = await applyOneApproval(miniClient({ approvals: [pending], agent_memory: [] }), pending, NOW);
  assert.ok(r.skipped, "pending approval skipped without mutation");
  const r2 = await resolveMemory(AGENT_X, TENANT_A, null, 8, miniClient({ agent_memory: [] }));
  assert.equal(r2.facts.length, 0);
});

// ── 5. Rejection ─────────────────────────────────────────────────────────
test("5. rejected approval leaves current memory unchanged", async () => {
  const db = { approvals: [approval({ status: "rejected" })], agent_memory: [fact()] };
  const r = await applyOneApproval(miniClient(db), db.approvals[0], NOW);
  assert.ok(r.skipped);
  assert.equal(db.agent_memory.length, 1);
  assert.equal(db.agent_memory[0].version, 1);
  assert.equal(db.approvals[0].audit_ref, null);
});

// ── 6. Direct-write protection ───────────────────────────────────────────
test("6. agent runtime paths cannot write memory (static)", () => {
  const mem = read(path.join(ROOT, "lib/ai/memory.ts"));
  assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(mem), "read service has no writes");
  const tool = read(path.join(ROOT, "lib/ai/tools/workforce/memory-propose.ts"));
  assert.ok(!/\.from\(['"]agent_memory/.test(tool), "proposal tool never touches memory tables");
  assert.ok(!/\.insert\(|\.update\(|\.delete\(/.test(tool.replace(/createApprovalRequest/g, "")), "tool performs no table writes");
  const sql = read(path.join(DB, "migration_149_agent_memory.sql"));
  assert.ok(!/FOR INSERT|FOR UPDATE|FOR DELETE/i.test(sql), "no ordinary write RLS policies");
});

// ── 7. CREATE ────────────────────────────────────────────────────────────
test("7. approved CREATE produces v1 + history v1", async () => {
  const db = { approvals: [approval()], agent_memory: [], agent_memory_versions: [] };
  const out = await applyApprovedMemory(miniClient(db), { approvalId: "ap1", nowIso: NOW });
  assert.equal(out.applied.length, 1);
  assert.equal(out.applied[0].version, 1);
  assert.equal(db.agent_memory.length, 1);
  assert.equal(db.agent_memory[0].status, "active");
  assert.equal(db.agent_memory[0].source, "agent-proposed");
  assert.equal(db.agent_memory_versions.length, 1);
  assert.equal(db.agent_memory_versions[0].version, 1);
  assert.ok((db.approvals[0].audit_ref || "").startsWith("memory:applied:"), "approval stamped");
});

// ── 8. UPDATE ────────────────────────────────────────────────────────────
test("8. approved UPDATE produces v2 and preserves v1", async () => {
  const existing = fact({ version: 1 });
  const upd = approval({
    id: "ap2",
    proposed_outcome: {
      memory_proposal: {
        op: "UPDATE", scope: "own-tenant-shared", agent: "shared",
        fact_key: "invoice-cc", fact_value: "Always CC finance AND legal.",
        base_version: 1, expires_at: null,
      },
    },
  });
  const db = {
    approvals: [upd],
    agent_memory: [existing],
    agent_memory_versions: [{ id: "h1", fact_id: "f1", version: 1, fact_value: existing.fact_value, status: "active", expires_at: null, approval_id: null, created_at: NOW }],
  };
  const out = await applyApprovedMemory(miniClient(db), { approvalId: "ap2", nowIso: NOW });
  assert.equal(out.applied.length, 1);
  assert.equal(out.applied[0].version, 2);
  assert.equal(db.agent_memory[0].fact_value, "Always CC finance AND legal.");
  assert.equal(db.agent_memory_versions.length, 2, "v1 preserved, v2 appended");
});

// ── 9. Stale version ─────────────────────────────────────────────────────
test("9. old approval cannot overwrite a newer version", async () => {
  const current = fact({ version: 5, fact_value: "v5 truth" });
  const stale = approval({
    proposed_outcome: {
      memory_proposal: {
        op: "UPDATE", scope: "own-tenant-shared", agent: "shared",
        fact_key: "invoice-cc", fact_value: "stale v4 lie", base_version: 4, expires_at: null,
      },
    },
  });
  const db = { approvals: [stale], agent_memory: [current], agent_memory_versions: [] };
  const out = await applyApprovedMemory(miniClient(db), { approvalId: "ap1", nowIso: NOW });
  assert.equal(out.applied.length, 0);
  assert.equal(out.skipped.length, 1);
  assert.equal(db.agent_memory[0].fact_value, "v5 truth", "v5 untouched");
  assert.equal(db.agent_memory[0].version, 5);
  assert.equal(db.approvals[0].audit_ref, "memory-version-conflict");
});

// ── 10. Expiration ───────────────────────────────────────────────────────
test("10. expired memory is not returned; history remains intact", async () => {
  const db = { agent_memory: [fact({ expires_at: PAST })] };
  const r = await resolveMemory(AGENT_X, TENANT_A, null, 8, miniClient(db));
  assert.equal(r.facts.length, 0, "expired excluded from reads");
  const db2 = {
    agent_memory: [fact({ expires_at: PAST })],
    agent_memory_versions: [{ id: "h1", fact_id: "f1", version: 1, fact_value: "x", status: "active", expires_at: PAST, approval_id: null, created_at: PAST }],
  };
  const done = await expireDueMemories(miniClient(db2), NOW);
  assert.deepEqual(done, ["f1"]);
  assert.equal(db2.agent_memory[0].status, "expired");
  assert.equal(db2.agent_memory[0].version, 2);
  assert.equal(db2.agent_memory_versions.length, 2, "history preserved");
  const done2 = await expireDueMemories(miniClient(db2), NOW);
  assert.deepEqual(done2, [], "idempotent — no double-expire");
});

// ── 11. Revocation ───────────────────────────────────────────────────────
test("11. revoked memory is not returned; history remains queryable", async () => {
  const rev = approval({
    proposed_outcome: {
      memory_proposal: {
        op: "REVOKE", scope: "own-tenant-shared", agent: "shared",
        fact_key: "invoice-cc", fact_value: null, base_version: 1, expires_at: null,
      },
    },
  });
  const db = {
    approvals: [rev],
    agent_memory: [fact()],
    agent_memory_versions: [{ id: "h1", fact_id: "f1", version: 1, fact_value: "x", status: "active", expires_at: null, approval_id: null, created_at: NOW }],
  };
  const out = await applyApprovedMemory(miniClient(db), { approvalId: "ap1", nowIso: NOW });
  assert.equal(out.applied[0].version, 2);
  assert.equal(db.agent_memory[0].status, "revoked");
  const r = await resolveMemory(AGENT_X, TENANT_A, null, 8, miniClient(db));
  assert.equal(r.facts.length, 0, "revoked excluded from reads");
  assert.equal(db.agent_memory_versions.length, 2, "full chain queryable");
});

// ── 12. Secret protection ────────────────────────────────────────────────
test("12. secret-pattern values rejected; UI states no-secret-store", () => {
  assert.equal(containsSecretPattern("api_key=" + "s3cr3t123"), true);
  assert.equal(containsSecretPattern("-----BEGIN RSA PRIVATE KEY----- xyz"), true);
  assert.equal(containsSecretPattern("sk_live_abc123"), true);
  assert.equal(containsSecretPattern("Always CC finance on invoices."), false);
  const bad = validateMemoryProposal({ op: "CREATE", fact_key: "k", fact_value: "token=abc123" });
  assert.equal(bad.ok, false);
  const listSrc = read(path.join(ROOT, "app/admin/workforce/memory/page.tsx"));
  assert.ok(listSrc.includes("Memory is not a secret store"), "UI states the boundary");
});

// ── 13. Invalid IDs ──────────────────────────────────────────────────────
test("13. memory detail 404s on invalid ids", async () => {
  const { fetchMemoryDetail } = require("../memory");
  const none = await fetchMemoryDetail(miniClient({ agent_memory: [fact()], agent_memory_versions: [] }), "not-a-uuid");
  assert.equal(none, null);
});

// ── 14. Admin gating ─────────────────────────────────────────────────────
test("14. requireAdmin on memory pages; p2 registration", () => {
  for (const rel of ["app/admin/workforce/memory/page.tsx", "app/admin/workforce/memory/[id]/page.tsx"]) {
    const src = read(path.join(ROOT, rel));
    assert.ok(!/^"use client"/m.test(src), `${rel} is a server component`);
    assert.ok(src.includes("await requireAdmin()"), `${rel} calls requireAdmin()`);
    assert.ok(!src.includes("dangerouslySetInnerHTML"), `${rel} never renders raw HTML`);
    assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(src), `${rel} performs no writes`);
  }
  const p2 = read(path.join(ROOT, "lib/security/__tests__/p2-admin-page-gates.test.cjs"));
  assert.ok(p2.includes("app/admin/workforce/memory/page.tsx"), "list registered");
  assert.ok(p2.includes("app/admin/workforce/memory/[id]/page.tsx"), "detail registered");
});

// ── 15. No-secrets scan ──────────────────────────────────────────────────
test("15. no-secrets scan over memory source, tests, fixtures", () => {
  const files = [
    "lib/ai/memory.ts",
    "lib/ai/tools/workforce/memory-propose.ts",
    "lib/workforce/memory.ts",
    "lib/workforce/memory-apply.ts",
    "lib/actions/workforce-memory.ts",
    "lib/actions/workforce-approvals.ts",
    "app/admin/workforce/memory/page.tsx",
    "app/admin/workforce/memory/[id]/page.tsx",
    __filename,
  ];
  // Banned literals are concatenated so this file itself never contains them.
  const banned = ["hunter" + "2", "super" + "secret", "sk_live_", "sk_test_", "service" + "_role", "BEGIN RSA PRIVATE KEY"];
  for (const rel of files) {
    const full = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
    const src = read(full).toLowerCase();
    for (const b of banned) {
      // allow the redaction/detection patterns themselves, never literal values
      if (b === "sk_live_" || b === "sk_test_" || b === "BEGIN RSA PRIVATE KEY") {
        const uses = src.split(b.toLowerCase()).length - 1;
        const patternUses = (src.match(/sk_\(live\|test\)|private key-----/g) || []).length;
        assert.ok(uses <= patternUses + 2, `${rel} must not embed ${b} values`);
        continue;
      }
      assert.ok(!src.includes(b), `${rel} must not contain ${b}`);
    }
  }
});

// ── Validator + proposal units ───────────────────────────────────────────
test("proposal validation: ops, lengths, versions, expiry, scope", () => {
  const good = { op: "CREATE", fact_key: "k", fact_value: "v" };
  assert.equal(validateMemoryProposal(good).ok, true);
  assert.equal(validateMemoryProposal({ op: "NOPE", fact_key: "k", fact_value: "v" }).ok, false);
  assert.equal(validateMemoryProposal({ op: "CREATE", fact_key: "", fact_value: "v" }).ok, false);
  assert.equal(validateMemoryProposal({ op: "CREATE", fact_key: "k", fact_value: "" }).ok, false);
  assert.equal(validateMemoryProposal({ op: "CREATE", fact_key: "k", fact_value: "v", base_version: 2 }).ok, false);
  assert.equal(validateMemoryProposal({ op: "UPDATE", fact_key: "k", fact_value: "v", base_version: 0 }).ok, false);
  assert.equal(validateMemoryProposal({ op: "UPDATE", fact_key: "k", fact_value: "v", base_version: 3 }).ok, true);
  assert.equal(validateMemoryProposal({ op: "REVOKE", fact_key: "k", base_version: 1 }).ok, true);
  assert.equal(validateMemoryProposal({ op: "CREATE", fact_key: "k", fact_value: "v", expires_at: "not-a-date" }).ok, false);
  assert.equal(validateMemoryProposal({ op: "CREATE", fact_key: "k", fact_value: "v", scope: "other-tenant" }).ok, false);
  assert.equal(validateMemoryProposal(null).ok, false);
});

test("extractProposal + resolveProposalScope use trusted row data", () => {
  const row = approval();
  const p = extractProposal(row);
  assert.ok(p && p.op === "CREATE" && p.fact_key === "invoice-cc");
  assert.deepEqual(resolveProposalScope(p, row), { tenantId: TENANT_A, agentId: null });
  const selfRow = approval({
    proposed_outcome: {
      memory_proposal: {
        op: "CREATE", scope: "own-tenant-self", agent: "self",
        fact_key: "k", fact_value: "v", base_version: 0, expires_at: null,
      },
    },
  });
  const sp = extractProposal(selfRow);
  assert.deepEqual(resolveProposalScope(sp, selfRow), { tenantId: TENANT_A, agentId: AGENT_X });
  const platRow = approval({
    tenant_id: null,
    proposed_outcome: {
      memory_proposal: {
        op: "CREATE", scope: "platform-shared", agent: "shared",
        fact_key: "k", fact_value: "v", base_version: 0, expires_at: null,
      },
    },
  });
  assert.deepEqual(resolveProposalScope(extractProposal(platRow), platRow), { tenantId: null, agentId: null });
  assert.equal(extractProposal(approval({ proposed_outcome: { nope: 1 }, evidence: {} })), null);
});

// ── View-model units ─────────────────────────────────────────────────────
test("memory view-model: scope labels, badges, preview, id shapes", () => {
  assert.equal(memoryScopeLabel(null, null), "Platform · shared");
  assert.equal(memoryScopeLabel(TENANT_A, null, "Acme"), "Tenant Acme · shared");
  assert.equal(memoryScopeLabel(TENANT_A, AGENT_X, null, "Dylan"), "Tenant 11111111… · Dylan");
  assert.deepEqual(memoryStatusBadge("active", null), { label: "active", tone: "ok" });
  assert.deepEqual(memoryStatusBadge("active", FUTURE), { label: "active · expiring", tone: "warn" });
  assert.deepEqual(memoryStatusBadge("revoked", null), { label: "revoked", tone: "bad" });
  assert.deepEqual(memoryStatusBadge("expired", null), { label: "expired", tone: "muted" });
  assert.deepEqual(memoryApplyState(null), "approved — awaiting applier");
  assert.ok(memoryApplyState("memory:applied:f1:v2").startsWith("applied ("));
  assert.equal(memoryApplyState("memory-version-conflict"), "version conflict — not applied");
  assert.deepEqual(buildMemoryPreview("short"), { text: "short", truncated: false });
  const over = buildMemoryPreview("z".repeat(1501));
  assert.equal(over.text.length, 1500);
  assert.equal(over.truncated, true);
  assert.equal(isMemoryIdShape(AGENT_X), true);
  assert.equal(isMemoryIdShape("zzz"), false);
  assert.equal(isMemoryStatusValue("active"), true);
  assert.equal(isMemoryStatusValue("archived"), false);
});

// ── Migration consistency ────────────────────────────────────────────────
test("migration 149 exists with rollback, mirror, order entry, no write policies", () => {
  for (const f of ["migration_149_agent_memory.sql", "migration_149_agent_memory_rollback.sql"]) {
    assert.ok(fs.existsSync(path.join(DB, f)), `db/${f} must exist`);
  }
  const mirror = "20261003000000_migration_149_agent_memory.sql";
  assert.ok(fs.existsSync(path.join(ROOT, "supabase", "migrations", mirror)), "supabase mirror must exist");
  assert.equal(
    read(path.join(ROOT, "supabase", "migrations", mirror)),
    read(path.join(DB, "migration_149_agent_memory.sql")),
    "mirror must be identical"
  );
  assert.ok(read(path.join(DB, "staging-migration-order.txt")).includes("migration_149_agent_memory.sql"), "order entry");
  const sql = read(path.join(DB, "migration_149_agent_memory.sql"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS agent_memory"), "memory table");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS agent_memory_versions"), "versions table");
  assert.ok(sql.includes("UNIQUE (agent_id, tenant_id, fact_key)"), "identity uniqueness");
  assert.ok(sql.includes("'memory_propose'") && sql.includes("'medium',true"), "tool seed gated");
  assert.ok(!/FOR INSERT|FOR UPDATE|FOR DELETE/i.test(sql), "no ordinary write policies");
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled");
});
