-- migration_53_security_hardening_rollback.sql
--
-- WARNING: this restores the vulnerable state. Each section reopens a specific
-- finding from the 2026-08 assessment. Only run a section if you are replacing
-- its protection with something equivalent.

BEGIN;

-- 53.5 rollback — republishes the (user_id, organizer_id) follow graph.
DROP VIEW IF EXISTS organizer_follower_counts;
DROP POLICY IF EXISTS "Users can read their own follows" ON organizer_follows;
DROP POLICY IF EXISTS "Organizers can read their own followers" ON organizer_follows;
CREATE POLICY "Anyone can view follows" ON organizer_follows FOR SELECT USING (true);
-- NOTE: app code reads organizer_follower_counts. Reverting this section
-- requires reverting app/organizers/page.tsx and
-- app/org/[slug]/OrganizationProfileClient.tsx too, or follower counts break.

-- 53.4 rollback — re-exposes media/updates of unpublished fundraisers.
DROP POLICY IF EXISTS "Updates of published fundraisers are readable" ON fundraiser_updates;
DROP POLICY IF EXISTS "Owners can read their own fundraiser updates" ON fundraiser_updates;
CREATE POLICY "Public can view fundraiser updates" ON fundraiser_updates FOR SELECT USING (true);

DROP POLICY IF EXISTS "Media of published fundraisers is readable" ON fundraiser_media;
DROP POLICY IF EXISTS "Owners can read their own fundraiser media" ON fundraiser_media;
CREATE POLICY "Public can view fundraiser media" ON fundraiser_media FOR SELECT USING (true);

-- 53.3 rollback — re-exposes tax_id and nonprofit_registration_number.
GRANT SELECT ON organizers TO anon, authenticated;
-- NOTE: app/organizers/page.tsx was changed from select("*") to an explicit
-- column list. That change is compatible with this rollback and need not be
-- reverted.

-- 53.2 rollback — reinstates the blanket policy that defeats the visibility gate.
DROP POLICY IF EXISTS "Public organizers are readable" ON organizers;
CREATE POLICY "Public organizers are readable" ON organizers
  FOR SELECT USING (visibility = 'public' OR auth.uid() = user_id);
CREATE POLICY "Public read organizers" ON organizers FOR SELECT USING (true);

-- 53.1 rollback — NOT included on purpose.
-- Narrowing profiles_status_check back to ('active','suspended') would fail if
-- any row has already been purged. If you must revert it, first migrate those
-- rows to another status, then:
--   ALTER TABLE profiles DROP CONSTRAINT profiles_status_check;
--   ALTER TABLE profiles ADD CONSTRAINT profiles_status_check
--     CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text]));

COMMIT;

NOTIFY pgrst, 'reload schema';
