/**
 * lib/__tests__/migration168-content-store.test.cjs
 *
 * Static-shape pins for db/migration_168_website_content_store.sql (+ rollback).
 * Hermetic per DEC-0012: asserts on migration source text, never a live DB.
 * Live behavior is covered by db/tests/migration_168_test_harness.sql (manual).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const FWD = "db/migration_168_website_content_store.sql";
const ROLLBACK = "db/migration_168_website_content_store_rollback.sql";
const MIRROR = "supabase/migrations/20261011000000_migration_168_website_content_store.sql";

test("migration 168 forward, rollback, and mirror files exist", () => {
  for (const file of [FWD, ROLLBACK, MIRROR]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} must exist`);
  }
});

test("mirror is byte-identical to the canonical forward migration", () => {
  const fwd = read(FWD);
  const mirror = read(MIRROR);
  assert.equal(mirror, fwd, "supabase mirror must be byte-identical to db/ canonical");
});

test("both tables exist with website_id PK cascading to tenant_websites", () => {
  const sql = read(FWD);
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.website_content ("));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.website_content_drafts ("));
  assert.ok(
    sql.includes("website_id UUID PRIMARY KEY REFERENCES public.tenant_websites(id) ON DELETE CASCADE"),
    "both tables must PK + cascade to tenant_websites"
  );
  assert.ok(sql.includes("content JSONB NOT NULL DEFAULT '{}'::jsonb"));
  assert.ok(sql.includes("version INTEGER NOT NULL DEFAULT 1"));
});

test("version trigger copies the migration_129 shape", () => {
  const sql = read(FWD);
  assert.ok(sql.includes("set_website_content_draft_metadata()"));
  assert.ok(sql.includes("NEW.version := 1;"));
  assert.ok(sql.includes("NEW.version := OLD.version + 1;"));
  assert.ok(sql.includes("NEW.updated_by := auth.uid();"));
  assert.ok(sql.includes("trg_set_website_content_draft_metadata"));
  assert.ok(sql.includes("idx_website_content_gin"));
  assert.ok(sql.includes("USING GIN (content)"));
});

test("live website_content is RPC-only: SELECT for members, no write policies", () => {
  const sql = read(FWD);
  assert.ok(
    sql.includes("GRANT SELECT ON TABLE public.website_content TO authenticated;"),
    "live table grants SELECT only to authenticated"
  );
  assert.ok(
    !sql.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.website_content TO authenticated;"),
    "live table must not grant write to authenticated"
  );
  assert.ok(
    sql.includes("Tenant team members can view website content"),
    "live SELECT policy retained"
  );
  assert.ok(
    !sql.includes('CREATE POLICY "Tenant editors can insert website content"'),
    "no live INSERT policy may be created"
  );
  assert.ok(
    !sql.includes('CREATE POLICY "Tenant editors can update website content"'),
    "no live UPDATE policy may be created"
  );
  assert.ok(
    !sql.includes('CREATE POLICY "Tenant managers can delete website content"'),
    "no live DELETE policy may be created"
  );
  assert.ok(
    sql.includes("ARRAY['owner','admin','manager','editor','finance','viewer']"),
    "live SELECT must cover all 6 entity roles"
  );
  assert.ok(
    sql.includes('DROP POLICY IF EXISTS "Tenant editors can insert website content" ON public.website_content;'),
    "stale live INSERT policy must be dropped if present"
  );
});

test("drafts RLS keeps editor writes and manager-only DELETE", () => {
  const sql = read(FWD);
  assert.ok(
    sql.includes("ARRAY['owner','admin','manager','editor']"),
    "draft INSERT/UPDATE must cover content-write roles"
  );
  assert.ok(sql.includes("Tenant managers can delete website content drafts"));
  assert.ok(sql.includes("organizers.user_id = auth.uid()"), "organizer-owner fallback present");
  assert.ok(sql.includes("profiles.role = 'admin'"), "active platform-admin clause present");
});

test("publish_content_draft RPC mirrors publish_page_draft auth, versioning, and grants", () => {
  const sql = read(FWD);
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.publish_content_draft("));
  assert.ok(sql.includes("p_website_id UUID"));
  assert.ok(sql.includes("p_expected_version INTEGER DEFAULT NULL"));
  assert.ok(sql.includes("p_page_blocks JSONB DEFAULT NULL"));
  assert.ok(sql.includes("SECURITY DEFINER"));
  assert.ok(sql.includes("SET search_path = public, pg_temp"));
  assert.ok(sql.includes("is_entity_member(v_tenant_id, ARRAY['owner', 'admin', 'manager'])"));
  assert.ok(sql.includes("DELETE FROM public.website_content_drafts"));
  assert.ok(sql.includes("RETURNING content, version, updated_by"));
  assert.ok(sql.includes("USING ERRCODE = '40001'"), "version-mismatch 40001 present");
  assert.ok(sql.includes("USING ERRCODE = 'P0002'"), "no-draft P0002 present");
  assert.ok(
    sql.includes("REVOKE ALL ON FUNCTION public.publish_content_draft(UUID, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;")
  );
  assert.ok(
    sql.includes("GRANT EXECUTE ON FUNCTION public.publish_content_draft(UUID, INTEGER, JSONB) TO service_role;")
  );
});

test("optional p_page_blocks entries are website-scoped inside the RPC", () => {
  const sql = read(FWD);
  assert.ok(sql.includes("jsonb_array_elements(p_page_blocks)"));
  assert.ok(sql.includes("AND website_id = p_website_id"), "page writes must be website-scoped");
  assert.ok(sql.includes("does not belong to website"), "cross-website page write must raise");
});

test("rollback drops RPC, triggers, functions, then tables without CASCADE", () => {
  const sql = read(ROLLBACK);
  assert.ok(sql.includes("DROP FUNCTION IF EXISTS public.publish_content_draft(UUID, INTEGER, JSONB);"));
  assert.ok(sql.includes("DROP TRIGGER IF EXISTS trg_set_website_content_updated_at"));
  assert.ok(sql.includes("DROP TRIGGER IF EXISTS trg_set_website_content_draft_metadata"));
  assert.ok(sql.includes("DROP TABLE IF EXISTS public.website_content_drafts;"));
  assert.ok(sql.includes("DROP TABLE IF EXISTS public.website_content;"));
  const dropLines = sql.split("\n").filter((line) => /^\s*DROP\s/i.test(line));
  assert.ok(dropLines.length >= 6, "rollback must issue explicit DROPs");
  assert.ok(
    dropLines.every((line) => !/CASCADE/i.test(line)),
    "rollback DROP statements must not use CASCADE"
  );
});
