/**
 * P0 F-03 static regression tests: RLS enforcement migration content.
 *
 * Previous exposure: blanket `WITH CHECK (true)` / `USING (true)` policies on
 * events, fundraisers, tickets, organizers, organizer_follows, follows, and
 * fundraiser_media/updates let anonymous callers insert arbitrary rows and
 * read private/unpublished rows.
 *
 * These tests assert repository evidence only (no database connection): the
 * enforcement migration must drop every blanket policy and replace it with an
 * ownership/state-scoped equivalent, and the Supabase-CLI mirror must stay in
 * sync with the canonical db/ file. Functional verification against a real
 * Supabase project remains an operator step (see migration header).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const CANON = path.join(ROOT, "db", "migration_101_p0_rls_enforcement.sql");
const MIRROR = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260906000000_migration_101_p0_rls_enforcement.sql"
);
const ROLLBACK = path.join(ROOT, "db", "migration_101_p0_rls_enforcement_rollback.sql");

const sql = fs.readFileSync(CANON, "utf8");
const mirrorSql = fs.readFileSync(MIRROR, "utf8");

test("migration files exist in both migration tracks", () => {
  assert.ok(fs.existsSync(CANON), "canonical db/ migration must exist");
  assert.ok(fs.existsSync(MIRROR), "supabase/migrations mirror must exist");
  assert.ok(fs.existsSync(ROLLBACK), "rollback must exist");
});

test("mirror matches canonical body (header may differ)", () => {
  const ANCHOR = "-- What changes";
  assert.ok(sql.includes(ANCHOR), "canonical body anchor must exist");
  assert.ok(mirrorSql.includes(ANCHOR), "mirror body anchor must exist");
  assert.equal(
    mirrorSql.slice(mirrorSql.indexOf(ANCHOR)),
    sql.slice(sql.indexOf(ANCHOR)),
    "mirror body must equal canonical body"
  );
});

test("every blanket INSERT policy is dropped", () => {
  for (const stmt of [
    'DROP POLICY IF EXISTS "Allow public insert" ON public.events;',
    'DROP POLICY IF EXISTS "Allow public insert" ON public.fundraisers;',
    'DROP POLICY IF EXISTS "Allow public insert" ON public.tickets;',
  ]) {
    assert.ok(sql.includes(stmt), `must contain: ${stmt}`);
  }
  // Fundraiser self-publish-era loose policies must also go (permissive OR).
  assert.ok(sql.includes('DROP POLICY IF EXISTS "Anyone can create a fundraiser pending review" ON public.fundraisers;'));
  assert.ok(sql.includes('DROP POLICY IF EXISTS "Users can create fundraisers for their organizer profiles" ON public.fundraisers;'));
});

test("no new blanket USING/WITH CHECK (true) policy is introduced", () => {
  const creates = sql.split("\n").filter((line) => line.startsWith("CREATE POLICY"));
  assert.ok(creates.length > 0, "migration must create scoped policies");
  // Strip comments: the header documents the removed patterns by name.
  const codeOnly = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.ok(!/WITH CHECK\s*\(\s*true\s*\)/i.test(codeOnly), "must not contain WITH CHECK (true)");
  assert.ok(!/USING\s*\(\s*true\s*\)/i.test(codeOnly), "must not contain USING (true)");
});

test("replacement INSERT policies enforce ownership", () => {
  assert.ok(sql.includes("auth.uid() = user_id"), "owner check must appear");
  assert.ok(
    sql.includes("Authenticated owners can create fundraisers pending review"),
    "fundraiser owner+pending_review policy must exist"
  );
  assert.ok(sql.includes("status = 'pending_review'"), "self-publish gate must be kept");
  assert.ok(
    sql.includes("Event owners and admins can create tickets"),
    "ticket ownership gate must exist"
  );
});

test("event/fundraiser/ticket reads are state-scoped, not public", () => {
  assert.ok(sql.includes("Approved public events are readable"), "events public-read must be gated");
  assert.ok(sql.includes("status = 'approved'"), "approved gate must appear");
  assert.ok(sql.includes("Published fundraisers are public"), "fundraiser public-read must be gated");
  assert.ok(sql.includes("Tickets of visible events are readable"), "ticket public-read must be gated");
});

test("social-graph reads are restricted with an aggregate fallback", () => {
  assert.ok(sql.includes('DROP POLICY IF EXISTS "Anyone can view follows" ON public.organizer_follows;'));
  assert.ok(sql.includes('DROP POLICY IF EXISTS "Follows are publicly readable" ON public.follows;'));
  assert.ok(sql.includes("organizer_follower_counts"), "public count view must exist");
  assert.ok(sql.includes("Users can read own follow edges"), "follows own-edge policy must exist");
});

test("organizer visibility bypass and sensitive columns are addressed", () => {
  assert.ok(sql.includes('DROP POLICY IF EXISTS "Public read organizers" ON public.organizers;'));
  assert.ok(sql.includes("REVOKE SELECT ON public.organizers FROM anon, authenticated;"));
  assert.ok(sql.includes("fundraising_approved"), "grant list must cover the create-fundraiser column");
  assert.ok(!sql.includes("tax_id,"), "tax_id must stay out of the anon/authenticated grant list");
});
