-- Guarded rollback for migration 211. Run manually only after confirming no
-- invitation has ever been reissued (reissue_count = 0 everywhere) and no
-- revoked-but-still-present session row exists for an invitation that also
-- has an active one (the exact state the partial unique index allows and
-- the old plain UNIQUE constraint forbade).

BEGIN;

LOCK TABLE public.event_staff_sessions, public.event_team_invitations
  IN ACCESS EXCLUSIVE MODE;

DO $rollback_guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.event_team_invitations WHERE reissue_count > 0
  ) THEN
    RAISE EXCEPTION 'MIGRATION_211_ROLLBACK_BLOCKED: % invitation(s) have been reissued; restoring the plain UNIQUE(invitation_id) constraint would then fail or silently hide revoked sessions', (SELECT count(*) FROM public.event_team_invitations WHERE reissue_count > 0);
  END IF;
  IF EXISTS (
    SELECT invitation_id FROM public.event_staff_sessions
    GROUP BY invitation_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'MIGRATION_211_ROLLBACK_BLOCKED: at least one invitation_id has more than one event_staff_sessions row; the pre-211 UNIQUE(invitation_id) constraint cannot be restored without deleting history';
  END IF;
END
$rollback_guard$;

-- Member-removal trigger: restore the pre-211 'accepted'-only revoke scope.
CREATE OR REPLACE FUNCTION public.revoke_event_staff_session_on_member_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'removed' THEN
    UPDATE public.event_staff_sessions
       SET revoked_at = COALESCE(revoked_at, v_now), updated_at = v_now
     WHERE staff_member_id = NEW.id AND event_id = NEW.event_id;

    UPDATE public.event_team_invitations
       SET status = 'revoked',
           revoked_at = COALESCE(revoked_at, v_now),
           updated_at = v_now
     WHERE id = NEW.invitation_id
       AND status = 'accepted';
  END IF;
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.reissue_event_staff_invitation(uuid, uuid, text, timestamptz);

ALTER TABLE public.event_team_invitations
  DROP CONSTRAINT IF EXISTS event_team_invitations_reissue_count_check,
  DROP COLUMN IF EXISTS reissue_count,
  DROP COLUMN IF EXISTS last_reissued_at;

DROP INDEX IF EXISTS public.event_staff_sessions_invitation_active_key;
ALTER TABLE public.event_staff_sessions
  ADD CONSTRAINT event_staff_sessions_invitation_key UNIQUE (invitation_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
