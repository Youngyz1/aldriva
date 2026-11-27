-- 257 verification: plain SQL, ONE result set.
-- After apply every row is true. After rollback rows 2, 3, 4, 6 are false; 1, 5, 7, 8, 9, 10 stay true.
SELECT 1 AS n, 'RLS enabled on staff_role_permissions' AS check_name,
  (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.staff_role_permissions'::regclass) AS ok
UNION ALL
SELECT 2, 'three new policies exist',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'staff_role_permissions'
     AND policyname IN ('Staff permission can read staff role permissions',
                        'Staff permission can create staff role permissions',
                        'Staff permission can delete staff role permissions')) = 3
UNION ALL
SELECT 3, 'SELECT policy: roles.view or roles.manage, business-role pin',
  EXISTS (SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = 'staff_role_permissions'
            AND p.policyname = 'Staff permission can read staff role permissions' AND p.cmd = 'SELECT'
            AND p.qual LIKE '%staff_has_permission%'
            AND p.qual LIKE '%workforce.roles.view%'
            AND p.qual LIKE '%workforce.roles.manage%'
            AND p.qual LIKE '%role_scope = ''business''%')
UNION ALL
SELECT 4, 'INSERT and DELETE policies: roles.manage only, business-role pin',
  (SELECT count(*) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_role_permissions'
     AND p.policyname IN ('Staff permission can create staff role permissions',
                          'Staff permission can delete staff role permissions')
     AND p.cmd IN ('INSERT', 'DELETE')
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%staff_has_permission%'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%workforce.roles.manage%'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) NOT LIKE '%workforce.roles.view%'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%role_scope = ''business''%') = 2
UNION ALL
SELECT 5, 'no Staff permission UPDATE or ALL policy',
  NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'staff_role_permissions'
                AND cmd IN ('UPDATE', 'ALL') AND policyname LIKE 'Staff permission%')
UNION ALL
SELECT 6, 'all three new policies are for authenticated only',
  (SELECT count(*) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_role_permissions'
     AND p.policyname LIKE 'Staff permission can % staff role permissions'
     AND p.roles = ARRAY['authenticated']::name[]) = 3
UNION ALL
SELECT 7, 'three pre-existing policies still present',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'staff_role_permissions'
     AND policyname IN ('Business managers can map permissions to their custom roles',
                        'Business owner can map permissions to custom roles',
                        'Staff role permissions are readable by role scope')) = 3
UNION ALL
SELECT 8, 'audit and escalation-guard triggers still enabled',
  (SELECT count(*) FROM pg_trigger
   WHERE tgrelid = 'public.staff_role_permissions'::regclass
     AND tgname IN ('trg_staff_audit_log_staff_role_permissions',
                    'trg_staff_role_permissions_guard_escalation')
     AND tgenabled = 'O') = 2
UNION ALL
SELECT 9, 'staff_has_permission(uuid,text,uuid) present',
  to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NOT NULL
UNION ALL
SELECT 10, 'staff_guard_permission_escalation() present',
  to_regprocedure('public.staff_guard_permission_escalation()') IS NOT NULL
ORDER BY n;