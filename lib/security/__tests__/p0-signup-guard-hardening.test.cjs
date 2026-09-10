/**
 * P1 F-05 static regression tests: signup-guard function hardening.
 *
 * Previous exposure: public.check_email_pending_deletion(text) was
 * SECURITY DEFINER with no SET search_path (search_path-hijack hardening
 * gap), and was directly callable via /rest/v1/rpc/... by anon and
 * authenticated through the Supabase bootstrap default privileges — an
 * account-enumeration oracle, since the response differs for emails in the
 * deletion flow. POST /api/signup-guard also returned raw error.message
 * to the client on DB failure.
 *
 * These tests assert repository evidence only (no database connection): the
 * 104 migration must pin search_path and revoke public EXECUTE, the mirror
 * must stay in sync, and the route must call via the service-role client
 * while returning a generic 500 message. Functional verification against a
 * real Supabase project remains an operator step (see migration header);
 * the migration was NOT applied to production.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const CANON = path.join(ROOT, "db", "migration_104_signup_guard_function_hardening.sql");
const MIRROR = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260909000000_migration_104_signup_guard_function_hardening.sql"
);
const ROLLBACK = path.join(ROOT, "db", "migration_104_signup_guard_function_hardening_rollback.sql");
const ROUTE = path.join(ROOT, "app", "api", "signup-guard", "route.ts");
const CTX = path.join(ROOT, "lib", "dashboard-context.ts");

const sql = fs.readFileSync(CANON, "utf8");
const mirrorSql = fs.readFileSync(MIRROR, "utf8");
const route = fs.readFileSync(ROUTE, "utf8");

test("migration files exist in both tracks with rollback", () => {
  assert.ok(fs.existsSync(CANON), "canonical db/ migration must exist");
  assert.ok(fs.existsSync(MIRROR), "supabase/migrations mirror must exist");
  assert.ok(fs.existsSync(ROLLBACK), "rollback must exist");
});

test("mirror matches canonical body (header may differ)", () => {
  const ANCHOR = "P1 F-05";
  assert.ok(sql.includes(ANCHOR) && mirrorSql.includes(ANCHOR));
  assert.equal(
    mirrorSql.slice(mirrorSql.indexOf(ANCHOR)),
    sql.slice(sql.indexOf(ANCHOR)),
    "mirror body must equal canonical body"
  );
});

test("search_path is pinned on the definer function", () => {
  assert.ok(
    sql.includes("ALTER FUNCTION public.check_email_pending_deletion(text) SET search_path = public;"),
    "must pin search_path = public (repo convention)"
  );
});

test("public EXECUTE is revoked and never re-granted", () => {
  assert.ok(
    sql.includes("REVOKE EXECUTE ON FUNCTION public.check_email_pending_deletion(text) FROM anon, authenticated;"),
    "must revoke EXECUTE from anon and authenticated"
  );
  const codeOnly = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  assert.ok(
    !/GRANT\s+EXECUTE[\s\S]*?TO\s+(anon|authenticated)/i.test(codeOnly),
    "migration must not grant EXECUTE to anon/authenticated"
  );
});

test("route calls the RPC via the service-role client", () => {
  assert.ok(route.includes("supabaseAdmin.rpc("), "route must use the service-role client");
  const ctx = fs.readFileSync(CTX, "utf8");
  assert.ok(ctx.includes("SUPABASE_SERVICE_ROLE_KEY"), "client must be keyed by the service-role key");
});

test("route returns a generic 500 message and logs details server-side", () => {
  assert.ok(!route.includes("error: error.message"), "must not return raw error text");
  assert.ok(!route.includes("error.message }"), "must not interpolate raw error text into responses");
  assert.ok(
    route.includes("Something went wrong. Please try again."),
    "must return a generic client message"
  );
  assert.ok(route.includes("console.error("), "must still log details server-side");
  assert.ok(route.includes("{ status: 500 }"), "must preserve the 500 status code");
});
