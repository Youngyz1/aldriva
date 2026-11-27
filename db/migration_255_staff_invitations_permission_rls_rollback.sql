-- 255 rollback: drops only the three additive policies. Idempotent.
DROP POLICY IF EXISTS "Staff permission can read staff invitations" ON public.staff_invitations;
DROP POLICY IF EXISTS "Staff permission can create staff invitations" ON public.staff_invitations;
DROP POLICY IF EXISTS "Staff permission can revoke staff invitations" ON public.staff_invitations;

DO $$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'staff_invitations'
    AND policyname LIKE 'Staff permission can % staff invitations';
  IF v_left <> 0 THEN
    RAISE EXCEPTION '255 ROLLBACK CHECK FAILED: % new policies remain', v_left;
  END IF;
END
$$;