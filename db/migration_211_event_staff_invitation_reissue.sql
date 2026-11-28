-- migration_211_event_staff_invitation_reissue.sql
-- Guest Scanner Fix Round, F1: re-invite (revive the same invitation) for
-- account-less (is_accountless = true) event staff invitations.
--
-- Today, resend only mints a fresh token for a 'pending' invitation; an
-- account-less invitation that is 'accepted', 'revoked', 'declined',
-- 'expired', or 'locked' is a dead end — the organizer must create a brand
-- new invitation row, losing the staff_name/role_label/position_label
-- history and the reissue trail on the original row. This migration adds a
-- single atomic path that revives the SAME invitation row from any of its
-- terminal states back to 'pending', while revoking every session the
-- invitation ever minted (so an old redeemed link can never keep scanning
-- after a reissue).
--
-- 1. event_staff_sessions.invitation_id was UNIQUE (one session per
--    invitation, ever). Reissuing an already-redeemed invitation must be
--    able to mint a second session row for the same invitation_id once the
--    first is revoked, so the plain UNIQUE constraint is replaced with a
--    partial unique index that only applies to still-active
--    (revoked_at IS NULL) sessions. Checked: no ON CONFLICT clause and no
--    FOREIGN KEY anywhere in db/ or app/lib code targets
--    event_staff_sessions_invitation_key by name (grep confirmed before
--    authoring this file) — safe to drop.
-- 2. event_team_invitations gets reissue_count + last_reissued_at so the
--    team UI/audit trail can show how many times a link was revived.
-- 3. reissue_event_staff_invitation(): SECURITY DEFINER, service-role only,
--    same posture as consume_event_invitation_atomic /
--    validate_and_renew_event_staff_session (migration 196). One
--    transaction: lock the invitation row, validate it, revoke every
--    session it ever minted, then reset it to a fresh 'pending' state with
--    a new token hash and expiry. Returns zero rows on any validation
--    failure (never raises for a business-rule rejection, matching the
--    existing two RPCs' convention) so the caller can distinguish
--    "not found/ineligible" from a hard error.
--
--    CHECK constraints audited against this function's UPDATE (none
--    reject it):
--      event_team_invitations_status_check:          status IN ('pending','accepted','declined','expired','revoked','locked') -> 'pending' OK
--      event_team_invitations_failed_attempts_check:  failed_attempts BETWEEN 0 AND 5 (NOT VALID)                              -> 0 OK
--      event_team_invitations_token_hash_format:      token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'                      -> caller passes a SHA-256 hex hash OK
--      event_team_invitations_phone_e164_check:       phone IS NULL OR phone ~ '^\+[1-9][0-9]{1,14}$' (NOT VALID)              -> phone untouched OK
--      event_team_invitations_accountless_phone_check: NOT is_accountless OR phone IS NOT NULL (NOT VALID)                    -> is_accountless/phone untouched OK
--      event_team_invitations_role_label_len / position_label_len / staff_name_len -> untouched OK
-- 4. The member-removal trigger (revoke_event_staff_session_on_member_removal,
--    migration 196) only revoked the linked invitation when its status was
--    'accepted'. A guest invited, then removed while still 'pending' (never
--    redeemed) kept a live, resendable invitation row after removal. The
--    trigger now also revokes a 'pending' invitation on member removal.
--
-- Idempotent: constraint drops/adds use IF EXISTS / guarded DO blocks,
-- indexes use IF NOT EXISTS, functions use CREATE OR REPLACE, the trigger
-- is dropped and recreated. Safe to re-run.
-- Rollback: db/migration_211_event_staff_invitation_reissue_rollback.sql

BEGIN;

-- ── 1. event_staff_sessions: one session per invitation, ONLY while active ──

ALTER TABLE public.event_staff_sessions
  DROP CONSTRAINT IF EXISTS event_staff_sessions_invitation_key;

CREATE UNIQUE INDEX IF NOT EXISTS event_staff_sessions_invitation_active_key
  ON public.event_staff_sessions(invitation_id)
  WHERE revoked_at IS NULL;

-- ── 2. Reissue trail on the invitation row ──────────────────────────────────

ALTER TABLE public.event_team_invitations
  ADD COLUMN IF NOT EXISTS reissue_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reissued_at timestamptz;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.event_team_invitations'::regclass
       AND conname = 'event_team_invitations_reissue_count_check'
  ) THEN
    ALTER TABLE public.event_team_invitations
      ADD CONSTRAINT event_team_invitations_reissue_count_check
      CHECK (reissue_count >= 0);
  END IF;
END
$migration$;

COMMENT ON COLUMN public.event_team_invitations.reissue_count IS
  'Times this account-less invitation has been revived via reissue_event_staff_invitation().';
COMMENT ON COLUMN public.event_team_invitations.last_reissued_at IS
  'Timestamp of the most recent reissue_event_staff_invitation() call for this row, if any.';

-- ── 3. Atomic reissue RPC (account-less invitations only) ──────────────────

CREATE OR REPLACE FUNCTION public.reissue_event_staff_invitation(
  p_event_id uuid,
  p_invitation_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS TABLE (
  out_invitation_id uuid,
  out_previous_status text,
  out_new_expires_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_invitation public.event_team_invitations%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  SELECT i.* INTO v_invitation
    FROM public.event_team_invitations AS i
   WHERE i.id = p_invitation_id
     AND i.event_id = p_event_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_invitation.is_accountless IS DISTINCT FROM true
     OR v_invitation.status NOT IN ('pending', 'expired', 'locked', 'declined', 'revoked', 'accepted') THEN
    RETURN;
  END IF;

  -- Every session this invitation ever minted stops authorizing scans. The
  -- COALESCE never clobbers an earlier revocation timestamp with a later one.
  UPDATE public.event_staff_sessions
     SET revoked_at = COALESCE(revoked_at, v_now), updated_at = v_now
   WHERE invitation_id = p_invitation_id;

  UPDATE public.event_team_invitations
     SET token_hash = p_token_hash,
         status = 'pending',
         failed_attempts = 0,
         expires_at = p_expires_at,
         token_consumed_at = NULL,
         accepted_at = NULL,
         revoked_at = NULL,
         reissue_count = reissue_count + 1,
         last_reissued_at = v_now,
         updated_at = v_now
   WHERE id = p_invitation_id;

  RETURN QUERY SELECT v_invitation.id, v_invitation.status, p_expires_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.reissue_event_staff_invitation(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reissue_event_staff_invitation(uuid, uuid, text, timestamptz)
  TO service_role;

-- ── 4. Member-removal trigger: also revoke a still-'pending' invitation ────

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
       AND status IN ('accepted', 'pending');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_revoke_event_staff_sessions_on_member_removal
  ON public.event_team_members;
CREATE TRIGGER trg_revoke_event_staff_sessions_on_member_removal
AFTER UPDATE OF status ON public.event_team_members
FOR EACH ROW
EXECUTE FUNCTION public.revoke_event_staff_session_on_member_removal();

REVOKE ALL ON FUNCTION public.revoke_event_staff_session_on_member_removal()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
