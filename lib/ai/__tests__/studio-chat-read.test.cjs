/**
 * Stage 22 (P4b) — Studio chat thread read-back tests (hermetic).
 *
 * Source-scan only: no database, no network, no route imports. Pins the
 * GET /api/ai/conversations/[id] contract: admin gate first, one shared
 * 404 body for malformed/unknown/unowned ids, explicit column allowlist
 * (never select('*'), never payload fields), bounded newest-200 window
 * with a truncated flag, session client (owner RLS) instead of any
 * service-role path, and generic error bodies only (no new p1 pins).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const ROUTE = path.join(ROOT, "app", "api", "ai", "conversations", "[id]", "route.ts");
const src = fs.readFileSync(ROUTE, "utf8");

function getFn() {
  const start = src.indexOf("export async function GET");
  assert.ok(start !== -1, "GET handler exists on conversations/[id]");
  return src.slice(start);
}

test("GET gate-first: 401/403 JSON, isAdmin before parsing, per-user bucket", () => {
  const fn = getFn();
  assert.ok(fn.includes("await gate(req)"), "gate runs first");
  assert.ok(fn.indexOf("await gate(req)") < fn.indexOf("await params"), "gate before params");
  assert.ok(src.includes("{ error: 'Unauthorized' }") && src.includes("status: 401"), "401 unauthenticated");
  assert.ok(src.includes("isAdmin()") && src.includes("{ error: 'Forbidden' }"), "403 non-admin");
  assert.ok(src.includes("enforceRateLimit('studioChat', req, user.id)"), "bucket keyed by user id");
  assert.ok(!src.includes("requireAdmin()"), "returns JSON statuses, never redirect()");
});

test("malformed, unknown and unowned ids share one 404 body", () => {
  const fn = getFn();
  assert.ok(fn.includes("isConversationId(id)"), "UUID shape check before any query");
  assert.ok(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test("123e4567-e89b-12d3-a456-426614174000"),
    "shape check accepts UUIDs"
  );
  assert.ok(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test("not-a-uuid"), "shape check rejects junk");
  const notFound = fn.split("{ error: 'Conversation not found' }").length - 1;
  assert.ok(notFound >= 2, `one 404 body for malformed + missing/unowned (found ${notFound})`);
  assert.ok(!fn.includes("not owned") && !fn.includes("does not exist"), "no oracle distinguishing unowned from unknown");
});

test("explicit column list: never select('*'), never payload fields", () => {
  const fn = getFn();
  assert.ok(!fn.includes("select('*')") && !fn.includes('select("*")'), "no select('*')");
  // Allowlist constants live at module scope (shared, single definition).
  assert.ok(
    src.includes("'seq,role,content,tool_name,guard_verdict,guard_reason,provider,created_at'"),
    "message column allowlist is explicit"
  );
  assert.ok(fn.includes(".select(MESSAGE_COLUMNS)"), "GET selects through the allowlist constant");
  for (const banned of ["result", "payload", "tool_args", "quarantinedContent", "snippet", "snapshot", "secret", "embedding"]) {
    assert.ok(!fn.includes(banned), `GET never selects ${banned}`);
  }
});

test("bounded newest-200 window, oldest-first, truncated flag", () => {
  const fn = getFn();
  assert.ok(src.includes("const READ_WINDOW = 200"), "window is 200");
  assert.ok(fn.includes(".order('seq', { ascending: false })"), "newest rows selected first");
  assert.ok(fn.includes(".limit(READ_WINDOW + 1)"), "one extra row detects overflow");
  assert.ok(fn.includes(".slice(0, READ_WINDOW).reverse()"), "capped then returned oldest-first");
  assert.ok(fn.includes("truncated"), "truncated flag returned");
});

test("session client only: owner RLS applies, no service role", () => {
  const fn = getFn();
  assert.ok(fn.includes("createSupabaseServer()"), "session client (owner RLS)");
  for (const banned of ["supabase-admin", "service_role", "SERVICE_ROLE", "serviceRole"]) {
    assert.ok(!src.includes(banned), `route never touches ${banned}`);
  }
});

test("generic errors only: no raw internals, no new p1 pins", () => {
  const fn = getFn();
  assert.ok(!fn.includes(".message"), "GET never reads err.message");
  assert.ok(!fn.includes("console.error"), "GET never server-logs raw text");
  const generics = fn.split("{ error: 'AI service error. Please try again.' }").length - 1;
  assert.ok(generics >= 2, `storage failures share the generic 500 body (found ${generics})`);
});
