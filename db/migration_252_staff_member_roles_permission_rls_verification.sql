-- 252 verification: plain SQL, ONE result set.
-- After apply every row is true. After rollback rows 2, 3, 4 and 5 are false; 1, 6 and 7 stay true.
SELECT 1 AS n, 'RLS enabled on staff_member_roles' AS check_name,
  (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.staff_member_roles'::regclass) AS ok
UNION ALL
SELECT 2, 'four new policies exist',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'staff_member_roles'
     AND policyname IN ('Staff permission can read staff member roles',
                        'Staff permission can assign staff member roles',
                        'Staff permission can update staff member roles',
                        'Staff permission can remove staff member roles')) = 4
UNION ALL
SELECT 3, 'SELECT policy: workforce.view, staff member in the row business',
  EXISTS (SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = 'staff_member_roles'
            AND p.policyname = 'Staff permission can read staff member roles' AND p.cmd = 'SELECT'
            AND p.qual LIKE '%staff_has_permission%' AND p.qual LIKE '%workforce.view%'
            AND p.qual LIKE '%sm.business_id = staff_member_roles.business_id%')
UNION ALL
SELECT 4, 'INSERT, UPDATE, DELETE policies: workforce.update, staff member in the row business',
  (SELECT count(*) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_member_roles'
     AND p.policyname IN ('Staff permission can assign staff member roles',
                          'Staff permission can update staff member roles',
                          'Staff permission can remove staff member roles')
     AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE')
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%staff_has_permission%'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%workforce.update%'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%sm.business_id = staff_member_roles.business_id%') = 3
UNION ALL
SELECT 5, 'all four new policies are for authenticated only',
  (SELECT count(*) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_member_roles'
     AND p.policyname LIKE 'Staff permission can % staff member roles'
     AND p.roles = ARRAY['authenticated']::name[]) = 4
UNION ALL
SELECT 6, 'eight pre-existing policies still present',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'staff_member_roles'
     AND policyname IN ('Business or branch managers can remove staff member roles',
                        'Business owner can remove staff member roles',
                        'Business or branch managers can assign staff member roles',
                        'Business owner can assign staff member roles',
                        'Business owner can read staff member roles',
                        'Staff member roles are readable by business, branch manager, or',
                        'Business or branch managers can update staff member roles',
                        'Business owner can update staff member roles')) = 8
UNION ALL
SELECT 7, 'staff_has_permission(uuid,text,uuid) present',
  to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NOT NULL
ORDER BY n;