/**
 * Static regression tests for migration_280_function_grant_hardening.sql.
 *
 * Background: a live pg_proc.proacl audit found check_email_pending_deletion
 * still executable by anon/authenticated via a standing PUBLIC grant, even
 * though migration_104 explicitly revoked EXECUTE from anon and
 * authenticated by name. In Postgres, REVOKE ... FROM <role> does not
 * remove a separate PUBLIC grant entry -- has_function_privilege(role, ...)
 * is true if either the role's own ACL entry or the PUBLIC entry grants it.
 * migration_280 is NOT allowed to repeat that mistake for any function it
 * touches: every REVOKE ... FROM ... that names anon or authenticated must
 * also name PUBLIC in the same statement.
 *
 * migration_104 itself is left untouched (it already does the right thing
 * for search_path and the anon/authenticated revoke; the PUBLIC gap it left
 * open is closed by migration_280, not by rewriting 104's history).
 *
 * These are repository-evidence assertions only (no database connection).
 * Functional verification against a real Supabase project remains an
 * operator step -- see db/migration_280_function_grant_hardening_verification.sql.
 * Migration 280 was NOT applied to any environment.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const CANON = path.join(ROOT, "db", "migration_280_function_grant_hardening.sql");
const MIRROR = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20261127120000_migration_280_function_grant_hardening.sql"
);
const ROLLBACK = path.join(ROOT, "db", "migration_280_function_grant_hardening_rollback.sql");
const VERIFICATION = path.join(ROOT, "db", "migration_280_function_grant_hardening_verification.sql");
const MIGRATION_104 = path.join(ROOT, "db", "migration_104_signup_guard_function_hardening.sql");
const SEATING_SERVER = path.join(ROOT, "lib", "seating-server.ts");
const BUSINESSES_ACTION = path.join(ROOT, "lib", "actions", "businesses.ts");

const sql = fs.readFileSync(CANON, "utf8");
const mirrorSql = fs.readFileSync(MIRROR, "utf8");

/**
 * Pulls every top-level `REVOKE ... ON FUNCTION <name>(...) FROM <roles>;`
 * statement out of a migration body and returns { fn, roles[] } per match.
 */
function extractRevokes(text) {
  const codeOnly = text
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
  const re = /REVOKE\s+ALL\s+ON\s+FUNCTION\s+([a-zA-Z0-9_.]+)\s*\([^)]*\)\s+FROM\s+([^;]+);/gi;
  const out = [];
  let m;
  while ((m = re.exec(codeOnly)) !== null) {
    out.push({
      fn: m[1].replace(/^public\./, ""),
      roles: m[2].split(",").map((r) => r.trim().toLowerCase()),
    });
  }
  return out;
}

test("migration files exist in both tracks with rollback and verification", () => {
  assert.ok(fs.existsSync(CANON), "canonical db/ migration must exist");
  assert.ok(fs.existsSync(MIRROR), "supabase/migrations mirror must exist");
  assert.ok(fs.existsSync(ROLLBACK), "rollback must exist");
  assert.ok(fs.existsSync(VERIFICATION), "verification SQL must exist");
});

test("mirror matches canonical body (header may differ)", () => {
  const ANCHOR = "Closes four live grant gaps";
  assert.ok(sql.includes(ANCHOR) && mirrorSql.includes(ANCHOR));
  assert.equal(
    mirrorSql.slice(mirrorSql.indexOf(ANCHOR)),
    sql.slice(sql.indexOf(ANCHOR)),
    "mirror body must equal canonical body"
  );
});

test("every REVOKE touching anon or authenticated also names PUBLIC", () => {
  const revokes = extractRevokes(sql);
  assert.ok(revokes.length >= 4, "expected at least 4 REVOKE statements in migration_280");

  for (const { fn, roles } of revokes) {
    const touchesAnonOrAuthenticated = roles.includes("anon") || roles.includes("authenticated");
    if (touchesAnonOrAuthenticated) {
      assert.ok(
        roles.includes("public"),
        `REVOKE on ${fn} names anon/authenticated without also naming PUBLIC -- ` +
          `this is exactly the migration_104 gap migration_280 exists to close`
      );
    }
  }
});

test("service_role keeps EXECUTE on all four functions; anon is revoked on all four", () => {
  const codeOnly = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  for (const fn of [
    "check_email_pending_deletion",
    "reserve_seats_atomic",
    "assign_seat_to_invitation_atomic",
    "ensure_business_organizer",
  ]) {
    const revokeRe = new RegExp(
      `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+(public\\.)?${fn}\\s*\\([^)]*\\)\\s+FROM\\s+([^;]+);`,
      "i"
    );
    const grantRe = new RegExp(
      `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+(public\\.)?${fn}\\s*\\([^)]*\\)\\s+TO\\s+([^;]+);`,
      "i"
    );
    const revokeMatch = codeOnly.match(revokeRe);
    const grantMatch = codeOnly.match(grantRe);
    assert.ok(revokeMatch, `expected a REVOKE statement for ${fn}`);
    assert.ok(grantMatch, `expected a GRANT statement for ${fn}`);

    const revokedRoles = revokeMatch[2].split(",").map((r) => r.trim().toLowerCase());
    const grantedRoles = grantMatch[2].split(",").map((r) => r.trim().toLowerCase());

    assert.ok(revokedRoles.includes("anon"), `${fn} must revoke anon`);
    assert.ok(grantedRoles.includes("service_role"), `${fn} must grant service_role`);
  }
});

test("authenticated keeps EXECUTE only on ensure_business_organizer, not the other three", () => {
  const codeOnly = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  const grantEnsure = codeOnly.match(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+ensure_business_organizer\s*\([^)]*\)\s+TO\s+([^;]+);/i
  );
  assert.ok(grantEnsure, "expected a GRANT statement for ensure_business_organizer");
  assert.ok(
    grantEnsure[1].toLowerCase().includes("authenticated"),
    "ensure_business_organizer must keep authenticated (trg_link_business_organizer runs as the inserting authenticated role)"
  );

  for (const fn of ["check_email_pending_deletion", "reserve_seats_atomic", "assign_seat_to_invitation_atomic"]) {
    const revokeMatch = codeOnly.match(
      new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+(public\\.)?${fn}\\s*\\([^)]*\\)\\s+FROM\\s+([^;]+);`, "i")
    );
    assert.ok(revokeMatch, `expected a REVOKE statement for ${fn}`);
    assert.ok(
      revokeMatch[2].toLowerCase().includes("authenticated"),
      `${fn} must revoke authenticated (no non-service caller found in the codebase)`
    );
  }
});

test("ensure_business_organizer gains the owner/caller guard", () => {
  assert.ok(
    sql.includes("auth.role() <> 'service_role'") &&
      sql.includes("business_row.owner_id IS DISTINCT FROM auth.uid()"),
    "must guard the direct-RPC composite-argument path with the repo's auth.role() <> 'service_role' idiom"
  );
});

test("reserve_seats_atomic clamps hold duration and bounds the seat list", () => {
  assert.ok(
    sql.includes("LEAST(GREATEST(p_hold_duration_minutes, 1), 15)"),
    "must clamp p_hold_duration_minutes to [1, 15]"
  );
  assert.ok(
    sql.includes("cardinality(p_seat_ids) > 20") && sql.includes("TOO_MANY_SEATS"),
    "must reject seat lists longer than 20"
  );
});

test("migration_104 is not edited by this change", () => {
  assert.ok(fs.existsSync(MIGRATION_104), "migration_104 must still exist");
  const text = fs.readFileSync(MIGRATION_104, "utf8");
  assert.ok(
    text.includes("REVOKE EXECUTE ON FUNCTION public.check_email_pending_deletion(text) FROM anon, authenticated;"),
    "migration_104's original revoke statement must be untouched -- the PUBLIC gap it left open is closed by migration_280, not by rewriting 104"
  );
});

test("both narrowed RPCs are still only called via the service-role client", () => {
  const seating = fs.readFileSync(SEATING_SERVER, "utf8");
  assert.ok(seating.includes('admin.rpc("reserve_seats_atomic"'), "reserve_seats_atomic must be called via the admin client");
  assert.ok(
    seating.includes('"assign_seat_to_invitation_atomic"'),
    "assign_seat_to_invitation_atomic must be called via the admin client"
  );
  assert.ok(
    seating.includes("createSupabaseAdmin()"),
    "lib/seating-server.ts must use the service-role client"
  );

  const businesses = fs.readFileSync(BUSINESSES_ACTION, "utf8");
  assert.ok(
    businesses.includes("owner_id: user.id"),
    "the only businesses INSERT path must set owner_id from the authenticated session user"
  );
});
