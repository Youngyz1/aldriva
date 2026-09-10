/**
 * Static regression tests for migration_102 (event banner uploads).
 *
 * Context: the event-banners storage bucket had zero storage.objects INSERT
 * policies, so every authenticated browser upload failed with "new row
 * violates row-level security policy". The migration adds ONE narrowly
 * scoped policy — it must authorize only users who manage the event
 * addressed by the object's first path segment, and must never become a
 * blanket "any authenticated user can upload" policy.
 *
 * Repository evidence only (no database connection), following the
 * p0-rls-policies.test.cjs convention. The canonical db/ file, the
 * supabase/migrations mirror, and the rollback are all asserted.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const CANON = path.join(ROOT, "db", "migration_102_event_banner_uploads.sql");
const MIRROR = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260907000000_migration_102_event_banner_uploads.sql"
);
const ROLLBACK = path.join(ROOT, "db", "migration_102_event_banner_uploads_rollback.sql");

const sql = fs.readFileSync(CANON, "utf8");
const mirrorSql = fs.readFileSync(MIRROR, "utf8");
const rollbackSql = fs.readFileSync(ROLLBACK, "utf8");

const POLICY = '"Event managers can upload event banners"';

test("migration files exist in both migration tracks plus rollback", () => {
  assert.ok(fs.existsSync(CANON), "canonical db/ migration must exist");
  assert.ok(fs.existsSync(MIRROR), "supabase/migrations mirror must exist");
  assert.ok(fs.existsSync(ROLLBACK), "rollback must exist");
});

test("mirror matches canonical policy body", () => {
  const ANCHOR = `DROP POLICY IF EXISTS ${POLICY} ON storage.objects;`;
  assert.ok(sql.includes(ANCHOR), "canonical must contain the policy drop");
  assert.ok(mirrorSql.includes(ANCHOR), "mirror must contain the policy drop");
  assert.equal(
    mirrorSql.slice(mirrorSql.indexOf(ANCHOR)),
    sql.slice(sql.indexOf(ANCHOR)),
    "mirror body must equal canonical body"
  );
});

test("rollback removes exactly this policy", () => {
  assert.ok(
    rollbackSql.includes(`DROP POLICY IF EXISTS ${POLICY} ON storage.objects;`),
    "rollback must drop the banner policy"
  );
  assert.ok(!rollbackSql.includes("CREATE POLICY"), "rollback must not create policies");
});

test("policy targets INSERT on storage.objects for event-banners only", () => {
  assert.ok(sql.includes(`CREATE POLICY ${POLICY}`), "policy must be created");
  assert.ok(sql.includes("ON storage.objects FOR INSERT"), "must be an INSERT policy");
  assert.ok(sql.includes("bucket_id = 'event-banners'"), "must be bucket-scoped");
});

test("policy requires an authenticated identity", () => {
  assert.ok(
    sql.includes("auth.role() = 'authenticated'"),
    "must require the authenticated role"
  );
});

test("policy binds the object path to a managed event", () => {
  // First path segment (<eventId>/<file>) must resolve to an event the
  // uploader owns directly or via their organizer profile — the same
  // relationship as the app edit gate (app/events/edit/[id]/page.tsx).
  assert.ok(
    sql.includes("(storage.foldername(storage.objects.name))[1]"),
    "must read the event id from the first path segment (qualified)"
  );
  assert.ok(sql.includes("public.events"), "must check the events table");
  assert.ok(sql.includes("e.user_id = auth.uid()"), "must allow the event owner");
  assert.ok(sql.includes("public.organizers"), "must check the organizers table");
  assert.ok(sql.includes("o.user_id = auth.uid()"), "must allow the organizer owner");
  assert.ok(
    sql.includes("o.id = e.organizer_id"),
    "organizer branch must join through the event's organizer"
  );
});

test("no blanket upload is introduced", () => {
  const codeOnly = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.ok(!/WITH CHECK\s*\(\s*true\s*\)/i.test(codeOnly), "must not contain WITH CHECK (true)");
  assert.ok(!/USING\s*\(\s*true\s*\)/i.test(codeOnly), "must not contain USING (true)");
  // An authenticated-only check without the event EXISTS branch would let
  // any user write into any event's prefix.
  assert.ok(codeOnly.includes("EXISTS"), "must contain event-authorization EXISTS checks");
});
