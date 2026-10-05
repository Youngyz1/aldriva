/**
 * Stage 22B — gateway admin-only gate tests (hermetic static scans).
 *
 * POST /api/ai/gateway previously admitted any signed-in user
 * (requireAuthUser). It now admits admins only: 401 unauthenticated,
 * 403 authenticated non-admin — the app/api/admin/* convention
 * (identity-verifications 401/403 split). The gate runs before body
 * parsing, rate limiting, and all data access; the admin path
 * (allowlist, tenant fail-closed, orchestrate, approval/guard audit)
 * is otherwise unchanged.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../..");
const SRC = fs.readFileSync(path.join(ROOT, "app", "api", "ai", "gateway", "route.ts"), "utf8");

test("auth-user gate is gone; admin gate returns 401/403 per API convention", () => {
  assert.ok(!SRC.includes("requireAuthUser"), "requireAuthUser must be replaced");
  assert.ok(SRC.includes("isAdmin()"), "gate must use the admin check from lib/auth");
  assert.ok(SRC.includes("{ error: 'Unauthorized' }") && SRC.includes("status: 401"), "null user -> 401 Unauthorized");
  assert.ok(SRC.includes("{ error: 'Forbidden' }") && SRC.includes("status: 403"), "non-admin -> 403 Forbidden");
  assert.ok(!SRC.includes("redirect("), "API route must return JSON statuses, never redirect()");
});

test("gate runs before parsing, rate limiting, and all data access", () => {
  const post = SRC.slice(SRC.indexOf("export async function POST"));
  const gateAt = post.indexOf("await requireAdminUser()");
  assert.ok(gateAt !== -1, "POST must call the admin gate");
  for (const [marker, label] of [
    ["enforceRateLimit", "rate limiting"],
    ["req.json", "body parsing"],
    ["getAgentByName", "agent resolution"],
    ["orchestrate(", "orchestration"],
  ]) {
    const at = post.indexOf(marker);
    assert.ok(at !== -1, `${label} (${marker}) must still exist`);
    assert.ok(gateAt < at, `admin gate must run before ${label}`);
  }
  const get = SRC.slice(SRC.indexOf("export async function GET"), SRC.indexOf("export async function POST"));
  assert.ok(get.includes("await requireAdminUser()"), "GET must call the admin gate");
  assert.ok(get.indexOf("await requireAdminUser()") < get.indexOf("listAgents()"), "GET gate must run before any read");
});

test("non-admin is rejected for every allowlisted agent; admin path unchanged", () => {
  for (const agent of ["dylan", "sentinel", "qa"]) {
    assert.ok(SRC.includes(`'${agent}'`), `agent allowlist must still contain ${agent}`);
  }
  const post = SRC.slice(SRC.indexOf("export async function POST"));
  assert.ok(
    post.indexOf("await requireAdminUser()") < post.indexOf("allowedAgents"),
    "gate precedes the allowlist, so non-admins get 403 for dylan/sentinel/qa alike"
  );
  assert.ok(post.includes("orchestrate({"), "admin path still delegates to orchestrate()");
  assert.ok(post.includes("approvalRequired: true") && post.includes("status: 403"), "approval-gated 403 branch intact");
  assert.ok(post.includes("guard_rejection") && post.includes("status: 422"), "guard-rejection 422 branch intact");
  assert.ok(post.includes("resolveTenantContext") || post.includes("tenantId must be a valid UUID"), "tenant fail-closed intact");
});
