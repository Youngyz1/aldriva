-- Guarded rollback for migration 196. Run manually only after draining all
-- account-less staff sessions. It refuses to discard accepted invitations,
-- member mappings, audit attribution, or locked invitation state.

BEGIN;

-- Prevent new sessions, mappings, and attributed check-ins between the guard
-- and the destructive DDL below.
LOCK TABLE public.event_staff_sessions,
           public.event_team_members,
           public.ticket_checkins,
           public.offline_scan_conflicts,
           public.event_team_invitations
  IN ACCESS EXCLUSIVE MODE;

DO $rollback_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_staff_sessions LIMIT 1)
     OR EXISTS (
       SELECT 1 FROM public.event_team_members
        WHERE invitation_id IS NOT NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.ticket_checkins
        WHERE scanned_by_staff_member_id IS NOT NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.offline_scan_conflicts
        WHERE scanned_by_staff_member_id IS NOT NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.event_team_invitations
        WHERE token_consumed_at IS NOT NULL
           OR status = 'locked'
           OR (status = 'accepted' AND is_accountless = true)
     ) THEN
    RAISE EXCEPTION 'MIGRATION_196_ROLLBACK_BLOCKED: account-less staff data still exists';
  END IF;
END
$rollback_guard$;

DROP TRIGGER IF EXISTS trg_revoke_event_staff_sessions_on_member_removal
  ON public.event_team_members;
DROP FUNCTION IF EXISTS public.revoke_event_staff_session_on_member_removal();
DROP FUNCTION IF EXISTS public.consume_event_invitation_atomic(text, text, text);
DROP FUNCTION IF EXISTS public.validate_and_renew_event_staff_session(uuid, text);
DROP FUNCTION IF EXISTS public.check_in_ticket(uuid, uuid, uuid, uuid, uuid, text, text, uuid, timestamptz, text, uuid);

DROP TABLE IF EXISTS public.event_staff_sessions;
DROP INDEX IF EXISTS public.event_team_members_invitation_uniq;
DROP INDEX IF EXISTS public.idx_ticket_checkins_scanned_by_staff_member;
DROP INDEX IF EXISTS public.idx_offline_conflicts_scanned_by_staff_member;
ALTER TABLE public.ticket_checkins
  DROP COLUMN IF EXISTS scanned_by_staff_member_id;
ALTER TABLE public.offline_scan_conflicts
  DROP COLUMN IF EXISTS scanned_by_staff_member_id;

ALTER TABLE public.event_team_members
  DROP CONSTRAINT IF EXISTS event_team_members_invitation_event_fk,
  DROP CONSTRAINT IF EXISTS event_team_members_invitation_accountless_check,
  DROP CONSTRAINT IF EXISTS event_team_members_event_id_id_key,
  DROP COLUMN IF EXISTS invitation_id;

ALTER TABLE public.event_team_invitations
  DROP CONSTRAINT IF EXISTS event_team_invitations_event_id_id_key,
  DROP COLUMN IF EXISTS token_consumed_at,
  DROP COLUMN IF EXISTS revoked_at;

ALTER TABLE public.event_team_invitations
  DROP CONSTRAINT IF EXISTS event_team_invitations_status_check;
ALTER TABLE public.event_team_invitations
  ADD CONSTRAINT event_team_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked'));

COMMIT;

NOTIFY pgrst, 'reload schema';
