/**
 * Stage 11.1 hermetic tests: Knowledge list + detail data access (read-only).
 *
 * No database, no network. Fake chainable client captures the query chain.
 * Verifies: (1) list NEVER selects content (titles/metadata only), scope
 * allowlist (platform/tenant/all, default platform, unknown falls back),
 * category allowlist (16 CHECK values, unknown falls back, never 500),
 * order updated_at desc, limit 50; (2) detail uuid validation (malformed or
 * unreadable → null), versions metadata-only fetched after parent read,
 * chunk COUNT only (no chunk text); (3) pure view-model: scope labels,
 * status badges, 1500-char preview cap with truncation flag; (4) static
 * read-only contract: no insert/update/delete/upsert/rpc-write, no
 * service-role import, no dangerouslySetInnerHTML, requireAdmin on both
 * pages.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
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

const {
  fetchDocumentList,
  fetchDocumentDetail,
  fetchTenantNames,
  fetchTenantOptions,
  fetchDocumentChunks,
  fetchSourcesSummary,
  validateRetrievalQuery,
  isAllowedRetrievalTenant,
  isFallbackChunkId,
  buildChunkPreview,
  CHUNK_PREVIEW_CAP,
  isKnowledgeCategoryValue,
  isKnowledgeScopeValue,
  KNOWLEDGE_CATEGORIES,
  scopeLabel,
  statusBadge,
  buildContentPreview,
  CONTENT_PREVIEW_CAP,
  isDocumentIdShape,
} = require("../knowledge");

const DOC = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", tenant_id: null, category: "architecture",
  title: "Aldriva System Architecture", status: "approved", version: 2,
  source_type: "system", content: "x".repeat(2000),
  source_ref: "docs/ARCHITECTURE.md#4", source_hash: "abc", approved_by: null,
  approved_at: null, created_by: null, created_at: "2026-09-26T00:00:00Z",
  updated_at: "2026-09-27T00:00:00Z",
};
const ROWS = {
  knowledge_documents: [DOC],
  knowledge_document_versions: [{ version: 2, title: DOC.title, created_at: DOC.updated_at, created_by: null }],
  knowledge_chunks: [{ id: "c1" }],
  organizers: [{ id: "t1", name: "Acme Org" }],
};

class FakeQuery {
  constructor(client, table, count = null) {
    this.client = client;
    this.table = table;
    this.calls = [];
    this.count = count;
  }
  select(cols, opts) { this.calls.push(["select", cols, opts]); return this; }
  eq(col, val) { this.calls.push(["eq", col, val]); return this; }
  is(col, val) { this.calls.push(["is", col, val]); return this; }
  not(col, op, val) { this.calls.push(["not", col, op, val]); return this; }
  in(col, vals) { this.calls.push(["in", col, vals]); return this; }
  order(col, opts) { this.calls.push(["order", col, opts]); return this; }
  limit(n) { this.calls.push(["limit", n]); return this; }
  then(resolve) {
    resolve({ data: ROWS[this.table] || [], error: null, count: this.count });
    return Promise.resolve();
  }
}

function fakeClient(queries, count = null) {
  return {
    queries,
    from(table) {
      const q = new FakeQuery(this, table, count);
      queries.push(q);
      return q;
    },
  };
}

function firstCalls(queries, table) {
  const q = queries.find((x) => x.table === table);
  assert.ok(q, `expected a query on ${table}`);
  return q.calls;
}

test("list never selects content; scope allowlist with platform default", async () => {
  for (const [scope, expect] of [
    ["platform", ["is", "tenant_id", null]],
    ["tenant", ["not", "tenant_id", "is", null]],
    ["all", null],
    ["evil", ["is", "tenant_id", null]],
    [null, ["is", "tenant_id", null]],
  ]) {
    const queries = [];
    const rows = await fetchDocumentList(fakeClient(queries), scope, null);
    assert.equal(rows.length, 1);
    const calls = firstCalls(queries, "knowledge_documents");
    const select = calls.find(([m]) => m === "select");
    assert.ok(select, "selects columns");
    assert.ok(!select[1].split(",").map((c) => c.trim()).includes("content"), "content never selected in list");
    if (expect) assert.ok(calls.some(([m, c]) => m === expect[0] && c === expect[1]), `${scope} scope filter applied`);
    else assert.ok(!calls.some(([m, c]) => m === "is" && c === "tenant_id") && !calls.some(([m, c]) => m === "not" && c === "tenant_id"), "all: no tenant predicate");
    assert.ok(calls.some(([m, c, o]) => m === "order" && c === "updated_at" && o.ascending === false), "newest first");
    assert.ok(calls.some(([m, n]) => m === "limit" && n === 50), "bounded");
  }
  assert.equal(isKnowledgeScopeValue("platform"), true);
  assert.equal(isKnowledgeScopeValue("tenant"), true);
  assert.equal(isKnowledgeScopeValue("all"), true);
  assert.equal(isKnowledgeScopeValue("everything"), false);
});

test("list category allowlist: matches migration CHECK, unknown falls back", async () => {
  const sql = fs.readFileSync(path.join(ROOT, "db/migration_141_knowledge_foundation.sql"), "utf8");
  const checkBlock = sql.slice(sql.indexOf("CHECK (category IN ("), sql.indexOf("))", sql.indexOf("CHECK (category IN (")));
  const checkValues = [...checkBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...KNOWLEDGE_CATEGORIES].sort(), checkValues.sort(), "allowlist mirrors the CHECK constraint");
  const queries = [];
  await fetchDocumentList(fakeClient(queries), "all", "security");
  assert.ok(firstCalls(queries, "knowledge_documents").some(([m, c, v]) => m === "eq" && c === "category" && v === "security"), "category filter applied");
  const queries2 = [];
  await fetchDocumentList(fakeClient(queries2), "all", "drop-table");
  assert.ok(!firstCalls(queries2, "knowledge_documents").some(([m, c]) => m === "eq" && c === "category"), "unknown category ignored, never 500");
  assert.equal(isKnowledgeCategoryValue("agent_memory"), true);
  assert.equal(isKnowledgeCategoryValue("nope"), false);
});

test("detail validates uuid; unreadable returns null", async () => {
  assert.equal(await fetchDocumentDetail(fakeClient([]), "not-a-uuid"), null);
  assert.equal(await fetchDocumentDetail(fakeClient([]), ""), null);
  assert.equal(isDocumentIdShape(DOC.id), true);
  assert.equal(isDocumentIdShape("zzz"), false);
  const emptyClient = { from: () => ({ select: () => ({ eq: () => ({ limit: () => ({ then: (r) => { r({ data: [], error: null }); return Promise.resolve(); } }) }) }) }) };
  assert.equal(await fetchDocumentDetail(emptyClient, DOC.id), null);
});

test("detail fetches versions metadata + chunk count after parent read", async () => {
  const queries = [];
  const raw = await fetchDocumentDetail(fakeClient(queries, 3), DOC.id);
  assert.ok(raw, "parent readable");
  const order = queries.map((q) => q.table);
  assert.ok(order.indexOf("knowledge_documents") < order.indexOf("knowledge_document_versions"), "versions only after parent read");
  const vcalls = firstCalls(queries, "knowledge_document_versions");
  const vselect = vcalls.find(([m]) => m === "select");
  assert.ok(!vselect[1].includes("content"), "version content never selected");
  assert.ok(vselect[1].split(",").map((c) => c.trim()).sort().join(",") === "created_at,created_by,title,version", "versions metadata only");
  const ccalls = firstCalls(queries, "knowledge_chunks");
  assert.ok(!ccalls.find(([m]) => m === "select")[1].split(",").map((c) => c.trim()).includes("content"), "chunk text never selected");
  assert.equal(raw.chunkCount, 3);
  assert.equal(raw.versions.length, 1);
});

test("tenant names batch ids; empty in empty out", async () => {
  assert.deepEqual(await fetchTenantNames(fakeClient([]), []), []);
  const queries = [];
  const names = await fetchTenantNames(fakeClient(queries), ["t1", "t1"]);
  assert.equal(names.length, 1);
  assert.ok(firstCalls(queries, "organizers")[0][0] === "select", "organizers read");
});

test("view-model: scope labels, status badges, preview cap", () => {
  assert.equal(scopeLabel(null), "Platform");
  assert.equal(scopeLabel("t1", "Acme Org"), "Tenant Acme Org");
  assert.equal(scopeLabel("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), "Tenant aaaaaaaa…");
  assert.deepEqual(statusBadge("approved"), { label: "approved", tone: "ok" });
  assert.deepEqual(statusBadge("deprecated"), { label: "deprecated", tone: "bad" });
  assert.deepEqual(statusBadge("draft"), { label: "draft", tone: "warn" });
  assert.deepEqual(statusBadge("weird"), { label: "weird", tone: "muted" });
  assert.equal(CONTENT_PREVIEW_CAP, 1500);
  assert.deepEqual(buildContentPreview("short"), { text: "short", truncated: false });
  const long = buildContentPreview("y".repeat(2000));
  assert.equal(long.text.length, 1500);
  assert.equal(long.truncated, true);
});

test("read-only contract: no writes, no service role, no raw HTML, gated pages", () => {
  const libSrc = fs.readFileSync(path.join(ROOT, "lib/workforce/knowledge.ts"), "utf8");
  for (const w of [".insert(", ".update(", ".delete(", ".upsert(", "supabase-admin", "createSupabaseAdmin"]) {
    assert.ok(!libSrc.includes(w), `lib/workforce/knowledge.ts must not contain ${w}`);
  }
  for (const rel of ["app/admin/workforce/knowledge/page.tsx", "app/admin/workforce/knowledge/[id]/page.tsx", "app/admin/workforce/knowledge/retrieval/page.tsx"]) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.ok(!/^"use client"/m.test(src), `${rel} is a server component`);
    assert.ok(src.includes("await requireAdmin()"), `${rel} calls requireAdmin()`);
    assert.ok(!src.includes("dangerouslySetInnerHTML"), `${rel} never renders raw HTML`);
    for (const w of [".insert(", ".update(", ".delete(", ".upsert(", "createSupabaseAdmin"]) {
      assert.ok(!src.includes(w), `${rel} must not contain ${w}`);
    }
  }
  const detailSrc = fs.readFileSync(path.join(ROOT, "lib/workforce/knowledge.ts"), "utf8");
  const guardIdx = detailSrc.indexOf("if (!document) return null");
  const versionsIdx = detailSrc.indexOf("fetchDocumentVersions(client, document.id)");
  assert.ok(guardIdx !== -1 && versionsIdx !== -1 && guardIdx < versionsIdx, "versions fetched only after parent read succeeds");
});

test("chunks: explicit columns, ordered, capped, never tsv; only after parent", async () => {
  assert.deepEqual(await fetchDocumentChunks(fakeClient([]), "nope"), []);
  const chunks = await fetchDocumentChunks(
    { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ then: (r) => { r({ data: [{ id: "k1", chunk_index: 0, tenant_id: null, content: "abc" }], error: null }); return Promise.resolve(); } }) }) }) }) }) },
    DOC.id
  );
  assert.equal(chunks.length, 1);
  const src = fs.readFileSync(path.join(ROOT, "lib/workforce/knowledge.ts"), "utf8");
  assert.ok(src.includes(".select('id,chunk_index,tenant_id,content')"), "chunk select is explicit");
  assert.ok(!src.includes(",tsv"), "tsv never selected");
  const detailPage = fs.readFileSync(path.join(ROOT, "app/admin/workforce/knowledge/[id]/page.tsx"), "utf8");
  assert.ok(detailPage.indexOf("if (!raw) notFound()") < detailPage.indexOf("fetchDocumentChunks("), "chunks only after parent read");
  assert.equal(CHUNK_PREVIEW_CAP, 5000);
  assert.deepEqual(buildChunkPreview("short"), { text: "short", truncated: false });
  const over = buildChunkPreview("z".repeat(5001));
  assert.equal(over.text.length, 5000);
  assert.equal(over.truncated, true);
});

test("tenant options capped; retrieval query validation; tenant allowlist; fallback ids", async () => {
  const queries = [];
  await fetchTenantOptions(fakeClient(queries));
  assert.ok(firstCalls(queries, "organizers").some(([m, n]) => m === "limit" && n === 50), "options capped at 50");
  assert.deepEqual(validateRetrievalQuery("  hello  "), { ok: true, query: "hello" });
  assert.equal(validateRetrievalQuery("").ok, false);
  assert.equal(validateRetrievalQuery("   ").ok, false);
  assert.equal(validateRetrievalQuery("x".repeat(300)).ok, true);
  assert.equal(validateRetrievalQuery("x".repeat(301)).ok, false);
  assert.equal(validateRetrievalQuery(null).ok, false);
  assert.equal(isAllowedRetrievalTenant("platform", []), true);
  assert.equal(isAllowedRetrievalTenant("t1", ["t1", "t2"]), true);
  assert.equal(isAllowedRetrievalTenant("t9", ["t1", "t2"]), false);
  assert.equal(isAllowedRetrievalTenant("", ["t1"]), false);
  assert.equal(isAllowedRetrievalTenant(null, ["t1"]), false);
  assert.equal(isFallbackChunkId("fallback-0"), true);
  assert.equal(isFallbackChunkId("fallback-doc-0"), true);
  assert.equal(isFallbackChunkId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), false);
});

test("sources summary aggregates in code from explicit columns", async () => {
  const rows = [
    { source_type: "human", source_ref: "a", tenant_id: null },
    { source_type: "human", source_ref: "a", tenant_id: null },
    { source_type: "system", source_ref: null, tenant_id: "t1" },
  ];
  const client = { from: () => ({ select: () => ({ is: () => ({ eq: () => ({ limit: () => ({ then: (r) => { r({ data: rows, error: null }); return Promise.resolve(); } }) }) }), not: () => ({ eq: () => ({ limit: () => ({ then: (r) => { r({ data: rows, error: null }); return Promise.resolve(); } }) }) }), limit: () => ({ then: (r) => { r({ data: rows, error: null }); return Promise.resolve(); } }) }) }) };
  const s = await fetchSourcesSummary(client, "all", null);
  assert.deepEqual(s.byType, [{ key: "human", count: 2 }, { key: "system", count: 1 }]);
  assert.deepEqual(s.byRef, [{ key: "a", count: 2 }, { key: "—", count: 1 }]);
  assert.equal(s.scanned, 3);
  assert.equal(s.capped, false);
  const src = fs.readFileSync(path.join(ROOT, "lib/workforce/knowledge.ts"), "utf8");
  assert.ok(!src.includes("knowledge_documents').select('*')"), "no star selects");
});

test("service-role confinement: only the retrieval action reaches it", () => {
  const action = fs.readFileSync(path.join(ROOT, "lib/actions/workforce-knowledge-retrieval.ts"), "utf8");
  assert.ok(action.includes('"use server"'), "action is a server action");
  assert.ok(action.indexOf("await requireAdmin()") !== -1, "requireAdmin first");
  assert.ok(action.indexOf("await requireAdmin()") < action.indexOf("retrieveKnowledge(checked.query"), "gate before retrieval call");
  assert.ok(!/^import.*supabase-admin/m.test(action), "action never imports the service-role client itself");
  assert.ok(action.includes("checkRateLimit"), "action rate-limits");
  assert.ok(action.includes("workforceKnowledgeRetrievalTest"), "uses the new bucket");
  const stageFiles = [
    "lib/workforce/knowledge.ts",
    "app/admin/workforce/knowledge/page.tsx",
    "app/admin/workforce/knowledge/[id]/page.tsx",
    "app/admin/workforce/knowledge/retrieval/page.tsx",
    "app/admin/workforce/knowledge/retrieval/retrieval-test-form.tsx",
  ];
  for (const rel of stageFiles) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.ok(!/^import.*supabase-admin/m.test(src), `${rel} must not touch service-role`);
    assert.ok(!src.includes("createSupabaseAdmin("), `${rel} must not call the service-role factory`);
  }
  const rates = fs.readFileSync(path.join(ROOT, "lib/rate-limit.ts"), "utf8");
  assert.ok(rates.includes("workforceKnowledgeRetrievalTest: { limit: 20, windowSeconds: 60 }"), "bucket defined 20/60s");
  assert.ok(action.includes("const RETRIEVAL_LIMIT = 4"), "retrieval limit fixed at 4");
  assert.ok(action.includes("retrieveKnowledge(checked.query, tenantId, RETRIEVAL_LIMIT)"), "calls retrieveKnowledge unmodified");
  const form = fs.readFileSync(path.join(ROOT, "app/admin/workforce/knowledge/retrieval/retrieval-test-form.tsx"), "utf8");
  assert.ok(form.includes("runRetrievalTest"), "form submits to the gated action");
  assert.ok(!form.includes("dangerouslySetInnerHTML"), "form never renders raw HTML");
});

// ── retrieval wiring (Stage 21 P2 restyle guard) ───────────────────────────
// The retrieval surface keeps the same action, field names, query cap and
// tenant allowlist wiring; only layout classes changed. Non-persisting.
test("retrieval wiring: page gates, form posts query+tenant to runRetrievalTest", () => {
  const page = fs.readFileSync(path.join(ROOT, "app/admin/workforce/knowledge/retrieval/page.tsx"), "utf8");
  assert.ok(!/^"use client"/m.test(page), "retrieval page stays a server component");
  assert.ok(page.includes("await requireAdmin()"), "page gates requireAdmin");
  assert.ok(
    page.indexOf("await requireAdmin()") < page.indexOf("createSupabaseServer()"),
    "gate before data access"
  );
  assert.ok(page.includes("<RetrievalTestForm tenants={tenants} />"), "page renders the form island with server tenants");
  const form = fs.readFileSync(path.join(ROOT, "app/admin/workforce/knowledge/retrieval/retrieval-test-form.tsx"), "utf8");
  assert.ok(form.includes("useActionState") && form.includes("runRetrievalTest"), "form submits via the gated action");
  assert.ok(form.includes('name="query"'), "form posts the query field");
  assert.ok(form.includes("maxLength={300}"), "300-char query cap mirrored in markup");
  assert.ok(form.includes('name="tenant"'), "form posts the tenant field");
  assert.ok(form.includes('value="platform"'), "platform-only option kept");
  for (const w of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
    assert.ok(!form.includes(w), `form must not contain ${w} (non-persisting)`);
  }
});
