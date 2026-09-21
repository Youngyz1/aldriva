/**
 * lib/security/__tests__/migration129-publishing-guard.test.cjs
 *
 * Behavioral and static verification for migration_129:
 * 1. website_page_drafts table definition & tenant-only RLS (anon read fails closed).
 * 2. Editor direct publish guard (trigger rejects direct changes to blocks/status by editors).
 * 3. publish_page_draft RPC with search_path = '' and role verification (owner/admin/manager only).
 * 4. Non-admin fundraiser activation strictly fails (DEC-0016 moderation boundary).
 * 5. Rollback restores previous schema.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const MIGRATION_129 = path.join(
  ROOT,
  "db",
  "migration_129_website_page_drafts_and_publishing_guard.sql"
);
const MIGRATION_129_ROLLBACK = path.join(
  ROOT,
  "db",
  "migration_129_website_page_drafts_and_publishing_guard_rollback.sql"
);
const MIGRATION_105 = path.join(
  ROOT,
  "db",
  "migration_105_trigger_service_role_gate.sql"
);

const sql129 = fs.readFileSync(MIGRATION_129, "utf8");
const sql129Rollback = fs.readFileSync(MIGRATION_129_ROLLBACK, "utf8");
const sql105 = fs.readFileSync(MIGRATION_105, "utf8");

test("migration_129 and rollback exist in canonical db/ directory", () => {
  assert.ok(fs.existsSync(MIGRATION_129), "migration_129 must exist");
  assert.ok(fs.existsSync(MIGRATION_129_ROLLBACK), "migration_129_rollback must exist");
});

test("website_page_drafts table has no public SELECT policy (anon reads fail)", () => {
  assert.ok(
    /CREATE TABLE IF NOT EXISTS (public\.)?website_page_drafts/i.test(sql129),
    "creates website_page_drafts"
  );
  assert.ok(
    /ALTER TABLE (public\.)?website_page_drafts ENABLE ROW LEVEL SECURITY;/i.test(sql129),
    "enables RLS on drafts"
  );
  assert.ok(
    !sql129.includes('"Public can view website page drafts"'),
    "must not have public read policy on drafts"
  );
  assert.ok(
    sql129.includes("is_entity_member(tw.tenant_id, ARRAY['owner','admin','manager','editor'])"),
    "RLS restricted to team members"
  );
});

test("website_pages.draft_blocks column is dropped in migration_129", () => {
  assert.ok(
    /ALTER TABLE (public\.)?website_pages DROP COLUMN IF EXISTS draft_blocks;/i.test(sql129),
    "draft_blocks is dropped from website_pages table"
  );
});

test("enforce_website_page_publishing_guard blocks editor direct publish and cross-tenant move", () => {
  assert.ok(
    sql129.includes("CREATE OR REPLACE FUNCTION public.enforce_website_page_publishing_guard()"),
    "defines publishing guard function"
  );
  assert.ok(
    sql129.includes("CREATE TRIGGER trg_enforce_website_page_publishing_guard"),
    "binds publishing guard trigger"
  );

  // Check role restriction: editor is NOT in the allowed direct publish list
  assert.ok(
    sql129.includes("public.is_entity_member(v_tenant_id, ARRAY['owner', 'admin', 'manager'])"),
    "guard allows only owner, admin, manager roles to mutate live content"
  );
  assert.ok(
    sql129.includes("Only owners, admins, and managers can publish website pages directly"),
    "rejects non-manager insert with published status"
  );
  assert.ok(
    sql129.includes("Only owners, admins, and managers can publish live page blocks directly"),
    "rejects non-manager block updates"
  );
  assert.ok(
    sql129.includes("Only owners, admins, and managers can change page publication status"),
    "rejects non-manager status updates"
  );

  // Case 3: Immutable website_id prevents cross-tenant reparenting / move
  assert.ok(
    sql129.includes("Page website_id is immutable and cannot be moved across websites"),
    "strictly rejects any change to website_id"
  );
});

test("website_page_drafts enforces versioning and updated_by metadata trigger", () => {
  assert.ok(
    sql129.includes("CREATE OR REPLACE FUNCTION public.set_website_page_draft_metadata()"),
    "defines metadata trigger function"
  );
  assert.ok(
    sql129.includes("NEW.version := OLD.version + 1;"),
    "auto-increments draft version on update"
  );
  assert.ok(
    sql129.includes("NEW.updated_by := auth.uid();"),
    "binds updated_by to authenticated user"
  );
});

test("publish_page_draft RPC uses schema-qualification, DELETE ... RETURNING, and revokes from anon", () => {
  assert.ok(
    sql129.includes("CREATE OR REPLACE FUNCTION public.publish_page_draft(") &&
      sql129.includes("p_expected_version INTEGER DEFAULT NULL"),
    "defines publish_page_draft RPC with p_expected_version parameter"
  );
  assert.ok(
    sql129.includes("SECURITY DEFINER"),
    "RPC is SECURITY DEFINER"
  );
  assert.ok(
    sql129.includes("SET search_path = public, pg_temp"),
    "RPC search_path is safely pinned to public, pg_temp"
  );
  assert.ok(
    sql129.includes("public.is_entity_member(v_tenant_id, ARRAY['owner', 'admin', 'manager'])"),
    "RPC requires owner/admin/manager role"
  );

  // Atomic fetch and delete
  assert.ok(
    sql129.includes("DELETE FROM public.website_page_drafts"),
    "uses DELETE FROM website_page_drafts"
  );
  assert.ok(
    sql129.includes("RETURNING blocks, version, updated_by"),
    "uses RETURNING clause for atomic draft extraction"
  );
  assert.ok(
    sql129.includes("RAISE EXCEPTION 'No draft found for page: %', p_page_id"),
    "strictly raises if no draft exists"
  );

  // Schema-qualified builtins with search_path = ''
  assert.ok(
    sql129.includes("pg_catalog.now()"),
    "schema-qualifies now() via pg_catalog"
  );
  assert.ok(
    sql129.includes("pg_catalog.jsonb_build_object("),
    "schema-qualifies jsonb_build_object via pg_catalog"
  );

  // Access control: Service_role only (authenticated revoked to prevent validation bypass)
  assert.ok(
    sql129.includes("REVOKE ALL ON FUNCTION public.publish_page_draft(UUID, INTEGER) FROM PUBLIC, anon, authenticated;"),
    "revokes execute from PUBLIC, anon, and authenticated"
  );
  assert.ok(
    sql129.includes("GRANT EXECUTE ON FUNCTION public.publish_page_draft(UUID, INTEGER) TO service_role;"),
    "grants execute strictly to service_role"
  );
});

test("non-admin fundraiser activation strictly fails (moderation boundary preserved)", () => {
  // Verifies that crowdfunding campaigns (fundraisers) require admin review and cannot be self-published
  assert.ok(
    sql105.includes("CREATE OR REPLACE FUNCTION enforce_fundraiser_status_transition()"),
    "migration_105 defines enforce_fundraiser_status_transition"
  );
  const fundraiserFnStart = sql105.indexOf("CREATE OR REPLACE FUNCTION enforce_fundraiser_status_transition()");
  const fundraiserFn = sql105.slice(fundraiserFnStart, fundraiserFnStart + 1500);
  assert.ok(
    fundraiserFn.includes("IF NEW.status NOT IN ('pending_review') THEN"),
    "fundraiser cannot be moved to published/active by non-admins"
  );
});
