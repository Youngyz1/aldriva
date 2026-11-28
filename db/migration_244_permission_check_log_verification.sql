-- 1. Columns (expect 7: id, business_id, actor_user_id, permission_key, branch_id, source, created_at)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='staff_permission_check_logs'
ORDER BY ordinal_position;

-- 2. RLS on, exactly 1 policy, command r
SELECT c.relrowsecurity, count(p.polname) AS policies, string_agg(p.polcmd::text, ',') AS cmd
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.oid = 'public.staff_permission_check_logs'::regclass
GROUP BY c.relrowsecurity;

-- 3. Privileges (expect t, f, f, f, f)
SELECT has_table_privilege('authenticated','public.staff_permission_check_logs','SELECT') AS auth_select,
       has_table_privilege('authenticated','public.staff_permission_check_logs','INSERT') AS auth_insert,
       has_table_privilege('authenticated','public.staff_permission_check_logs','UPDATE') AS auth_update,
       has_table_privilege('authenticated','public.staff_permission_check_logs','DELETE') AS auth_delete,
       has_table_privilege('anon','public.staff_permission_check_logs','SELECT')          AS anon_select;

-- 4. Trigger enabled (expect 1 row, tgenabled O)
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid='public.staff_permission_check_logs'::regclass AND NOT tgisinternal;

-- 5. Writer (expect t, t, f)
SELECT prosecdef,
       has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('anon', oid, 'EXECUTE')          AS anon_can_exec
FROM pg_proc WHERE proname='staff_log_permission_check' AND pronamespace='public'::regnamespace;

-- 6. Indexes (expect 3: pkey + 2)
SELECT count(*) AS indexes FROM pg_indexes
WHERE schemaname='public' AND tablename='staff_permission_check_logs';

-- 7. Rows so far (expect 0 on first apply)
SELECT count(*) AS rows_so_far FROM public.staff_permission_check_logs;