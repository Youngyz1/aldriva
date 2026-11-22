const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const read = (rel) => fs.readFileSync(path.resolve(ROOT, rel), "utf8");
const migration212 = read("db/migration_212_scan_codes.sql");
const rollback212 = read("db/migration_212_scan_codes_rollback.sql");

test("scan_codes: RLS enabled with no policies, service_role-only grants", () => {
  assert.match(migration212, /ALTER TABLE public\.scan_codes ENABLE ROW LEVEL SECURITY/);
  assert.match(migration212, /REVOKE ALL ON TABLE public\.scan_codes FROM PUBLIC, anon, authenticated/);
  assert.match(migration212, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.scan_codes TO service_role/);
  assert.doesNotMatch(migration212, /CREATE POLICY[^;]*scan_codes/i);
});

test("scan_codes: foreign keys cascade to orders/reservations, branch FK sets null", () => {
  assert.match(migration212, /order_id uuid NULL REFERENCES public\.orders\(id\) ON DELETE CASCADE/);
  assert.match(migration212, /reservation_id uuid NULL REFERENCES public\.reservations\(id\) ON DELETE CASCADE/);
  assert.match(migration212, /branch_id uuid NULL REFERENCES public\.business_branches\(id\) ON DELETE SET NULL/);
});

test("scan_codes: subject_id is a generated column coalescing order/reservation", () => {
  assert.match(migration212, /subject_id uuid GENERATED ALWAYS AS \(coalesce\(order_id, reservation_id\)\) STORED/);
});

test("scan_codes: exactly one subject, and the subject column matches code_type", () => {
  assert.match(migration212, /CONSTRAINT scan_codes_exactly_one_subject CHECK \(num_nonnulls\(order_id, reservation_id\) = 1\)/);
  assert.match(migration212, /CONSTRAINT scan_codes_subject_matches_type CHECK \(\s*\(code_type = 'order' AND order_id IS NOT NULL AND reservation_id IS NULL\)\s*OR \(code_type = 'reservation' AND reservation_id IS NOT NULL AND order_id IS NULL\)\s*\)/);
});

test("scan_codes: code format excludes I, L, O, U and the prefix matches code_type", () => {
  assert.match(migration212, /CONSTRAINT scan_codes_code_format CHECK \(code ~ '\^\(O1\|R1\)-\[0-9A-HJKMNP-TV-Z\]\{16\}\$'\)/);
  // The character class must not contain I, L, O or U.
  const classMatch = migration212.match(/code ~ '\^\(O1\|R1\)-\[([^\]]+)\]\{16\}\$'/);
  assert.ok(classMatch, "expected to find the code format character class");
  for (const forbidden of ["I", "L", "O", "U"]) {
    assert.ok(!classMatch[1].includes(forbidden), `character class must not include ${forbidden}`);
  }
  assert.match(migration212, /CONSTRAINT scan_codes_code_prefix_matches_type CHECK \(\s*\(code_type = 'order' AND code LIKE 'O1-%'\)\s*OR \(code_type = 'reservation' AND code LIKE 'R1-%'\)\s*\)/);
});

test("scan_codes: unique partial indexes enforce one code per subject", () => {
  assert.match(migration212, /CREATE UNIQUE INDEX IF NOT EXISTS scan_codes_order_id_unique\s*ON public\.scan_codes\(order_id\) WHERE order_id IS NOT NULL/);
  assert.match(migration212, /CREATE UNIQUE INDEX IF NOT EXISTS scan_codes_reservation_id_unique\s*ON public\.scan_codes\(reservation_id\) WHERE reservation_id IS NOT NULL/);
  assert.match(migration212, /CREATE INDEX IF NOT EXISTS idx_scan_codes_tenant_id\s*ON public\.scan_codes\(tenant_id\)/);
});

test("generate_scan_code_body: 16 random bytes masked with 31 against the 32-char alphabet", () => {
  const start = migration212.indexOf("CREATE OR REPLACE FUNCTION public.generate_scan_code_body");
  const end = migration212.indexOf("CREATE OR REPLACE FUNCTION public.issue_scan_code", start);
  const fn = migration212.slice(start, end);
  assert.match(fn, /v_alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'/);
  assert.equal("0123456789ABCDEFGHJKMNPQRSTVWXYZ".length, 32);
  assert.match(fn, /extensions\.gen_random_bytes\(16\)/);
  assert.match(fn, /get_byte\(v_bytes, v_i\) & 31/);
});

test("issue_scan_code: SECURITY DEFINER, fixed search_path, service_role only, idempotent with bounded retry", () => {
  const start = migration212.indexOf("CREATE OR REPLACE FUNCTION public.issue_scan_code");
  const end = migration212.indexOf("CREATE OR REPLACE FUNCTION public.lookup_scan_code", start);
  const fn = migration212.slice(start, end);
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = pg_catalog, public, extensions, pg_temp/);
  assert.match(fn, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(fn, /out_created := false/);
  assert.match(fn, /out_created := true/);
  assert.match(fn, /FOR v_attempt IN 1\.\.5 LOOP/);
  assert.match(fn, /GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME/);
  assert.match(fn, /scan_codes_order_id_unique|scan_codes_reservation_id_unique/);
  assert.match(migration212, /REVOKE ALL ON FUNCTION public\.issue_scan_code\(text, uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration212, /GRANT EXECUTE ON FUNCTION public\.issue_scan_code\(text, uuid\) TO service_role/);
});

test("lookup_scan_code: SECURITY DEFINER, fixed search_path, service_role only, returns identifiers/statuses only", () => {
  const start = migration212.indexOf("CREATE OR REPLACE FUNCTION public.lookup_scan_code");
  const fn = migration212.slice(start);
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = pg_catalog, public, extensions, pg_temp/);
  assert.match(fn, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(migration212, /REVOKE ALL ON FUNCTION public\.lookup_scan_code\(text\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration212, /GRANT EXECUTE ON FUNCTION public\.lookup_scan_code\(text\) TO service_role/);

  const returnsStart = migration212.indexOf("RETURNS TABLE (", migration212.indexOf("CREATE OR REPLACE FUNCTION public.lookup_scan_code"));
  const returnsEnd = migration212.indexOf(")", returnsStart);
  const returnsClause = migration212.slice(returnsStart, returnsEnd);
  for (const pii of ["email", "phone", "name", "address", "items"]) {
    assert.ok(
      !returnsClause.toLowerCase().includes(pii),
      `lookup_scan_code's declared return columns must not include ${pii}`
    );
  }
});

test("rollback refuses to run while scan_codes has rows, and drops in dependency order", () => {
  assert.match(rollback212, /MIGRATION_212_ROLLBACK_BLOCKED/);
  assert.match(rollback212, /IF EXISTS \(SELECT 1 FROM public\.scan_codes\) THEN/);
  assert.match(rollback212, /DROP FUNCTION IF EXISTS public\.lookup_scan_code\(text\)/);
  assert.match(rollback212, /DROP FUNCTION IF EXISTS public\.issue_scan_code\(text, uuid\)/);
  assert.match(rollback212, /DROP TABLE IF EXISTS public\.scan_codes/);
  assert.match(rollback212, /COMMIT;/);
  assert.doesNotMatch(rollback212, /ROLLBACK;/);
});

test("rollback never mentions orders/reservations DDL (no columns were added to either table)", () => {
  assert.doesNotMatch(rollback212, /ALTER TABLE public\.orders/);
  assert.doesNotMatch(rollback212, /ALTER TABLE public\.reservations/);
});

test("canonical migration and its Supabase mirror are byte-identical, and no rollback is mirrored", () => {
  assert.equal(
    read("db/migration_212_scan_codes.sql"),
    read("supabase/migrations/20261102000000_migration_212_scan_codes.sql")
  );
  assert.equal(fs.existsSync(path.resolve(ROOT, "supabase/migrations/20261102000000_migration_212_scan_codes_rollback.sql")), false);
});
