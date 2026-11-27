-- 1. expect 3 policies
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='staff_members' AND policyname LIKE 'Staff permission can %' ORDER BY cmd;
-- 2. expect total 11 policies on staff_members (8 old + 3 new)
SELECT count(*) AS total_policies FROM pg_policies WHERE schemaname='public' AND tablename='staff_members';
-- 3. expect O
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid='public.staff_members'::regclass AND tgname='trg_staff_members_guard_identity';
-- 4. expect auth_exec f
SELECT proname, has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_exec
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='staff_members_guard_identity';