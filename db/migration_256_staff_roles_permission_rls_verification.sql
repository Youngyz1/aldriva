-- 256 verification: plain SQL, ONE result set.
-- After apply every row is true. After rollback rows 2-8 and 10 are false; 1 and 9 stay true.
SELECT 1 AS n, 'RLS enabled on staff_roles' AS check_name,
  (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.staff_roles'::regclass) AS ok
UNION ALL
SELECT 2, 'three new policies exist',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'staff_roles'
     AND policyname IN ('Staff permission can create staff roles',
                        'Staff permission can update staff roles',
                        'Staff permission can delete staff roles')) = 3
UNION ALL
SELECT 3, 'new policies use staff_has_permission with workforce.roles.manage',
  (SELECT count(*) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_roles'
     AND p.policyname LIKE 'Staff permission can % staff roles'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%staff_has_permission%'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%workforce.roles.manage%') = 3
UNION ALL
SELECT 4, 'new policies pin role_scope = business',
  (SELECT count(*) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_roles'
     AND p.policyname LIKE 'Staff permission can % staff roles'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%role_scope = ''business''%') = 3
UNION ALL
SELECT 5, 'new policies are for authenticated only',
  (SELECT count(*) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_roles'
     AND p.policyname LIKE 'Staff permission can % staff roles'
     AND p.roles = ARRAY['authenticated']::name[]) = 3
UNION ALL
SELECT 6, 'new policy set is exactly INSERT, UPDATE, DELETE (no SELECT)',
  (SELECT count(DISTINCT p.cmd) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_roles'
     AND p.policyname LIKE 'Staff permission can % staff roles'
     AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE')) = 3
UNION ALL
SELECT 7, 'guard function exists, SECURITY DEFINER, EXECUTE revoked',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'staff_roles_guard_staff_layer' AND p.prosecdef)
  AND NOT has_function_privilege('authenticated', 'public.staff_roles_guard_staff_layer()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.staff_roles_guard_staff_layer()', 'EXECUTE')
UNION ALL
SELECT 8, 'guard trigger exists, enabled, BEFORE UPDATE OF',
  EXISTS (SELECT 1 FROM pg_trigger t
          WHERE t.tgrelid = 'public.staff_roles'::regclass
            AND t.tgname = 'trg_staff_roles_guard_staff_layer' AND t.tgenabled = 'O'
            AND pg_get_triggerdef(t.oid) LIKE '%BEFORE UPDATE OF%')
UNION ALL
SELECT 9, 'eight pre-existing policies still present',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'staff_roles'
     AND (policyname IN ('Business managers can delete custom staff roles',
                         'Business owner can delete custom staff roles',
                         'Business managers can create custom staff roles',
                         'Business owner can create custom staff roles',
                         'Business owner can read custom staff roles',
                         'Business managers can update custom staff roles',
                         'Business owner can update custom staff roles')
          OR policyname LIKE 'Staff roles are readable by business members%')) = 8
UNION ALL
SELECT 10, 'two user triggers on staff_roles (updated_at, guard)',
  (SELECT count(*) FROM pg_trigger
   WHERE tgrelid = 'public.staff_roles'::regclass AND NOT tgisinternal AND tgenabled = 'O') = 2
ORDER BY n;