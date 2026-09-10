-- migration_103_organizer_grant_least_privilege.sql
--
-- P0 F-03 follow-up: converge public.organizers privileges to least privilege.
--
-- Relationship to migration 101: 101 replaced the blanket RLS policies and
-- narrowed SELECT grants, but left the Supabase-default GRANT ALL baseline
-- (008_grants.sql: GRANT ALL ON ALL TABLES ... TO anon, authenticated, plus
-- ALTER DEFAULT PRIVILEGES) otherwise intact on organizers. Production
-- verification confirmed anon/authenticated still hold table-level INSERT,
-- UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and residual column-level
-- INSERT/REFERENCES (including on tax_id / nonprofit_registration_number).
-- Combined with the USING-only owner UPDATE policy ("Users can update own
-- organizer"), an organizer owner could write capability, lifecycle, and
-- registration columns on their own row via REST, bypassing the admin-only
-- server paths. This migration closes that gap with grants alone.
--
-- What changes (grants only — NO policy, trigger, or column changes):
--   * REVOKE ALL table-level privileges on organizers from anon/authenticated
--     (service_role and postgres untouched).
--   * REVOKE ALL column-level privileges on every known organizers column
--     from anon/authenticated, clearing remnants regardless of origin
--     (individual REVOKEs are no-op NOTICEs where nothing was granted).
--   * Re-grant exactly the least-privilege set below.
--
-- Intended end state:
--   anon:           SELECT on the 28 public columns only (101 list, verbatim).
--   authenticated:  same SELECT list, plus INSERT of the 16 owner-supplied
--                   creation columns, plus UPDATE of the 15 owner-editable
--                   profile columns + updated_at.
--   Neither role:   DELETE, TRUNCATE, REFERENCES, TRIGGER, or any privilege
--                   on tax_id, nonprofit_registration_number,
--                   fundraising_approved[_at], payment_enabled[_at],
--                   is_business_auto_created, purge_at, deleted_at, id,
--                   organization_name, status, verified_at, aggregates/offsets,
--                   or created_at.
--
-- Verified compatible (write paths traced in app code; RLS still enforced):
--   * create-organizer (browser, anon key, authenticated session) inserts the
--     16 granted columns with user_id = caller — allowed by grant + INSERT
--     policy ("Users can insert own organizer").
--   * Owner settings pages update the 15 profile columns — allowed by grant +
--     UPDATE policy ("Users can update own organizer"). updated_at is granted
--     because trg_organizers_updated_at (migration_48, invoker-rights) writes
--     it on every UPDATE; omitting it would break all owner saves.
--   * tax_id / nonprofit_registration_number flow exclusively through the
--     service-role /registration endpoint — unaffected by grants.
--   * Lifecycle (deleted_at/purge_at), verification, capability flags, and all
--     admin flows run via service role — unaffected.
--   * Public pages, follower counts (aggregate view), and search use the
--     granted SELECT columns only (ORGANIZER_PUBLIC_COLUMNS sweep).
--
-- Column inventory (35, union of schema.sql + migrations 02/10/20/21/39/48/58/61):
--   id, user_id, name, bio, photo, banner, slug, org_type, visibility, status,
--   verified_at, website, facebook, twitter, instagram, linkedin, youtube,
--   tiktok, contact_email, average_rating, review_count, follower_offset,
--   events_offset, organization_name, tax_id, nonprofit_registration_number,
--   fundraising_approved, fundraising_approved_at, payment_enabled,
--   payment_enabled_at, is_business_auto_created, deleted_at, purge_at,
--   created_at, updated_at.
--
-- Rollback: db/migration_103_organizer_grant_least_privilege_rollback.sql
-- (restores GRANT ALL table-level; re-opens the gap — emergency use only).

BEGIN;

-- Belt-and-braces (no-op if already enabled by 005_enable_rls.sql).
ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;

-- ── 1. Strip table-level privileges ─────────────────────────────────────────
REVOKE ALL ON TABLE public.organizers FROM anon, authenticated;

-- ── 2. Strip column-level remnants regardless of origin ─────────────────────
-- (Each REVOKE is a harmless NOTICE where the privilege was never granted.)
REVOKE ALL (
  id, user_id, name, bio, photo, banner, slug, org_type, visibility, status,
  verified_at, website, facebook, twitter, instagram, linkedin, youtube,
  tiktok, contact_email, average_rating, review_count, follower_offset,
  events_offset, organization_name, tax_id, nonprofit_registration_number,
  fundraising_approved, fundraising_approved_at, payment_enabled,
  payment_enabled_at, is_business_auto_created, deleted_at, purge_at,
  created_at, updated_at
) ON public.organizers FROM anon, authenticated;

-- ── 3. Public reads (101 list, verbatim) ────────────────────────────────────
GRANT SELECT (
  id, user_id, name, bio, photo, banner, slug, org_type, visibility, status,
  verified_at, website, facebook, twitter, instagram, linkedin, youtube,
  tiktok, contact_email, average_rating, review_count, follower_offset,
  events_offset, organization_name, fundraising_approved, created_at,
  updated_at, deleted_at
) ON public.organizers TO anon, authenticated;

-- ── 4. Owner self-service creation (create-organizer payload, traced) ───────
GRANT INSERT (
  user_id, name, slug, bio, photo, banner, org_type, contact_email, website,
  facebook, twitter, instagram, linkedin, youtube, tiktok, visibility
) ON public.organizers TO authenticated;

-- ── 5. Owner self-service profile updates (settings payload, traced) ────────
-- updated_at is included: trg_organizers_updated_at writes it on every UPDATE
-- with invoker rights, so omitting it would break all owner saves.
GRANT UPDATE (
  name, slug, bio, photo, banner, org_type, contact_email, website, facebook,
  twitter, instagram, linkedin, youtube, tiktok, visibility, updated_at
) ON public.organizers TO authenticated;

-- Deliberately granted to NOBODY in anon/authenticated: DELETE, TRUNCATE,
-- REFERENCES, TRIGGER (table level), and any privilege on id, tax_id,
-- nonprofit_registration_number, organization_name, status, verified_at,
-- average_rating, review_count, follower_offset, events_offset,
-- fundraising_approved, fundraising_approved_at, payment_enabled,
-- payment_enabled_at, is_business_auto_created, deleted_at, purge_at,
-- created_at. service_role and postgres are untouched throughout.

COMMIT;

NOTIFY pgrst, 'reload schema';
