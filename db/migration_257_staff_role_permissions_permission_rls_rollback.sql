-- 257 rollback: drops only the three additive policies. Idempotent.
DROP POLICY IF EXISTS "Staff permission can read staff role permissions" ON public.staff_role_permissions;
DROP POLICY IF EXISTS "Staff permission can create staff role permissions" ON public.staff_role_permissions;
DROP POLICY IF EXISTS "Staff permission can delete staff role permissions" ON public.staff_role_permissions;

DO $$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'staff_role_permissions'
    AND policyname LIKE 'Staff permission can % staff role permissions';
  IF v_left <> 0 THEN
    RAISE EXCEPTION '257 ROLLBACK CHECK FAILED: % new policies remain', v_left;
  END IF;
END
$$;