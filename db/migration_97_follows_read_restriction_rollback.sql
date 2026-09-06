-- migration_97_follows_read_restriction_rollback.sql
--
-- Restores the pre-97 public follows read policy. Only use to back out
-- migration_97; re-opens HIGH-7 (world-readable social graph).

BEGIN;

DROP POLICY IF EXISTS "Users can read own follow edges" ON public.follows;

CREATE POLICY "Follows are publicly readable"
  ON public.follows FOR SELECT
  USING (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
