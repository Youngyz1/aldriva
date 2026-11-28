-- Migration 247 (option B): invite by email OR phone; accept_staff_invitation(p_token uuid).
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT. Idempotent.
-- Phone is stored as digits only (7-15), matching how auth.users.phone is stored.
-- delivery_channel is informational only; it never affects who may accept.

-- 0. PREFLIGHT
DO $$
BEGIN
  IF to_regprocedure('public.staff_invitee_email_matches(text)') IS NULL
     OR to_regprocedure('public.staff_is_accepting_own_invitation(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'helper functions missing -- aborting 247';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                 WHERE t.tgrelid = 'public.staff_invitations'::regclass
                   AND p.proname = 'staff_invitations_guard_accept_fields' AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION 'accept-fields guard trigger missing or disabled -- aborting 247';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='auth' AND table_name='users' AND column_name IN ('phone','phone_confirmed_at')
                 HAVING count(*) = 2) THEN
    RAISE EXCEPTION 'auth.users phone columns missing -- aborting 247';
  END IF;
END;
$$;

-- 1. Columns
ALTER TABLE public.staff_invitations ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS delivery_channel text;

-- 2. Constraints (existing rows all have an email, so all three validate)
ALTER TABLE public.staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_phone_check;
ALTER TABLE public.staff_invitations ADD CONSTRAINT staff_invitations_phone_check
  CHECK (phone IS NULL OR phone ~ '^[0-9]{7,15}$');
ALTER TABLE public.staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_channel_check;
ALTER TABLE public.staff_invitations ADD CONSTRAINT staff_invitations_channel_check
  CHECK (delivery_channel IS NULL OR delivery_channel IN ('email','sms','whatsapp','link'));
ALTER TABLE public.staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_contact_check;
ALTER TABLE public.staff_invitations ADD CONSTRAINT staff_invitations_contact_check
  CHECK (email IS NOT NULL OR phone IS NOT NULL);

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_staff_invitations_phone ON public.staff_invitations (phone);

-- 4. Phone match helper: the signed-in user's VERIFIED phone equals the invitation phone.
CREATE OR REPLACE FUNCTION public.staff_invitee_phone_matches(p_phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT COALESCE(p_phone, '') <> '' AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.phone_confirmed_at IS NOT NULL
      AND COALESCE(u.phone, '') <> ''
      AND regexp_replace(u.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
  );
$$;
REVOKE ALL ON FUNCTION public.staff_invitee_phone_matches(text) FROM PUBLIC, anon, authenticated;

-- 5. The accept function
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
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
$$;

-- 6. Privileges
REVOKE ALL ON FUNCTION public.accept_staff_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(uuid) TO authenticated;

-- 7. HARD CHECK
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated','public.accept_staff_invitation(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.accept_staff_invitation(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'unexpected EXECUTE privileges on accept_staff_invitation';
  END IF;
  IF has_function_privilege('authenticated','public.staff_invitee_phone_matches(text)','EXECUTE')
     OR has_function_privilege('anon','public.staff_invitee_phone_matches(text)','EXECUTE') THEN
    RAISE EXCEPTION 'phone helper must not be callable by authenticated/anon';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.accept_staff_invitation(uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'accept_staff_invitation is not SECURITY DEFINER';
  END IF;
  IF (SELECT attnotnull FROM pg_attribute
      WHERE attrelid = 'public.staff_invitations'::regclass AND attname = 'email') THEN
    RAISE EXCEPTION 'email is still NOT NULL';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.staff_invitations'::regclass
      AND conname IN ('staff_invitations_phone_check','staff_invitations_channel_check','staff_invitations_contact_check')) <> 3 THEN
    RAISE EXCEPTION 'expected 3 new check constraints';
  END IF;
END;
$$;