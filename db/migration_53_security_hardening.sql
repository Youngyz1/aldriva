-- migration_53_security_hardening.sql
--
-- Security remediation following the 2026-08 assessment. Five independent
-- fixes, each safe to apply on its own.
--
--   53.1  profiles_status_check: allow 'purged'      (CRITICAL-1 dependency)
--   53.2  organizers: drop blanket SELECT policy     (HIGH-2)
--   53.3  organizers: column-level SELECT grants     (HIGH-2)
--   53.4  fundraiser_updates / fundraiser_media RLS  (MEDIUM-2 / MEDIUM-3)
--   53.5  organizer_follows: stop exposing user_id   (MEDIUM-4)
--
-- Rollback: db/migration_53_security_hardening_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 53.1  Allow the purge job to mark an account as purged.
--
-- The account-deletion cron sets profiles.status = 'purged', but the CHECK
-- constraint only permitted 'active' | 'suspended', so every purge failed.
-- Additive: no existing row uses 'purged', and no existing query is affected
-- by widening the allowed set.
-- ---------------------------------------------------------------------------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'purged'::text]));


-- ---------------------------------------------------------------------------
-- 53.2  Remove the blanket organizers SELECT policy.
--
-- Two permissive SELECT policies existed:
--   "Public organizers are readable"  USING (visibility = 'public' OR auth.uid() = user_id)
--   "Public read organizers"          USING (true)
-- Permissive policies are OR'd, so `true` made the visibility gate dead code.
-- Any anonymous caller could read organizers marked non-public, and (once the
-- 14-day account-deletion grace period puts rows in that state) soft-deleted
-- ones too.
--
-- The correctly-scoped policy is retained, so public organizer profiles and
-- owner access are unchanged.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read organizers" ON organizers;

-- Also exclude soft-deleted organizers from public reads. Owners keep access
-- to their own row during the grace period so the account-recovery flow and
-- the dashboard continue to work.
DROP POLICY IF EXISTS "Public organizers are readable" ON organizers;
CREATE POLICY "Public organizers are readable" ON organizers
  FOR SELECT USING (
    (visibility = 'public' AND deleted_at IS NULL)
    OR auth.uid() = user_id
  );


-- ---------------------------------------------------------------------------
-- 53.3  Restrict sensitive organizer columns.
--
-- RLS filters ROWS, never COLUMNS — column-level GRANT is the only mechanism
-- that restricts columns. tax_id and nonprofit_registration_number are
-- registration identifiers (for a sole proprietor a tax id may be an SSN/EIN)
-- and are read only by receipt generation, which runs through the service-role
-- client (lib/receipt.ts, app/api/receipts/*) and so is unaffected by grants.
--
-- contact_email is deliberately NOT revoked: it is a published contact field
-- rendered as a mailto: link on every public organizer profile
-- (OrganizationProfileClient.tsx). Revoking it would break a feature rather
-- than close a leak.
--
-- Postgres cannot revoke a single column from a table-wide SELECT grant, so
-- the table grant is dropped and re-issued per column.
--
-- NOTE: this makes `select("*")` on organizers fail for anon/authenticated —
-- PostgREST expands `*` to every column, including the revoked ones. The two
-- call sites that did this (app/organizers/page.tsx) were changed to an
-- explicit column list in the same commit.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON organizers FROM anon, authenticated;

GRANT SELECT (
  id, user_id, name, bio, photo, banner, slug, org_type, visibility, status,
  verified_at, website, facebook, twitter, instagram, linkedin, youtube,
  tiktok, contact_email, average_rating, review_count, follower_offset,
  events_offset, organization_name, created_at, updated_at, deleted_at
) ON organizers TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 53.4  Stop exposing draft/unpublished fundraiser content.
--
-- Both tables had `USING (true)` SELECT policies that never joined to the
-- parent fundraiser, so media and updates belonging to fundraisers still in
-- 'pending_review' (or soft-deleted) were readable by anonymous callers.
--
-- Authoritative status values come from fundraisers_status_check:
--   'pending_review' | 'published' | 'rejected'
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view fundraiser updates" ON fundraiser_updates;
CREATE POLICY "Updates of published fundraisers are readable" ON fundraiser_updates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM fundraisers f
      WHERE f.id = fundraiser_updates.fundraiser_id
        AND f.status = 'published'
        AND f.deleted_at IS NULL
    )
  );

-- Two duplicate blanket policies existed on fundraiser_media.
DROP POLICY IF EXISTS "Fundraiser media is publicly readable" ON fundraiser_media;
DROP POLICY IF EXISTS "Public can view fundraiser media" ON fundraiser_media;
CREATE POLICY "Media of published fundraisers is readable" ON fundraiser_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM fundraisers f
      WHERE f.id = fundraiser_media.fundraiser_id
        AND f.status = 'published'
        AND f.deleted_at IS NULL
    )
  );

-- Owners must still see their own drafts. The pre-existing "Organizer can
-- manage their fundraiser media" ALL policy covers media; updates only had a
-- policy keyed on organizer_id, which misses fundraisers owned via user_id.
CREATE POLICY "Owners can read their own fundraiser updates" ON fundraiser_updates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM fundraisers f
      LEFT JOIN organizers o ON o.id = f.organizer_id
      WHERE f.id = fundraiser_updates.fundraiser_id
        AND (f.user_id = auth.uid() OR o.user_id = auth.uid())
    )
  );

CREATE POLICY "Owners can read their own fundraiser media" ON fundraiser_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM fundraisers f
      LEFT JOIN organizers o ON o.id = f.organizer_id
      WHERE f.id = fundraiser_media.fundraiser_id
        AND (f.user_id = auth.uid() OR o.user_id = auth.uid())
    )
  );


-- ---------------------------------------------------------------------------
-- 53.5  Stop publishing the follower social graph.
--
-- organizer_follows had two duplicate `USING (true)` SELECT policies, exposing
-- (user_id, organizer_id) pairs to anonymous callers. On a fundraising site a
-- follow can imply a health, religious or political affiliation, and user_id
-- joins to every other table that exposes it.
--
-- Follow/unfollow is unaffected (INSERT/DELETE policies are untouched). Users
-- can still read their OWN follows, which is what the "is following?" check on
-- the organizer page needs. Aggregate counts are served by the
-- organizer_follower_counts view below.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view follows" ON organizer_follows;
DROP POLICY IF EXISTS "Organizer follows are publicly readable" ON organizer_follows;

CREATE POLICY "Users can read their own follows" ON organizer_follows
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Organizers can read their own followers" ON organizer_follows
  FOR SELECT USING (
    organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid())
  );

-- Public aggregate: counts without identities.
-- security_invoker = off (the default) so the view bypasses the caller's RLS
-- and can count rows the caller may not read individually.
CREATE OR REPLACE VIEW organizer_follower_counts AS
  SELECT organizer_id, count(*)::bigint AS follower_count
  FROM organizer_follows
  GROUP BY organizer_id;

GRANT SELECT ON organizer_follower_counts TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
