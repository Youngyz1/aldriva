-- 254 verification: plain SQL, ONE result set.
-- After apply every row is true. After rollback rows 1-4 are false; 5, 6 stay true.
SELECT 1 AS n, 'guard function exists, SECURITY DEFINER' AS check_name,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'staff_member_branch_scopes_guard_escalation'
            AND p.prosecdef) AS ok
UNION ALL
SELECT 2, 'EXECUTE revoked from authenticated and anon',
  to_regprocedure('public.staff_member_branch_scopes_guard_escalation()') IS NOT NULL
  AND NOT has_function_privilege('authenticated', 'public.staff_member_branch_scopes_guard_escalation()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.staff_member_branch_scopes_guard_escalation()', 'EXECUTE')
UNION ALL
SELECT 3, 'trigger exists, enabled, BEFORE INSERT OR UPDATE OF',
  EXISTS (SELECT 1 FROM pg_trigger t
          WHERE t.tgrelid = 'public.staff_member_branch_scopes'::regclass
            AND t.tgname = 'trg_staff_member_branch_scopes_guard_escalation'
            AND t.tgenabled = 'O'
            AND pg_get_triggerdef(t.oid) LIKE '%BEFORE INSERT OR UPDATE OF%')
UNION ALL
SELECT 4, 'three user triggers on the table (audit, primary-delete guard, escalation guard)',
  (SELECT count(*) FROM pg_trigger
   WHERE tgrelid = 'public.staff_member_branch_scopes'::regclass AND NOT tgisinternal) = 3
UNION ALL
SELECT 5, 'three 253 policies still present',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'staff_member_branch_scopes'
     AND policyname LIKE 'Staff permission can % staff branch scopes') = 3
UNION ALL
SELECT 6, 'audit and primary-delete triggers still enabled',
  (SELECT count(*) FROM pg_trigger
   WHERE tgrelid = 'public.staff_member_branch_scopes'::regclass
     AND tgname IN ('trg_staff_audit_log_branch_scopes', 'trg_staff_member_branch_scopes_guard_primary_delete')
     AND tgenabled = 'O') = 2
ORDER BY n;