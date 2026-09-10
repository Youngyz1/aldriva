/**
 * P0 F-03 follow-up regression tests: organizers least-privilege grants.
 *
 * Previous exposure: migration 101 narrowed RLS policies and SELECT grants on
 * public.organizers but left the Supabase-default GRANT ALL baseline intact,
 * so anon/authenticated kept table-level INSERT/UPDATE/DELETE/TRUNCATE/
 * REFERENCES/TRIGGER plus residual column INSERT/REFERENCES (including on
 * tax_id). Combined with the USING-only owner UPDATE policy, an organizer
 * owner could write capability, lifecycle, and registration columns on their
 * own row via REST, bypassing admin-only server paths.
 *
 * These tests assert repository evidence only (no database connection): the
 * 103 migration must strip table- and column-level privileges down to the
 * traced least-privilege set. Functional verification against a real Supabase
 * project remains an operator step (see migration header).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const CANON = path.join(ROOT, "db", "migration_103_organizer_grant_least_privilege.sql");
const MIRROR = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260908000000_migration_103_organizer_grant_least_privilege.sql"
);
const ROLLBACK = path.join(ROOT, "db", "migration_103_organizer_grant_least_privilege_rollback.sql");

const sql = fs.readFileSync(CANON, "utf8");
const mirrorSql = fs.readFileSync(MIRROR, "utf8");

const PROTECTED_COLUMNS = [
  "tax_id",
  "nonprofit_registration_number",
  "fundraising_approved",
  "fundraising_approved_at",
  "payment_enabled",
  "payment_enabled_at",
  "is_business_auto_created",
  "purge_at",
  "deleted_at",
];

const OWNER_WRITE_COLUMNS = [
  "name", "slug", "bio", "photo", "banner", "org_type", "contact_email",
  "website", "facebook", "twitter", "instagram", "linkedin", "youtube",
  "tiktok", "visibility",
];

function parenList(stmt) {
  const match = stmt.match(/\(([^;]*?)\)\s*ON public\.organizers/s);
  assert.ok(match, "grant statement must contain a column list");
  return match[1].split(",").map((c) => c.trim()).filter(Boolean);
}

function grantBlock(kind, role) {
  const re = new RegExp(`GRANT ${kind} \\([\\s\\S]*?\\)\\s*ON public\\.organizers TO ${role};`);
  const match = sql.match(re);
  assert.ok(match, `must contain GRANT ${kind} (...) TO ${role}`);
  return parenList(match[0]);
}

test("migration files exist in both tracks with rollback", () => {
  assert.ok(fs.existsSync(CANON), "canonical db/ migration must exist");
  assert.ok(fs.existsSync(MIRROR), "supabase/migrations mirror must exist");
  assert.ok(fs.existsSync(ROLLBACK), "rollback must exist");
});

test("mirror matches canonical body (header may differ)", () => {
  const ANCHOR = "P0 F-03 follow-up";
  assert.ok(sql.includes(ANCHOR) && mirrorSql.includes(ANCHOR));
  assert.equal(
    mirrorSql.slice(mirrorSql.indexOf(ANCHOR)),
    sql.slice(sql.indexOf(ANCHOR)),
    "mirror body must equal canonical body"
  );
});

test("table-level privileges are revoked for anon and authenticated", () => {
  assert.ok(
    sql.includes("REVOKE ALL ON TABLE public.organizers FROM anon, authenticated;"),
    "must revoke all table-level privileges"
  );
});

test("column-level remnants are revoked", () => {
  assert.ok(sql.includes("REVOKE ALL ("), "must revoke column-level remnants");
  for (const col of PROTECTED_COLUMNS) {
    const revokeSection = sql.slice(sql.indexOf("REVOKE ALL ("), sql.indexOf(") ON public.organizers"));
    assert.ok(revokeSection.includes(col), `revoke list must cover ${col}`);
  }
});

test("anon receives SELECT only — no write grants of any kind", () => {
  assert.ok(!/GRANT (INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b[\s\S]*?TO anon/i.test(sql),
    "anon must receive no write privileges");
});

test("authenticated receives no DELETE/TRUNCATE/REFERENCES/TRIGGER", () => {
  for (const kind of ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
    assert.ok(!new RegExp(`GRANT ${kind}\\b[\\s\\S]*?TO authenticated`, "i").test(sql),
      `authenticated must not receive ${kind}`);
  }
});

test("protected columns are absent from every write grant", () => {
  // fundraising_approved is intentionally SELECT-readable (create-fundraiser
  // flow); it must never be INSERT/UPDATE-writable by anon/authenticated.
  const codeOnly = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  const grantStmts = codeOnly.match(/GRANT (?:INSERT|UPDATE) \([\s\S]*?\) ON public\.organizers TO (?:anon|authenticated)[\s\S]*?;/g) || [];
  assert.ok(grantStmts.length >= 2, "expected INSERT and UPDATE grants");
  for (const col of PROTECTED_COLUMNS) {
    for (const stmt of grantStmts) {
      const cols = parenList(stmt);
      assert.ok(!cols.includes(col), `${col} must not appear in: ${stmt.slice(0, 60)}...`);
    }
  }
});

test("INSERT grant covers exactly the traced create-organizer payload", () => {
  const cols = grantBlock("INSERT", "authenticated");
  assert.ok(cols.includes("user_id"), "INSERT must allow user_id (ownership binding)");
  for (const col of OWNER_WRITE_COLUMNS) {
    assert.ok(cols.includes(col), `INSERT must allow ${col}`);
  }
  assert.equal(cols.length, OWNER_WRITE_COLUMNS.length + 1, "INSERT must grant nothing beyond traced payload");
});

test("UPDATE grant covers exactly the traced settings payload plus updated_at", () => {
  const cols = grantBlock("UPDATE", "authenticated");
  for (const col of OWNER_WRITE_COLUMNS) {
    assert.ok(cols.includes(col), `UPDATE must allow ${col}`);
  }
  assert.ok(cols.includes("updated_at"), "UPDATE must allow updated_at (invoker-rights trigger)");
  assert.ok(!cols.includes("user_id"), "UPDATE must not allow user_id (ownership transfer)");
  assert.equal(cols.length, OWNER_WRITE_COLUMNS.length + 1, "UPDATE must grant nothing beyond traced payload");
});

test("SELECT grant preserves the public read surface", () => {
  const anonSelect = sql.match(/GRANT SELECT \([\s\S]*?\) ON public\.organizers TO anon, authenticated;/);
  assert.ok(anonSelect, "must grant public SELECT list");
  const cols = parenList(anonSelect[0]);
  for (const col of ["id", "name", "slug", "bio", "visibility", "fundraising_approved"]) {
    assert.ok(cols.includes(col), `SELECT must keep ${col}`);
  }
});
