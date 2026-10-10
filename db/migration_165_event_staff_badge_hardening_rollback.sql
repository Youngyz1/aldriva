-- migration_165_event_staff_badge_hardening_rollback.sql
-- Rollback for migration_165_event_staff_badge_hardening.sql.
-- Reverses in reverse order with abort guards: refuses to restore the
-- CASCADE member link while orphaned (NULL-member) check-in rows exist,
-- and refuses to drop hash columns while any badge hash is stored
-- (re-mint from plaintext instead of silently destroying credentials).
-- Re-grants the table-level writes revoked by the forward migration.
-- Note: the restored checkins.badge_token is nullable here (164 declared
-- it NOT NULL on an empty table); the A4 route will repopulate it.
-- Safe to re-run.

BEGIN;

-- Abort guards: orphaned history and live hashes block the rollback.
DO $$
DECLARE
  v_orphans BIGINT;
  v_hashes BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_orphans
  FROM public.event_staff_checkins
  WHERE staff_member_id IS NULL;
  SELECT COUNT(*) INTO v_hashes
  FROM public.event_team_members
  WHERE badge_token_hash IS NOT NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED: % staff check-in rows have no member link; re-link or archive them before restoring the CASCADE foreign key', v_orphans;
  END IF;
  IF v_hashes > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED: % members hold badge hashes; re-mint plaintext badges before rolling back migration 165', v_hashes;
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_column THEN
    -- 165 objects already gone: nothing to guard.
    NULL;
END;
$$;

-- 5. Restore the manager write policy on staff check-ins.
DROP POLICY IF EXISTS "Organizers manage staff checkins" ON public.event_staff_checkins;
CREATE POLICY "Organizers manage staff checkins" ON public.event_staff_checkins
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_staff_checkins.event_id
        AND (
          events.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM organizers
            WHERE organizers.id = events.organizer_id
              AND (
                organizers.user_id = auth.uid()
                OR is_entity_member(events.organizer_id, ARRAY['owner','admin','manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_staff_checkins.event_id
        AND (
          events.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM organizers
            WHERE organizers.id = events.organizer_id
              AND (
                organizers.user_id = auth.uid()
                OR is_entity_member(events.organizer_id, ARRAY['owner','admin','manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- 4. Restore the CASCADE member link (guarded non-null above).
ALTER TABLE public.event_staff_checkins DROP CONSTRAINT IF EXISTS event_staff_checkins_staff_member_id_fkey;
ALTER TABLE public.event_staff_checkins ADD CONSTRAINT event_staff_checkins_staff_member_id_fkey
  FOREIGN KEY (staff_member_id) REFERENCES public.event_team_members(id) ON DELETE CASCADE;
ALTER TABLE public.event_staff_checkins ALTER COLUMN staff_member_id SET NOT NULL;

-- 3. Drop hash columns, restore plaintext columns (nullable, see header).
DROP INDEX IF EXISTS public.idx_event_team_members_badge_token_hash;
DROP INDEX IF EXISTS public.idx_event_team_members_badge_display_code;
ALTER TABLE public.event_team_members DROP CONSTRAINT IF EXISTS event_team_members_badge_display_len;
ALTER TABLE public.event_team_members DROP CONSTRAINT IF EXISTS event_team_members_badge_hash_format;
ALTER TABLE public.event_team_members DROP COLUMN IF EXISTS badge_display_code;
ALTER TABLE public.event_team_members DROP COLUMN IF EXISTS badge_token_hash;
ALTER TABLE public.event_staff_checkins DROP COLUMN IF EXISTS badge_token_hash;
ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS badge_token TEXT;
ALTER TABLE public.event_staff_checkins ADD COLUMN IF NOT EXISTS badge_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_members_badge_token
  ON public.event_team_members(badge_token);

-- 1. Re-grant the table-level writes (reverse of the forward REVOKEs).
GRANT INSERT, UPDATE, DELETE ON public.event_team_members TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_team_invitations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_staff_checkins TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
