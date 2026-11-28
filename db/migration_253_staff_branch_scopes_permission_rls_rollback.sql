-- 253 rollback: drops only the three additive policies. Idempotent.
DROP POLICY IF EXISTS "Staff permission can read staff branch scopes" ON public.staff_member_branch_scopes;
DROP POLICY IF EXISTS "Staff permission can grant staff branch scopes" ON public.staff_member_branch_scopes;
DROP POLICY IF EXISTS "Staff permission can revoke staff branch scopes" ON public.staff_member_branch_scopes;

DO $$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'staff_member_branch_scopes'
    AND policyname LIKE 'Staff permission can % staff branch scopes';
  IF v_left <> 0 THEN
    RAISE EXCEPTION '253 ROLLBACK CHECK FAILED: % new policies remain', v_left;
  END IF;
END
$$;