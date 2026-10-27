-- Migration 196: account-less event staff sessions and ticket attribution.
-- Requires migration 195. db/ is canonical; mirror this file byte-for-byte.
-- Authenticated callers never execute these privileged RPCs directly; the
-- application calls them with the Supabase service role after route checks.

BEGIN;

ALTER TABLE public.event_team_invitations
  ADD COLUMN IF NOT EXISTS token_consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

ALTER TABLE public.event_team_invitations
  DROP CONSTRAINT IF EXISTS event_team_invitations_status_check;
ALTER TABLE public.event_team_invitations
  ADD CONSTRAINT event_team_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked', 'locked'));

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.event_team_invitations'::regclass
       AND conname = 'event_team_invitations_event_id_id_key'
  ) THEN
    ALTER TABLE public.event_team_invitations
      ADD CONSTRAINT event_team_invitations_event_id_id_key UNIQUE (event_id, id);
  END IF;
END
$migration$;

ALTER TABLE public.event_team_members
  ADD COLUMN IF NOT EXISTS invitation_id uuid;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.event_team_members'::regclass
       AND conname = 'event_team_members_invitation_event_fk'
  ) THEN
    ALTER TABLE public.event_team_members
      ADD CONSTRAINT event_team_members_invitation_event_fk
      FOREIGN KEY (event_id, invitation_id)
      REFERENCES public.event_team_invitations(event_id, id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.event_team_members'::regclass
       AND conname = 'event_team_members_invitation_accountless_check'
  ) THEN
    ALTER TABLE public.event_team_members
      ADD CONSTRAINT event_team_members_invitation_accountless_check
      CHECK (invitation_id IS NULL OR user_id IS NULL) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.event_team_members'::regclass
       AND conname = 'event_team_members_event_id_id_key'
  ) THEN
    ALTER TABLE public.event_team_members
      ADD CONSTRAINT event_team_members_event_id_id_key UNIQUE (event_id, id);
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS event_team_members_invitation_uniq
  ON public.event_team_members(event_id, invitation_id)
  WHERE user_id IS NULL AND invitation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.event_staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  staff_member_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  hard_expires_at timestamptz NOT NULL,
  last_renewed_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_staff_sessions_member_event_fk
    FOREIGN KEY (event_id, staff_member_id)
    REFERENCES public.event_team_members(event_id, id) ON DELETE CASCADE,
  CONSTRAINT event_staff_sessions_invitation_event_fk
    FOREIGN KEY (event_id, invitation_id)
    REFERENCES public.event_team_invitations(event_id, id) ON DELETE CASCADE,
  CONSTRAINT event_staff_sessions_expiry_order
    CHECK (expires_at > created_at AND hard_expires_at >= expires_at),
  CONSTRAINT event_staff_sessions_invitation_key UNIQUE (invitation_id)
);

CREATE INDEX IF NOT EXISTS idx_event_staff_sessions_event_id
  ON public.event_staff_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_staff_sessions_member_id
  ON public.event_staff_sessions(staff_member_id);
CREATE INDEX IF NOT EXISTS idx_event_staff_sessions_expires_at
  ON public.event_staff_sessions(expires_at);

ALTER TABLE public.event_staff_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_staff_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_staff_sessions TO service_role;

ALTER TABLE public.ticket_checkins
  ADD COLUMN IF NOT EXISTS scanned_by_staff_member_id uuid
    REFERENCES public.event_team_members(id) ON DELETE SET NULL;
ALTER TABLE public.offline_scan_conflicts
  ADD COLUMN IF NOT EXISTS scanned_by_staff_member_id uuid
    REFERENCES public.event_team_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_checkins_scanned_by_staff_member
  ON public.ticket_checkins(scanned_by_staff_member_id)
  WHERE scanned_by_staff_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offline_conflicts_scanned_by_staff_member
  ON public.offline_scan_conflicts(scanned_by_staff_member_id)
  WHERE scanned_by_staff_member_id IS NOT NULL;

-- Remove the unsafe draft RPCs and any broad grants from the prior draft.
DROP FUNCTION IF EXISTS public.consume_event_invitation_atomic(uuid, char(64), text);
DROP FUNCTION IF EXISTS public.consume_event_invitation_atomic(text, text, text);
DROP FUNCTION IF EXISTS public.revokeStaffMember(uuid);
DROP FUNCTION IF EXISTS public.validate_and_renew_event_staff_session(uuid, text);
DROP FUNCTION IF EXISTS public.check_in_ticket(uuid, uuid, uuid, uuid, uuid, text, text, uuid, timestamptz, text, uuid);

CREATE FUNCTION public.consume_event_invitation_atomic(
  p_invitation_token_hash text,
  p_phone_last4 text,
  p_session_token_hash text
)
RETURNS TABLE (
  out_member_id uuid,
  out_event_id uuid,
  out_role text,
  out_entrance_id uuid,
  out_session_expires_at timestamptz,
  out_session_hard_expires_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_invitation public.event_team_invitations%ROWTYPE;
  v_member_id uuid;
  v_expires_at timestamptz;
  v_hard_expires_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_invitation_token_hash IS NULL
     OR p_invitation_token_hash !~ '^[0-9a-f]{64}$'
     OR p_session_token_hash IS NULL
     OR p_session_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  SELECT i.* INTO v_invitation
    FROM public.event_team_invitations AS i
   WHERE i.token_hash = p_invitation_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_invitation.is_accountless IS DISTINCT FROM true
     OR v_invitation.status <> 'pending'
     OR v_invitation.token_consumed_at IS NOT NULL
     OR v_invitation.revoked_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_invitation.expires_at <= v_now THEN
    UPDATE public.event_team_invitations
       SET status = 'expired', updated_at = v_now
     WHERE id = v_invitation.id AND status = 'pending';
    RETURN;
  END IF;

  IF v_invitation.phone IS NULL
     OR p_phone_last4 IS NULL
     OR p_phone_last4 !~ '^[0-9]{4}$'
     OR right(v_invitation.phone, 4) IS DISTINCT FROM p_phone_last4 THEN
    UPDATE public.event_team_invitations AS i
       SET failed_attempts = LEAST(COALESCE(i.failed_attempts, 0) + 1, 5),
           status = CASE WHEN COALESCE(i.failed_attempts, 0) + 1 >= 5
                         THEN 'locked' ELSE i.status END,
           updated_at = v_now
     WHERE i.id = v_invitation.id
     RETURNING i.failed_attempts INTO v_invitation.failed_attempts;
    RETURN;
  END IF;

  v_hard_expires_at := v_now + interval '90 days';
  v_expires_at := LEAST(v_now + interval '30 days', v_hard_expires_at);

  INSERT INTO public.event_team_members (
    event_id, user_id, role, entrance_id, status, invited_by, invited_at,
    accepted_at, role_label, position_label, staff_name, invitation_id, updated_at
  ) VALUES (
    v_invitation.event_id, NULL, v_invitation.role, v_invitation.entrance_id,
    'active', v_invitation.invited_by, v_invitation.created_at, v_now,
    v_invitation.role_label, v_invitation.position_label, v_invitation.staff_name,
    v_invitation.id, v_now
  )
  ON CONFLICT (event_id, invitation_id) WHERE user_id IS NULL AND invitation_id IS NOT NULL
  DO UPDATE SET
    role = EXCLUDED.role,
    entrance_id = EXCLUDED.entrance_id,
    status = 'active',
    accepted_at = v_now,
    removed_at = NULL,
    updated_at = v_now
  RETURNING id INTO v_member_id;

  INSERT INTO public.event_staff_sessions (
    event_id, staff_member_id, invitation_id, token_hash,
    created_at, expires_at, hard_expires_at, last_renewed_at, updated_at
  ) VALUES (
    v_invitation.event_id, v_member_id, v_invitation.id, p_session_token_hash,
    v_now, v_expires_at, v_hard_expires_at, v_now, v_now
  );

  UPDATE public.event_team_invitations
     SET token_consumed_at = v_now,
         accepted_at = COALESCE(accepted_at, v_now),
         status = 'accepted',
         updated_at = v_now
   WHERE id = v_invitation.id AND status = 'pending';

  RETURN QUERY
  SELECT v_member_id, v_invitation.event_id, v_invitation.role,
         v_invitation.entrance_id, v_expires_at, v_hard_expires_at;
END;
$function$;

CREATE FUNCTION public.validate_and_renew_event_staff_session(
  p_event_id uuid,
  p_session_token_hash text
)
RETURNS TABLE (
  out_staff_member_id uuid,
  out_role text,
  out_entrance_id uuid,
  out_session_expires_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_session_id uuid;
  v_member_id uuid;
  v_role text;
  v_entrance_id uuid;
  v_hard_expires_at timestamptz;
  v_last_renewed_at timestamptz;
  v_expires_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_event_id IS NULL OR p_session_token_hash IS NULL
     OR p_session_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  SELECT s.id, m.id, m.role, m.entrance_id, s.hard_expires_at,
         s.last_renewed_at, s.expires_at
    INTO v_session_id, v_member_id, v_role, v_entrance_id,
         v_hard_expires_at, v_last_renewed_at, v_expires_at
    FROM public.event_staff_sessions AS s
    JOIN public.event_team_members AS m
      ON m.id = s.staff_member_id AND m.event_id = s.event_id
    JOIN public.event_team_invitations AS i
      ON i.id = s.invitation_id AND i.event_id = s.event_id
   WHERE s.event_id = p_event_id
     AND s.token_hash = p_session_token_hash
     AND s.revoked_at IS NULL
     AND s.expires_at > v_now
     AND s.hard_expires_at > v_now
     AND m.user_id IS NULL
     AND m.status = 'active'
     AND m.invitation_id = i.id
     AND i.is_accountless = true
     AND i.status = 'accepted'
     AND i.token_consumed_at IS NOT NULL
     AND i.revoked_at IS NULL
   FOR UPDATE OF s, m;

  IF v_session_id IS NULL THEN
    RETURN;
  END IF;

  IF v_last_renewed_at < v_now - interval '24 hours' THEN
    UPDATE public.event_staff_sessions AS s
       SET expires_at = LEAST(v_now + interval '30 days', v_hard_expires_at),
           last_renewed_at = v_now,
           updated_at = v_now
     WHERE s.id = v_session_id
       AND s.revoked_at IS NULL
       AND s.hard_expires_at > v_now
       AND s.last_renewed_at < v_now - interval '24 hours'
    RETURNING s.expires_at INTO v_expires_at;
    IF NOT FOUND THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT v_member_id, v_role, v_entrance_id, v_expires_at;
END;
$function$;

-- All event staff removal paths invalidate guest access in the same transaction.
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

DROP TRIGGER IF EXISTS trg_revoke_event_staff_sessions_on_member_removal
  ON public.event_team_members;
CREATE TRIGGER trg_revoke_event_staff_sessions_on_member_removal
AFTER UPDATE OF status ON public.event_team_members
FOR EACH ROW
EXECUTE FUNCTION public.revoke_event_staff_session_on_member_removal();

-- Backwards-compatible new signature for the existing ticket_instances flow.
-- The existing two-argument check_in_ticket remains unchanged for account callers.
CREATE FUNCTION public.check_in_ticket(
  p_ticket_instance_id uuid,
  p_event_id uuid,
  p_scanned_by_user_id uuid,
  p_delegating_user_id uuid,
  p_staff_member_id uuid,
  p_session_token_hash text,
  p_scan_source text,
  p_offline_scan_id uuid,
  p_scanned_at timestamptz,
  p_device_id text,
  p_entrance_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_ticket_id uuid;
  v_event_id uuid;
  v_order_id uuid;
  v_current_event_id uuid;
  v_current_status text;
  v_authorizing_user_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_scan_source IS NULL OR p_scan_source NOT IN ('online', 'offline', 'offline_sync') THEN
    RAISE EXCEPTION 'INVALID_SCAN_SOURCE';
  END IF;
  IF (p_scan_source <> 'online' AND p_offline_scan_id IS NULL) THEN
    RAISE EXCEPTION 'OFFLINE_SCAN_ID_REQUIRED';
  END IF;

  IF p_staff_member_id IS NOT NULL THEN
    IF p_scanned_by_user_id IS NOT NULL OR p_delegating_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'SCANNER_IDENTITY_AMBIGUOUS';
    END IF;
    PERFORM 1
      FROM public.event_staff_sessions AS s
      JOIN public.event_team_members AS m
        ON m.id = s.staff_member_id AND m.event_id = s.event_id
      JOIN public.event_team_invitations AS i
        ON i.id = s.invitation_id AND i.event_id = s.event_id
     WHERE s.event_id = p_event_id
       AND s.staff_member_id = p_staff_member_id
       AND s.token_hash = p_session_token_hash
       AND s.revoked_at IS NULL
       AND s.expires_at > v_now
       AND s.hard_expires_at > v_now
       AND m.user_id IS NULL
       AND m.status = 'active'
       AND m.role IN ('event_manager', 'ticket_scanner')
       AND m.invitation_id = i.id
       AND i.is_accountless = true
       AND i.status = 'accepted'
       AND i.revoked_at IS NULL
     FOR UPDATE OF s, m;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'STAFF_SESSION_INVALID';
    END IF;
  ELSE
    IF p_scanned_by_user_id IS NOT NULL
       AND p_delegating_user_id IS NOT NULL
       AND p_scanned_by_user_id <> p_delegating_user_id THEN
      RAISE EXCEPTION 'SCANNER_IDENTITY_AMBIGUOUS';
    END IF;
    v_authorizing_user_id := COALESCE(p_scanned_by_user_id, p_delegating_user_id);
    IF v_authorizing_user_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM public.events AS e
        LEFT JOIN public.organizers AS o ON o.id = e.organizer_id
       WHERE e.id = p_event_id
         AND (
           e.user_id = v_authorizing_user_id
           OR o.user_id = v_authorizing_user_id
           OR public.is_entity_member(e.organizer_id, ARRAY['owner', 'admin', 'manager']::text[])
           OR EXISTS (
             SELECT 1 FROM public.event_team_members AS m
              WHERE m.event_id = e.id
                AND m.user_id = v_authorizing_user_id
                AND m.status = 'active'
                AND m.role IN ('event_manager', 'ticket_scanner')
           )
           OR EXISTS (
             SELECT 1 FROM public.profiles AS p
              WHERE p.id = v_authorizing_user_id
                AND p.role = 'admin'
                AND p.status = 'active'
           )
         )
    ) THEN
      RAISE EXCEPTION 'SCANNER_PERMISSION_DENIED';
    END IF;
  END IF;

  IF p_staff_member_id IS NULL AND p_scanned_by_user_id IS NULL AND p_delegating_user_id IS NULL THEN
    RAISE EXCEPTION 'SCANNER_IDENTITY_REQUIRED';
  END IF;

  UPDATE public.ticket_instances AS ti
     SET status = 'used', checked_in_at = v_now, updated_at = v_now
   WHERE ti.id = p_ticket_instance_id
     AND ti.event_id = p_event_id
     AND ti.status = 'valid'
  RETURNING ti.id, ti.event_id, ti.order_id
       INTO v_ticket_id, v_event_id, v_order_id;

  IF v_ticket_id IS NOT NULL THEN
    INSERT INTO public.ticket_checkins (
      ticket_instance_id, ticket_order_id, event_id, scanned_by_user_id, delegating_user_id,
      scanned_by_staff_member_id, checked_in_at, scan_source, offline_scan_id,
      offline_scanned_at, device_id, entrance_id
    ) VALUES (
      v_ticket_id, v_order_id, v_event_id, p_scanned_by_user_id, p_delegating_user_id,
      p_staff_member_id, v_now, p_scan_source,
      p_offline_scan_id,
      CASE WHEN p_scan_source = 'online' THEN NULL ELSE COALESCE(p_scanned_at, v_now) END,
      p_device_id, p_entrance_id
    );
    RETURN v_ticket_id;
  END IF;

  SELECT ti.event_id, ti.status
    INTO v_current_event_id, v_current_status
    FROM public.ticket_instances AS ti
   WHERE ti.id = p_ticket_instance_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND';
  ELSIF v_current_event_id <> p_event_id THEN
    RAISE EXCEPTION 'WRONG_EVENT';
  ELSIF v_current_status = 'used' THEN
    RAISE EXCEPTION 'ALREADY_CHECKED_IN';
  ELSIF v_current_status = 'cancelled' THEN
    RAISE EXCEPTION 'TICKET_CANCELLED';
  ELSIF v_current_status = 'refunded' THEN
    RAISE EXCEPTION 'TICKET_REFUNDED';
  ELSE
    RAISE EXCEPTION 'TICKET_NOT_VALID';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_event_invitation_atomic(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_event_invitation_atomic(text, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.validate_and_renew_event_staff_session(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_renew_event_staff_session(uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.revoke_event_staff_session_on_member_removal()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_in_ticket(uuid, uuid, uuid, uuid, uuid, text, text, uuid, timestamptz, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(uuid, uuid, uuid, uuid, uuid, text, text, uuid, timestamptz, text, uuid)
  TO service_role;

COMMENT ON COLUMN public.event_team_members.invitation_id IS
  'Account-less staff member invitation; NULL for account-based members.';
COMMENT ON COLUMN public.ticket_checkins.scanned_by_staff_member_id IS
  'Event-team member attribution for account-less check-ins; never an auth.users identity.';

COMMIT;

NOTIFY pgrst, 'reload schema';
