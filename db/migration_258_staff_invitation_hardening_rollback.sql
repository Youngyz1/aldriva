-- migration_258_staff_invitation_hardening_rollback.sql
-- Restores the pre-258 accept function and guard, removes everything 258 added,
-- and re-grants the table privileges that existed before (anon: all seven,
-- authenticated: TRUNCATE, TRIGGER, REFERENCES). Idempotent. No BEGIN/COMMIT.
-- Sibling invitations that 258 set to revoked stay revoked.

-- STATEMENT 1: restore accept_staff_invitation (lookup by plaintext token)
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_inv   public.staff_invitations%ROWTYPE;
  v_rows  integer;
  v_prole text;
BEGIN
  IF v_actor IS NULL OR p_token IS NULL THEN
    RAISE EXCEPTION 'invitation is not valid' USING ERRCODE = '42501', HINT = 'invitation_invalid';
  END IF;

  SELECT * INTO v_inv FROM public.staff_invitations WHERE token = p_token FOR UPDATE;

  IF NOT FOUND
     OR v_inv.status <> 'pending'
     OR v_inv.expires_at <= now()
     OR v_inv.accepted_at IS NOT NULL
     OR v_inv.accepted_by IS NOT NULL
     OR v_inv.staff_member_id IS NULL
     OR NOT (
          (v_inv.email IS NOT NULL AND public.staff_invitee_email_matches(v_inv.email))
       OR (v_inv.phone IS NOT NULL AND public.staff_invitee_phone_matches(v_inv.phone))
     ) THEN
    RAISE EXCEPTION 'invitation is not valid' USING ERRCODE = '42501', HINT = 'invitation_invalid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.staff_members sm
                 WHERE sm.id = v_inv.staff_member_id AND sm.business_id = v_inv.business_id
                   AND sm.auth_user_id IS NULL AND sm.status <> 'deactivated') THEN
    RAISE EXCEPTION 'invitation is not valid' USING ERRCODE = '42501', HINT = 'invitation_invalid';
  END IF;

  IF v_inv.role_id IS NOT NULL THEN
    SELECT sr.platform_role INTO v_prole FROM public.staff_roles sr
     WHERE sr.id = v_inv.role_id
       AND (sr.role_scope = 'platform' OR sr.business_id = v_inv.business_id);
    IF NOT FOUND OR v_prole IN ('owner','admin') THEN
      RAISE EXCEPTION 'invitation is not valid' USING ERRCODE = '42501', HINT = 'invitation_invalid';
    END IF;
  END IF;

  -- 1) Mark the invitation accepted FIRST (the 239/240/241 bypass helpers read this row).
  UPDATE public.staff_invitations
     SET status = 'accepted', accepted_by = v_actor, accepted_at = now()
   WHERE id = v_inv.id AND status = 'pending';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'invitation is not valid' USING ERRCODE = '42501', HINT = 'invitation_invalid';
  END IF;

  -- 2) Link the login to the staff record.
  UPDATE public.staff_members SET auth_user_id = v_actor
   WHERE id = v_inv.staff_member_id AND business_id = v_inv.business_id AND auth_user_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'invitation is not valid' USING ERRCODE = '42501', HINT = 'invitation_invalid';
  END IF;

  -- 3) Assign the invited role, once.
  IF v_inv.role_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.staff_member_roles r
                     WHERE r.staff_member_id = v_inv.staff_member_id
                       AND r.role_id = v_inv.role_id AND r.is_active) THEN
    INSERT INTO public.staff_member_roles (staff_member_id, business_id, role_id, details, assigned_by, is_active)
    VALUES (v_inv.staff_member_id, v_inv.business_id, v_inv.role_id, '{}'::jsonb, v_inv.invited_by, true);
  END IF;

  RETURN v_inv.staff_member_id;
END;
$function$;

-- STATEMENT 2: restore the original guard
CREATE OR REPLACE FUNCTION public.staff_invitations_guard_accept_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
       OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
    THEN
      RAISE EXCEPTION 'accepted_by, accepted_at and status=accepted can only be set by accept_staff_invitation'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- STATEMENT 3: drop the insert trigger
DROP TRIGGER IF EXISTS trg_staff_invitations_set_token_hash ON public.staff_invitations;

-- STATEMENT 4: drop indexes
DROP INDEX IF EXISTS public.uq_staff_invitations_one_pending_per_staff;
DROP INDEX IF EXISTS public.uq_staff_invitations_token_hash;

-- STATEMENT 5: drop the revoke function, trigger function and helper
DROP FUNCTION IF EXISTS public.revoke_staff_invitation(uuid);
DROP FUNCTION IF EXISTS public.staff_invitations_set_token_hash();
DROP FUNCTION IF EXISTS public.staff_invitation_token_hash(uuid);

-- STATEMENT 6: drop the column
ALTER TABLE public.staff_invitations DROP COLUMN IF EXISTS token_hash;

-- STATEMENT 7: re-grant the original table privileges
DO $g$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT ALL ON TABLE public.staff_invitations TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLE public.staff_invitations TO authenticated';
  END IF;
END
$g$;

-- STATEMENT 8: HARD CHECK
DO $chk$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='staff_invitations' AND column_name='token_hash') THEN
    RAISE EXCEPTION 'ROLLBACK CHECK: token_hash still present';
  END IF;
  IF pg_get_functiondef('public.accept_staff_invitation(uuid)'::regprocedure) LIKE '%token_hash%' THEN
    RAISE EXCEPTION 'ROLLBACK CHECK: accept function still uses token_hash';
  END IF;
  IF pg_get_functiondef('public.staff_invitations_guard_accept_fields()'::regprocedure) LIKE '%token_hash%' THEN
    RAISE EXCEPTION 'ROLLBACK CHECK: guard still mentions token_hash';
  END IF;
  IF to_regprocedure('public.revoke_staff_invitation(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK CHECK: revoke function still present';
  END IF;
END
$chk$;