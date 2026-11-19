-- 1. expect 1 row, tgenabled O
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'public.staff_member_roles'::regclass AND tgname = 'trg_staff_member_roles_guard_delete_rank';
-- 2. expect auth_exec f
SELECT proname, has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_exec
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname = 'staff_guard_role_delete_rank';