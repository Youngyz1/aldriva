-- migration_258_staff_invitation_hardening.sql
-- Phase 1 of invitation hardening. No BEGIN/COMMIT. Apply statement by statement.
-- Adds token_hash (SHA-256 hex of the lowercase uuid text), looks up by hash,
-- retires sibling pending invitations on accept, one pending invitation per
-- staff member, revoke function, tighter guard, tighter table grants.
-- The plaintext token column is KEPT in this phase (the current app still
-- reads it). Migration 259 will null it after the app change is live.

-- ============================================================
-- STATEMENT 0: PREFLIGHT
-- ============================================================
DO $pre$
DECLARE
  v_dups integer;
BEGIN
  IF to_regclass('public.staff_invitations') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT: public.staff_invitations missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='staff_invitations' AND column_name='token') THEN
    RAISE EXCEPTION 'PREFLIGHT: staff_invitations.token missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='accept_staff_invitation') THEN
    RAISE EXCEPTION 'PREFLIGHT: accept_staff_invitation missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='staff_invitations_guard_accept_fields') THEN
    RAISE EXCEPTION 'PREFLIGHT: staff_invitations_guard_accept_fields missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='staff_invitee_email_matches') THEN
    RAISE EXCEPTION 'PREFLIGHT: staff_invitee_email_matches missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='staff_invitee_phone_matches') THEN
    RAISE EXCEPTION 'PREFLIGHT: staff_invitee_phone_matches missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='staff_has_permission') THEN
    RAISE EXCEPTION 'PREFLIGHT: staff_has_permission missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='is_entity_member') THEN
    RAISE EXCEPTION 'PREFLIGHT: is_entity_member missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='is_staff_branch_manager') THEN
    RAISE EXCEPTION 'PREFLIGHT: is_staff_branch_manager missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='staff_resolve_business_organizer') THEN
    RAISE EXCEPTION 'PREFLIGHT: staff_resolve_business_organizer missing';
  END IF;

  -- Duplicate pending invitations (including expired-but-still-pending rows)
  -- would make the one-pending-per-person index fail.
  SELECT count(*) INTO v_dups FROM (
    SELECT staff_member_id FROM public.staff_invitations
     WHERE status = 'pending' AND staff_member_id IS NOT NULL
     GROUP BY staff_member_id HAVING count(*) > 1) d;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT: % staff member(s) have more than one pending invitation. Revoke the extras first.', v_dups;
  END IF;
END
$pre$;

-- ============================================================
-- STATEMENT 1: hash helper (only definer functions call it)
-- ============================================================
CREATE OR REPLACE FUNCTION public.staff_invitation_token_hash(p_token uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $fn$
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token::text, 'UTF8')), 'hex');
$fn$;

-- ============================================================
-- STATEMENT 2: token_hash column
-- ============================================================
ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS token_hash text;

-- ============================================================
-- STATEMENT 3: insert trigger function (fills token_hash when the app does not)
-- ============================================================
CREATE OR REPLACE FUNCTION public.staff_invitations_set_token_hash()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NEW.token_hash IS NULL AND NEW.token IS NOT NULL THEN
    NEW.token_hash := public.staff_invitation_token_hash(NEW.token);
  END IF;
  RETURN NEW;
END;
$fn$;

-- ============================================================
-- STATEMENT 4: insert trigger
-- ============================================================
DROP TRIGGER IF EXISTS trg_staff_invitations_set_token_hash ON public.staff_invitations;
CREATE TRIGGER trg_staff_invitations_set_token_hash
  BEFORE INSERT ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.staff_invitations_set_token_hash();

-- ============================================================
-- STATEMENT 5: backfill existing rows
-- ============================================================
UPDATE public.staff_invitations
   SET token_hash = public.staff_invitation_token_hash(token)
 WHERE token_hash IS NULL AND token IS NOT NULL;

-- ============================================================
-- STATEMENT 6: token_hash NOT NULL
-- ============================================================
ALTER TABLE public.staff_invitations ALTER COLUMN token_hash SET NOT NULL;

-- ============================================================
-- STATEMENT 7: unique index on token_hash
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_invitations_token_hash
  ON public.staff_invitations (token_hash);

-- ============================================================
-- STATEMENT 8: one pending invitation per staff member
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_invitations_one_pending_per_staff
  ON public.staff_invitations (staff_member_id)
  WHERE status = 'pending' AND staff_member_id IS NOT NULL;

-- ============================================================
-- STATEMENT 9: tighter guard
-- ============================================================
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
    IF NEW.token IS DISTINCT FROM OLD.token
       OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
    THEN
      RAISE EXCEPTION 'token and token_hash cannot be changed'
        USING ERRCODE = '42501', HINT = 'invitation_token_locked';
    END IF;
    IF OLD.status IS DISTINCT FROM 'pending' AND NEW.status = 'pending' THEN
      RAISE EXCEPTION 'an invitation that is not pending cannot be made pending again'
        USING ERRCODE = '42501', HINT = 'invitation_reopen_denied';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================
-- STATEMENT 10: accept by hash + retire sibling pending invitations
-- ============================================================
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

  SELECT * INTO v_inv FROM public.staff_invitations
   WHERE token_hash = public.staff_invitation_token_hash(p_token) FOR UPDATE;

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

  -- 4) Retire this person's other pending invitations.
  UPDATE public.staff_invitations
     SET status = 'revoked'
   WHERE staff_member_id = v_inv.staff_member_id
     AND id <> v_inv.id
     AND status = 'pending';

  RETURN v_inv.staff_member_id;
END;
$function$;

-- ============================================================
-- STATEMENT 11: revoke function (same predicates as the DELETE policies)
-- ============================================================
CREATE OR REPLACE FUNCTION public.revoke_staff_invitation(p_invitation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_inv   public.staff_invitations%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'not allowed to revoke this invitation' USING ERRCODE = '42501', HINT = 'revoke_denied';
  END IF;

  SELECT * INTO v_inv FROM public.staff_invitations WHERE id = p_invitation_id FOR UPDATE;

  IF NOT FOUND OR NOT (
       public.is_entity_member(public.staff_resolve_business_organizer(v_inv.business_id),
                               ARRAY['owner','admin','manager']::text[])
    OR public.is_staff_branch_manager(v_inv.business_id, v_inv.branch_id)
    OR EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = v_actor AND p.role = 'admin' AND p.status = 'active')
    OR EXISTS (SELECT 1 FROM public.businesses b
                WHERE b.id = v_inv.business_id AND b.owner_id = v_actor)
    OR public.staff_has_permission(v_inv.business_id, 'workforce.invite', v_inv.branch_id)
  ) THEN
    RAISE EXCEPTION 'not allowed to revoke this invitation' USING ERRCODE = '42501', HINT = 'revoke_denied';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN false;
  END IF;

  UPDATE public.staff_invitations SET status = 'revoked'
   WHERE id = v_inv.id AND status = 'pending';
  RETURN true;
END;
$function$;

-- ============================================================
-- STATEMENT 12: function privileges
-- ============================================================
REVOKE ALL ON FUNCTION public.staff_invitation_token_hash(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_invitations_set_token_hash() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_staff_invitation(uuid) FROM PUBLIC;
DO $g$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.staff_invitation_token_hash(uuid) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.staff_invitations_set_token_hash() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.revoke_staff_invitation(uuid) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.staff_invitation_token_hash(uuid) FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.staff_invitations_set_token_hash() FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.revoke_staff_invitation(uuid) TO authenticated';
  END IF;
END
$g$;

-- ============================================================
-- STATEMENT 13: table privileges (RLS does not cover TRUNCATE)
-- ============================================================
DO $g$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.staff_invitations FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.staff_invitations FROM authenticated';
  END IF;
END
$g$;

-- ============================================================
-- STATEMENT 14: HARD CHECK
-- ============================================================
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='staff_invitations'
                   AND column_name='token_hash' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'HARD CHECK: token_hash missing or nullable';
  END IF;
  IF EXISTS (SELECT 1 FROM public.staff_invitations WHERE token_hash IS NULL) THEN
    RAISE EXCEPTION 'HARD CHECK: rows with null token_hash';
  END IF;
  IF to_regclass('public.uq_staff_invitations_token_hash') IS NULL THEN
    RAISE EXCEPTION 'HARD CHECK: uq_staff_invitations_token_hash missing';
  END IF;
  IF to_regclass('public.uq_staff_invitations_one_pending_per_staff') IS NULL THEN
    RAISE EXCEPTION 'HARD CHECK: uq_staff_invitations_one_pending_per_staff missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.staff_invitations'::regclass
                   AND tgname = 'trg_staff_invitations_set_token_hash' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'HARD CHECK: insert trigger missing';
  END IF;
  IF pg_get_functiondef('public.accept_staff_invitation(uuid)'::regprocedure) NOT LIKE '%token_hash%'
     OR pg_get_functiondef('public.accept_staff_invitation(uuid)'::regprocedure) NOT LIKE '%revoked%' THEN
    RAISE EXCEPTION 'HARD CHECK: accept_staff_invitation not updated';
  END IF;
  IF pg_get_functiondef('public.staff_invitations_guard_accept_fields()'::regprocedure) NOT LIKE '%token_hash%' THEN
    RAISE EXCEPTION 'HARD CHECK: guard not updated';
  END IF;
  IF to_regprocedure('public.revoke_staff_invitation(uuid)') IS NULL THEN
    RAISE EXCEPTION 'HARD CHECK: revoke_staff_invitation missing';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE table_schema='public' AND table_name='staff_invitations' AND grantee='anon') THEN
    RAISE EXCEPTION 'HARD CHECK: anon still holds privileges';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE table_schema='public' AND table_name='staff_invitations' AND grantee='authenticated'
                AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')) THEN
    RAISE EXCEPTION 'HARD CHECK: authenticated still holds TRUNCATE/TRIGGER/REFERENCES';
  END IF;
END
$chk$;