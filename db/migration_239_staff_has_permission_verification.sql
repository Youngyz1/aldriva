-- ============================================================
-- Companion verification for migration_239_staff_has_permission.sql.
-- Read-only. Run AFTER the forward migration.
-- ============================================================

-- 1. Both functions: SECURITY DEFINER, STABLE, search_path pinned.
SELECT p.proname, p.prosecdef, p.provolatile, p.proconfig
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('staff_has_permission','staff_is_accepting_own_invitation');
-- Expect 2 rows: prosecdef true, provolatile 's', proconfig contains search_path=pg_catalog, public, pg_temp.

-- 2. Execute privileges: authenticated yes, anon no.
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('staff_has_permission','staff_is_accepting_own_invitation');
-- Expect 2 rows: true / false.

-- 3. Accept-fields guard: INVOKER, not executable by authenticated/anon.
SELECT p.proname, p.prosecdef,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'staff_invitations_guard_accept_fields';
-- Expect 1 row: prosecdef false, false, false.

-- 4. Guard trigger exists and is enabled.
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'public.staff_invitations'::regclass
  AND tgname = 'trg_staff_invitations_guard_accept_fields';
-- Expect 1 row, tgenabled 'O', def = BEFORE UPDATE ... FOR EACH ROW.

-- 5. Smoke test with no session (auth.uid() is NULL): must be false.
SELECT public.staff_has_permission((SELECT id FROM public.businesses LIMIT 1), 'workforce.view', NULL) AS no_session_result;
-- Expect false.

-- 6. Helper with no session: must be false.
SELECT public.staff_is_accepting_own_invitation(
  (SELECT id FROM public.businesses LIMIT 1), gen_random_uuid(), NULL) AS helper_no_session;
-- Expect false.