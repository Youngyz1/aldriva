-- 252 rollback: drops only the four additive policies. Idempotent.
DROP POLICY IF EXISTS "Staff permission can read staff member roles" ON public.staff_member_roles;
DROP POLICY IF EXISTS "Staff permission can assign staff member roles" ON public.staff_member_roles;
DROP POLICY IF EXISTS "Staff permission can update staff member roles" ON public.staff_member_roles;
DROP POLICY IF EXISTS "Staff permission can remove staff member roles" ON public.staff_member_roles;

DO $$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'staff_member_roles'
    AND policyname LIKE 'Staff permission can % staff member roles';
  IF v_left <> 0 THEN
    RAISE EXCEPTION '252 ROLLBACK CHECK FAILED: % new policies remain', v_left;
  END IF;
END
$$;