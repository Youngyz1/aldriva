/**
 * P2 F-12 static regression tests: handle_new_user() must not be directly
 * callable by anon/authenticated.
 *
 * Previous exposure: the signup trigger function on auth.users carried
 * EXECUTE for anon and authenticated via bootstrap default privileges (plus
 * explicit GRANT ALL lines in schema.sql). Direct RPC calls are essentially
 * inert, but it is unnecessary public surface on a SECURITY DEFINER
 * function. Migration 107 revokes it with a plain REVOKE (not DROP+CREATE,
 * so default privileges cannot re-grant it), leaving service_role/postgres
 * untouched so the trigger keeps firing.
 *
 * Repository evidence only (no database connection); the migration was NOT
 * applied to production.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const CANON = path.join(ROOT, "db", "migration_107_handle_new_user_revoke_public_execute.sql");
const MIRROR = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260912000000_migration_107_handle_new_user_revoke_public_execute.sql"
);
const ROLLBACK = path.join(ROOT, "db", "migration_107_handle_new_user_revoke_public_execute_rollback.sql");

const sql = fs.readFileSync(CANON, "utf8");
const mirrorSql = fs.readFileSync(MIRROR, "utf8");

test("migration files exist in both tracks with rollback", () => {
  assert.ok(fs.existsSync(CANON), "canonical db/ migration must exist");
  assert.ok(fs.existsSync(MIRROR), "supabase/migrations mirror must exist");
  assert.ok(fs.existsSync(ROLLBACK), "rollback must exist");
});

test("mirror matches canonical body (header may differ)", () => {
  const ANCHOR = "P2 F-12";
  assert.ok(sql.includes(ANCHOR) && mirrorSql.includes(ANCHOR));
  assert.equal(
    mirrorSql.slice(mirrorSql.indexOf(ANCHOR)),
    sql.slice(sql.indexOf(ANCHOR)),
    "mirror body must equal canonical body"
  );
});

test("public EXECUTE is revoked and never re-granted", () => {
  assert.ok(
    sql.includes("REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;"),
    "must revoke EXECUTE from anon and authenticated"
  );
  // Production verification showed a direct grant to the PUBLIC pseudo-role,
  // which every role inherits: per-role revokes alone left the function
  // callable. The migration must revoke FROM PUBLIC explicitly.
  assert.ok(
    sql.includes("REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;"),
    "must revoke EXECUTE from PUBLIC (inherited by all roles)"
  );
  const codeOnly = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  assert.ok(!/DROP\s+FUNCTION/i.test(codeOnly), "must not DROP the function (would re-trigger default grants on recreate)");
  assert.ok(
    !/GRANT\s+EXECUTE[\s\S]*?TO\s+(anon|authenticated)/i.test(codeOnly),
    "migration must not grant EXECUTE to anon/authenticated"
  );
  assert.ok(!/service_role|postgres/i.test(codeOnly), "revoke must not touch service_role/postgres");
});
