/**
 * Stage 14 — AI Studio / Workforce boundary invariant tests (repository-evidence only).
 *
 * Boundary: AI Studio = creation workspace; AI Workforce = employees +
 * operations + management. Shared layers ONLY: provider, tools, knowledge,
 * runtime, guards. These tests fail if:
 *  (a) any tenant-scoped tool definition appears in the Studio-offered lists,
 *  (b) the Studio-offered tool set drifts from the reviewed 9-name snapshot,
 *  (c) the directTool allowlist gains a write-capable tool (or drifts at all),
 *  (d) the fetch/search tools bypass the SSRF/URL guard on any path
 *      (directTool uses the same functions via executeAITool — one path),
 *  (e) the directTool rejection log leaks user text/args or breaks fail-open.
 *
 * Hermetic: source-text evidence only. No imports, no network, no DB.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const REGISTRY = path.join(ROOT, "lib", "ai", "tools-registry.ts");
const CHAT_ROUTE = path.join(ROOT, "app", "api", "ai", "chat", "route.ts");
const TOOLS_DIR = path.join(ROOT, "lib", "ai", "tools");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

// Reviewed snapshot: the exact 9 read-only tools reachable via executeAITool
// (8 public catalog/fetch + admin content-history read). Any addition or
// removal must be a conscious, reviewed boundary change.
const EXPECTED_OFFERED = [
  "fetch_rss_feed",
  "fetch_url_summary",
  "get_active_fundraisers",
  "get_available_products",
  "get_content_history",
  "get_featured_businesses",
  "get_recent_articles",
  "get_upcoming_events",
  "search_trends",
].sort();

// Definition identifier -> tool source file (PUBLIC + ADMIN blocks only).
const OFFERED_DEF_FILES = {
  getUpcomingEventsDefinition: "get_upcoming_events.ts",
  getActiveFundraisersDefinition: "get_active_fundraisers.ts",
  getFeaturedBusinessesDefinition: "get_featured_businesses.ts",
  getRecentArticlesDefinition: "get_recent_articles.ts",
  getAvailableProductsDefinition: "get_available_products.ts",
  getContentHistoryDefinition: "get_content_history.ts",
  fetchUrlSummaryDefinition: "fetch_url_summary.ts",
  fetchRssFeedDefinition: "fetch_rss_feed.ts",
  searchTrendsDefinition: "search_trends.ts",
};

// Write-capable tool names that must NEVER appear in the Studio allowlist.
const WRITE_CAPABLE = [
  "createNotification",
  "notifyOwner",
  "execSmokeNotify",
  "memory_propose",
  "request_qa_run",
];

function toolNameFromFile(file) {
  const src = read(path.join(TOOLS_DIR, file));
  const m = src.match(/name:\s*'([^']+)'/);
  assert.ok(m, `${file} must declare a tool name`);
  return m[1];
}

function allowlistBlock() {
  const src = read(CHAT_ROUTE);
  const start = src.indexOf("STUDIO_DIRECT_TOOL_ALLOWLIST");
  assert.ok(start !== -1, "chat route must define STUDIO_DIRECT_TOOL_ALLOWLIST");
  const end = src.indexOf("]);", start);
  assert.ok(end !== -1, "allowlist literal must terminate");
  return src.slice(start, end);
}

// ── (a) No tenant-scoped definition in Studio-offered lists ─────────────────

test("no TENANT definition identifier appears in PUBLIC or ADMIN lists", () => {
  const registry = read(REGISTRY);
  const tenantStart = registry.indexOf("TENANT_AI_TOOL_DEFINITIONS = [");
  assert.ok(tenantStart !== -1, "TENANT list must exist");
  const tenantEnd = registry.indexOf("];", tenantStart);
  const tenantBlock = registry.slice(tenantStart, tenantEnd);
  const tenantIdents = [...tenantBlock.matchAll(/(\w+Definition)/g)].map((m) => m[1]);
  assert.ok(tenantIdents.length >= 20, `expected 20+ tenant defs, saw ${tenantIdents.length}`);

  const publicStart = registry.indexOf("PUBLIC_AI_TOOL_DEFINITIONS = [");
  const adminStart = registry.indexOf("ADMIN_AI_TOOL_DEFINITIONS");
  const offeredSlice = registry.slice(publicStart, adminStart);
  // PUBLIC block + ADMIN block (up to TENANT list start).
  const adminEnd = registry.indexOf("TENANT_AI_TOOL_DEFINITIONS");
  const offered = registry.slice(publicStart, adminEnd);
  assert.ok(offeredSlice.length > 0, "offered slice must be non-empty");
  for (const ident of new Set(tenantIdents)) {
    assert.ok(!offered.includes(ident), `tenant tool ${ident} must not be Studio-offered`);
  }
});

test("executeAITool fail-closed tenant guard precedes dispatch", () => {
  const registry = read(REGISTRY);
  const guardAt = registry.indexOf("TENANT_TOOL_NAMES.has(name)");
  const switchAt = registry.indexOf("switch (name)");
  assert.ok(guardAt !== -1, "tenant fail-closed guard must exist in executeAITool");
  assert.ok(switchAt !== -1, "executeAITool dispatch switch must exist");
  assert.ok(guardAt < switchAt, "tenant guard must run before dispatch");
});

// ── (b) Snapshot of the Studio-offered 9 ────────────────────────────────────

test("Studio-offered tool names match the reviewed 9-name snapshot", () => {
  const seen = Object.entries(OFFERED_DEF_FILES).map(([, file]) => toolNameFromFile(file));
  assert.deepEqual(seen.sort(), EXPECTED_OFFERED, "offered tool set drifted — review the boundary");
});

test("chat route offers PUBLIC+ADMIN only, never tenant or ALL lists", () => {
  const src = read(CHAT_ROUTE);
  assert.ok(src.includes("PUBLIC_AI_TOOL_DEFINITIONS"), "chat must offer PUBLIC list");
  assert.ok(src.includes("ADMIN_AI_TOOL_DEFINITIONS"), "chat must offer ADMIN list");
  assert.ok(!src.includes("TENANT_AI_TOOL_DEFINITIONS"), "chat must never reference TENANT list");
  assert.ok(!src.includes("ALL_AI_TOOL_DEFINITIONS"), "chat must never offer the ALL list");
});

// ── (c) Allowlist integrity ─────────────────────────────────────────────────

test("directTool allowlist equals the reviewed 9 read-only tools", () => {
  const block = allowlistBlock();
  const names = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(names.sort(), EXPECTED_OFFERED, "allowlist drifted — review the boundary");
});

test("allowlist contains no write-capable tool", () => {
  const block = allowlistBlock();
  for (const name of WRITE_CAPABLE) {
    assert.ok(!block.includes(name), `write-capable tool ${name} must not be allowlisted`);
  }
});

test("every allowlisted tool is executable via executeAITool (no dead entries)", () => {
  const registry = read(REGISTRY);
  const block = allowlistBlock();
  const names = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const name of names) {
    assert.ok(
      registry.includes(`case '${name}':`),
      `allowlisted tool ${name} must have an executeAITool dispatch case`
    );
  }
});

// ── (d) SSRF/URL guard on the fetch path (shared by chat + directTool) ──────

test("fetch tools route through the SSRF guard and map blocks to rejections", () => {
  for (const file of ["fetch_url_summary.ts", "fetch_rss_feed.ts"]) {
    const src = read(path.join(TOOLS_DIR, file));
    assert.ok(src.includes("safeFetchHtml"), `${file} must fetch via safeFetchHtml (SSRF guard)`);
    assert.ok(src.includes("SsrfBlockedError"), `${file} must handle SsrfBlockedError`);
    // Blocked URLs become failure payloads, never thrown exceptions to the caller.
    assert.ok(src.includes("success: false"), `${file} must return failure objects on block`);
  }
});

test("SSRF guard fails closed on literal-IP / link-local / RFC1918 without DNS", () => {
  const guard = read(path.join(ROOT, "lib", "ssrf-guard.ts"));
  for (const cidr of ['"10.0.0.0"', '"127.0.0.0"', '"169.254.0.0"', '"192.168.0.0"']) {
    assert.ok(guard.includes(cidr), `ssrf-guard must block range ${cidr}`);
  }
});

test("search_trends screens external content via input-guard", () => {
  const src = read(path.join(TOOLS_DIR, "search_trends.ts"));
  assert.ok(src.includes("screenUntrustedInput"), "search_trends must screen snippets via input-guard");
});

test("directTool executes through executeAITool — no parallel unguarded path", () => {
  const src = read(CHAT_ROUTE);
  const directAt = src.indexOf("if (directTool)");
  assert.ok(directAt !== -1, "directTool mode must exist");
  const directBlock = src.slice(directAt, src.indexOf("toolCalls:", directAt) !== -1 ? src.length : src.length);
  assert.ok(directBlock.includes("executeAITool(directTool"), "directTool must dispatch via executeAITool");
  // No direct imports of individual tool executors in the route.
  assert.ok(!src.includes("tools/get_upcoming_events"), "route must not import tool executors directly");
  assert.ok(!src.includes("tools/fetch_url_summary"), "route must not import fetch executors directly");
});

// ── (e) Rejection logging: fixed message, no user text, fail-open ───────────

test("directTool rejection logs approval_block with fixed message and tool name only", () => {
  const src = read(CHAT_ROUTE);
  assert.ok(src.includes("DIRECT_TOOL_REJECTION_MESSAGE"), "rejection must use the fixed message const");
  const constDef = src.match(/DIRECT_TOOL_REJECTION_MESSAGE\s*=\s*'([^']+)'/);
  assert.ok(constDef, "fixed message const must be a string literal");
  assert.ok(!constDef[1].includes("${"), "fixed message must not interpolate anything");
  const rejectAt = src.indexOf("studio_direct_tool_denied");
  assert.ok(rejectAt !== -1, "rejection error_code must exist");
  // Isolate the rejection's insertSystemEvent({...}) literal: from the nearest
  // preceding 'void insertSystemEvent({' to its closing '}).catch'.
  const directAt = src.indexOf("if (directTool)");
  const insertAt = src.indexOf("void insertSystemEvent({", directAt);
  const closeAt = src.indexOf("}).catch", insertAt);
  assert.ok(insertAt !== -1 && closeAt !== -1 && insertAt < rejectAt && rejectAt < closeAt,
    "rejection event literal must be locatable");
  const eventSlice = src.slice(insertAt, closeAt);
  assert.ok(eventSlice.includes("kind: 'approval_block'"), "rejection must log approval_block kind");
  assert.ok(eventSlice.includes("tool_name:"), "rejection must carry tool_name");
  assert.ok(!eventSlice.includes("toolArgs"), "rejection event must not include tool args");
  assert.ok(!eventSlice.includes("prompt"), "rejection event must not include prompt text");
});

test("rejection logging is fail-open and executes nothing", () => {
  const src = read(CHAT_ROUTE);
  const directAt = src.indexOf("if (directTool)");
  const window = src.slice(directAt, directAt + 2200);
  assert.ok(window.includes(".catch(() => {})"), "rejection logging must be fail-open");
  const rejectAt = window.indexOf("status: 403");
  assert.ok(rejectAt !== -1, "rejection must return 403");
  const execAt = window.indexOf("executeAITool(directTool");
  assert.ok(execAt !== -1, "allowed path must still execute");
  assert.ok(rejectAt < execAt, "rejection return must precede any execution");
});
