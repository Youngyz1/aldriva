/**
 * Phase 1A hardening regression tests (repository-evidence only).
 *
 * Covers the verified findings from the Phase 1A re-audit:
 * tool-scope honesty, model-visible tool surface, existence-oracle
 * removal, checkout purchasability, webhook exactly-once notify,
 * real product columns, link-integrity migration 115, channel-context
 * strictness, and org-page defense-in-depth.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const DB = path.join(ROOT, "db");
const TENANT_DIR = path.join(ROOT, "lib", "ai", "tools", "tenant");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

// ── Tool scope honesty ──────────────────────────────────────────────────────

test("ALL definitions carry an explicit scope; history is admin-only", () => {
  const registry = read(path.join(ROOT, "lib", "ai", "tools-registry.ts"));
  assert.ok(registry.includes("ADMIN_AI_TOOL_DEFINITIONS"), "admin tier export must exist");
  assert.ok(registry.includes("...PUBLIC_AI_TOOL_DEFINITIONS"), "ALL must preserve public scopes");
  assert.ok(registry.includes("...ADMIN_AI_TOOL_DEFINITIONS"), "ALL must include admin defs");
  const history = read(path.join(ROOT, "lib", "ai", "tools", "get_content_history.ts"));
  assert.ok(history.includes("scope: 'admin'"), "get_content_history must be scope admin");
  // PUBLIC must not smuggle the admin tool back in.
  const publicBlock = registry.slice(
    registry.indexOf("PUBLIC_AI_TOOL_DEFINITIONS"),
    registry.indexOf("ADMIN_AI_TOOL_DEFINITIONS")
  );
  assert.ok(!publicBlock.includes("getContentHistory"), "PUBLIC tier must exclude content history");
});

test("admin chat route offers public+admin tools, never the full ALL list", () => {
  const src = read(path.join(ROOT, "app", "api", "ai", "chat", "route.ts"));
  assert.ok(src.includes("requireAdmin()"), "chat route must stay admin-gated");
  assert.ok(src.includes("PUBLIC_AI_TOOL_DEFINITIONS"), "must offer public tools");
  assert.ok(src.includes("ADMIN_AI_TOOL_DEFINITIONS"), "must offer admin history tool");
  assert.ok(!src.includes("ALL_AI_TOOL_DEFINITIONS"), "must not expose tenant tools to the model");
});

// ── Existence-oracle removal ────────────────────────────────────────────────

test("tenant tools report one not-found message (missing == cross-tenant)", () => {
  const files = fs
    .readdirSync(TENANT_DIR)
    .filter((f) => f.startsWith("tenant-") && f.endsWith(".ts"));
  for (const f of files) {
    const src = read(path.join(TENANT_DIR, f));
    const throws = src.split("\n").filter((l) => l.includes("throw new Error"));
    for (const line of throws) {
      assert.ok(
        !line.includes("in this tenant"),
        `${f}: user-facing error must not distinguish tenancy: ${line.trim()}`
      );
      assert.ok(
        !/cross-tenant/i.test(line),
        `${f}: user-facing error must not say cross-tenant: ${line.trim()}`
      );
    }
  }
});

// ── Checkout purchasability ─────────────────────────────────────────────────

for (const route of [
  "app/api/checkout/product/route.ts",
  "app/api/checkout/product-crypto/route.ts",
]) {
  test(`${route} blocks unapproved products from purchase`, () => {
    const src = read(path.join(ROOT, route));
    assert.ok(
      src.includes('product.status !== "active"') && src.includes('"out_of_stock"'),
      `${route} must allowlist active/out_of_stock`
    );
  });
}

// ── Webhook exactly-once notify ─────────────────────────────────────────────

test("legacy Stripe donation session path notifies only on insert", () => {
  const src = read(path.join(ROOT, "app", "api", "webhooks", "stripe", "route.ts"));
  const idx = src.indexOf('meta.kind === "donation"');
  assert.ok(idx !== -1, "donation session branch must exist");
  const block = src.slice(idx, src.indexOf('meta.kind === "business"', idx));
  assert.ok(block.includes("recordDonationFromSession(session)"), "must record via RPC helper");
  assert.ok(block.includes("!record.inserted") || block.includes("!result.inserted") || block.includes(".inserted"), "must gate fan-out on inserted");
  assert.ok(block.includes("return;"), "must return early when not inserted");
});

// ── Real product columns ────────────────────────────────────────────────────

test("public product tool selects only real products columns", () => {
  const src = read(path.join(ROOT, "lib", "ai", "tools", "get_available_products.ts"));
  for (const real of ["name", "price_type", "stock_quantity", "status"]) {
    assert.ok(src.includes(real), `must select real column ${real}`);
  }
  for (const fake of ["cover_image", "max_price"]) {
    assert.ok(!src.includes(fake), `must not reference nonexistent ${fake}`);
  }
  assert.ok(!src.includes("row.title") && !src.includes("title:"), "shape must not promise title");
});

test("promotion engine product provider selects real columns", () => {
  const src = read(path.join(ROOT, "lib", "promotionEngine.js"));
  assert.ok(src.includes("'id, name, slug, description, images, price_type'"), "must select real columns");
  assert.ok(!src.includes("cover_image, price, category"), "must not select phantom columns");
});

test("tenant fundraising reads both raised columns", () => {
  const src = read(path.join(TENANT_DIR, "tenant-fundraising.ts"));
  assert.ok(src.includes("raised,"), "must select live raised column");
  assert.ok(src.includes("raised_amount"), "must keep legacy raised_amount");
});

// ── Migration 115 link integrity ────────────────────────────────────────────

test("migration 115 enforces conversation link tenancy + parent lock", () => {
  const fwd = path.join(DB, "migration_115_conversation_link_integrity.sql");
  const rb = path.join(DB, "migration_115_conversation_link_integrity_rollback.sql");
  assert.ok(fs.existsSync(fwd), "forward migration must exist");
  assert.ok(fs.existsSync(rb), "rollback must exist");
  const sql = read(fwd);
  assert.ok(sql.includes("enforce_conversation_link_tenant"), "link trigger function");
  assert.ok(sql.includes("channel_asset_id"), "must check asset tenancy");
  assert.ok(sql.includes("customer_identity_id"), "must check identity tenancy");
  assert.ok(sql.includes("prevent_connected_account_tenant_change"), "parent lock function");
  assert.ok(!sql.includes("ALTER TABLE"), "must not alter tables (triggers only)");
  const rollback = read(rb);
  assert.ok(rollback.includes("DROP TRIGGER"), "rollback must drop triggers");
  assert.ok(!rollback.includes("DROP TABLE"), "rollback must not drop tables");
});

// ── Channel context strictness ──────────────────────────────────────────────

test("createToolContext requires a real user id (no viewer mint)", () => {
  const src = read(path.join(ROOT, "lib", "tenant-context.ts"));
  assert.ok(!src.includes("role = 'viewer'"), "must not mint viewer role");
  assert.ok(src.includes("Access denied: unknown user"), "non-UUID userId must fail closed");
});

test("executeTenantTool validates UUID strictness before dispatch", () => {
  const src = read(path.join(ROOT, "lib", "ai", "tools-registry.ts"));
  const fnIdx = src.indexOf("export async function executeTenantTool");
  const gate = src.slice(fnIdx, src.indexOf("switch (name)", fnIdx));
  assert.ok(gate.includes("0-9a-f"), "dispatch gate must UUID-validate tenantId");
  assert.ok(gate.includes("failed_closed"), "denial must audit-log");
});

// ── Org page defense-in-depth ───────────────────────────────────────────────

for (const page of [
  "app/dashboard/org/[id]/products/page.tsx",
  "app/dashboard/organizations/[slug]/products/page.tsx",
]) {
  test(`${page} re-checks org ownership page-side`, () => {
    const src = read(path.join(ROOT, page));
    assert.ok(src.includes("getCurrentUser()"), `${page} must resolve the caller`);
    assert.ok(
      src.includes("org.user_id !== user.id"),
      `${page} must deny cross-tenant id/slug`
    );
  });
}

// ── Provider comment honesty ────────────────────────────────────────────────

test("tenant provider documents fail-open routing honestly", () => {
  const src = read(path.join(ROOT, "lib", "ai", "tenant-provider.ts"));
  assert.ok(!/fail closed/i.test(src), "must not claim fail-closed for default fallback");
  assert.ok(src.includes("getAIProvider"), "must still wrap the factory");
});
