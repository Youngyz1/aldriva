-- migration_164_event_staff_labels_badges_rollback.sql
-- Rollback for migration_164_event_staff_labels_badges.sql.
-- Reverses in reverse order with an abort guard: staff check-in rows are
-- append-only audit history, so the rollback refuses to run while any
-- remain (delete or archive them explicitly first). Badge columns on
-- member/invitation rows are re-mintable metadata and drop without a guard.
-- Safe to re-run.

BEGIN;

-- Abort guard: never silently drop staff scan history.
DO $$
DECLARE
  v_remaining BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.event_staff_checkins;
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED: % staff check-in rows remain; archive or delete them before rolling back migration 164', v_remaining;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- Table already gone: nothing to guard.
    NULL;
END;
$$;

-- 4. RLS policies + table (reverse of forward section 4/3).
DROP POLICY IF EXISTS "Organizers manage staff checkins" ON public.event_staff_checkins;
DROP POLICY IF EXISTS "Users can view relevant staff checkins" ON public.event_staff_checkins;
DROP TABLE IF EXISTS public.event_staff_checkins;

-- 2. Member badge + labels (reverse of forward section 2).
DROP INDEX IF EXISTS public.idx_event_team_members_badge_token;
DROP INDEX IF EXISTS public.idx_event_team_members_badge_status;
ALTER TABLE public.event_team_members DROP CONSTRAINT IF EXISTS event_team_members_badge_status_check;
ALTER TABLE public.event_team_members DROP CONSTRAINT IF EXISTS event_team_members_staff_name_len;
ALTER TABLE public.event_team_members DROP CONSTRAINT IF EXISTS event_team_members_position_label_len;
ALTER TABLE public.event_team_members DROP CONSTRAINT IF EXISTS event_team_members_role_label_len;
ALTER TABLE public.event_team_members DROP COLUMN IF EXISTS badge_revoked_at;
ALTER TABLE public.event_team_members DROP COLUMN IF EXISTS badge_issued_at;
ALTER TABLE public.event_team_members DROP COLUMN IF EXISTS badge_status;
ALTER TABLE public.event_team_members DROP COLUMN IF EXISTS badge_token;
ALTER TABLE public.event_team_members DROP COLUMN IF EXISTS staff_name;
ALTER TABLE public.event_team_members DROP COLUMN IF EXISTS position_label;
ALTER TABLE public.event_team_members DROP COLUMN IF EXISTS role_label;

-- 1. Invitation labels (reverse of forward section 1).
ALTER TABLE public.event_team_invitations DROP CONSTRAINT IF EXISTS event_team_invitations_staff_name_len;
ALTER TABLE public.event_team_invitations DROP CONSTRAINT IF EXISTS event_team_invitations_position_label_len;
ALTER TABLE public.event_team_invitations DROP CONSTRAINT IF EXISTS event_team_invitations_role_label_len;
ALTER TABLE public.event_team_invitations DROP COLUMN IF EXISTS staff_name;
ALTER TABLE public.event_team_invitations DROP COLUMN IF EXISTS position_label;
ALTER TABLE public.event_team_invitations DROP COLUMN IF EXISTS role_label;

COMMIT;

NOTIFY pgrst, 'reload schema';
