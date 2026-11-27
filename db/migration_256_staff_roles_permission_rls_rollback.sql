-- 256 rollback: drops the three policies, the trigger and the function. Idempotent.
DROP POLICY IF EXISTS "Staff permission can create staff roles" ON public.staff_roles;
DROP POLICY IF EXISTS "Staff permission can update staff roles" ON public.staff_roles;
DROP POLICY IF EXISTS "Staff permission can delete staff roles" ON public.staff_roles;
DROP TRIGGER IF EXISTS trg_staff_roles_guard_staff_layer ON public.staff_roles;
DROP FUNCTION IF EXISTS public.staff_roles_guard_staff_layer();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'staff_roles'
               AND policyname LIKE 'Staff permission can % staff roles')
     OR EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgrelid = 'public.staff_roles'::regclass
                  AND tgname = 'trg_staff_roles_guard_staff_layer')
     OR to_regprocedure('public.staff_roles_guard_staff_layer()') IS NOT NULL THEN
    RAISE EXCEPTION '256 ROLLBACK CHECK FAILED: 256 objects remain';
  END IF;
END
$$;