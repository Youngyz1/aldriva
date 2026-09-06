-- migration_97_follows_read_restriction.sql
--
-- Security remediation (HIGH-7): user→user `follows` rows were world-readable
-- (`Follows are publicly readable USING (true)`), exposing the full social
-- graph to anonymous clients.
--
-- New rule: a user can read only follow edges they participate in (as
-- follower or following). INSERT/DELETE policies are unchanged.
--
-- Legitimate flows preserved (all bypass RLS via service-role):
--   * profile follower/following counts (app/profile/[id]/page.tsx)
--   * is-following check (same page, actor-scoped server side)
--   * follow/unfollow toggle + counts (app/api/follow/route.ts, actor-scoped)
-- Mirrors the organizer_follows restriction from migration_53.
--
-- Rollback: db/migration_97_follows_read_restriction_rollback.sql

BEGIN;

DROP POLICY IF EXISTS "Follows are publicly readable" ON public.follows;

CREATE POLICY "Users can read own follow edges"
  ON public.follows FOR SELECT
  USING (
    auth.uid() = follower_id
    OR auth.uid() = following_id
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
