-- 251 verification: plain SQL, ONE result set. Expect ok = true on every row after apply;
-- after rollback rows 1, 2, 3 and 6 are false.
SELECT 1 AS n, 'guard function exists, SECURITY DEFINER, safe search_path' AS check_name,
  EXISTS (SELECT 1 FROM pg_proc p
          WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'staff_guard_status_change_rank'
            AND pg_get_function_identity_arguments(p.oid) = '' AND p.prosecdef
            AND array_to_string(p.proconfig, ',') LIKE '%search_path=pg_catalog, public, pg_temp%') AS ok
UNION ALL
SELECT 2, 'trigger exists, enabled, BEFORE UPDATE OF status',
  EXISTS (SELECT 1 FROM pg_trigger t
          WHERE t.tgrelid = 'public.staff_members'::regclass AND t.tgname = 'trg_staff_members_guard_status_rank'
            AND NOT t.tgisinternal AND t.tgenabled = 'O'
            AND pg_get_triggerdef(t.oid) LIKE '%BEFORE UPDATE OF status ON public.staff_members%')
UNION ALL
SELECT 3, 'guard function not executable by authenticated or anon',
  CASE WHEN to_regprocedure('public.staff_guard_status_change_rank()') IS NULL THEN false
       ELSE NOT (has_function_privilege('authenticated', 'public.staff_guard_status_change_rank()', 'EXECUTE')
              OR has_function_privilege('anon', 'public.staff_guard_status_change_rank()', 'EXECUTE')) END
UNION ALL
SELECT 4, 'six other staff_members triggers still enabled',
  (SELECT count(*) FROM pg_trigger t
   WHERE t.tgrelid = 'public.staff_members'::regclass AND NOT t.tgisinternal AND t.tgenabled = 'O'
     AND t.tgname IN ('trg_staff_audit_log_staff_member_lifecycle', 'trg_staff_members_guard_all_branches_change',
                      'trg_staff_members_guard_identity', 'trg_staff_members_guard_self_edit',
                      'trg_staff_members_updated_at', 'trg_staff_sync_primary_branch_scope')) = 6
UNION ALL
SELECT 5, 'rank helper present', to_regprocedure('public.staff_actor_platform_rank(uuid)') IS NOT NULL
UNION ALL
SELECT 6, 'body: actor-rank call, comparison, three sources, no status filter on the target',
  EXISTS (SELECT 1 FROM pg_proc p
          WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'staff_guard_status_change_rank'
            AND p.prosrc LIKE '%staff_actor_platform_rank(OLD.business_id)%'
            AND p.prosrc LIKE '%v_actor_rank < v_target_rank%'
            AND p.prosrc LIKE '%businesses%' AND p.prosrc LIKE '%entity_members%'
            AND p.prosrc LIKE '%staff_resolve_business_organizer(OLD.business_id)%'
            AND p.prosrc NOT LIKE '%sm.status = ''active''%')
ORDER BY n;