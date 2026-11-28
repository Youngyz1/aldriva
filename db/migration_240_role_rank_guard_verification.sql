-- ============================================================
-- Companion verification for migration_240_role_rank_guard.sql.
-- Read-only. Run AFTER the forward migration.
-- ============================================================

-- 1. Rank helper: SECURITY DEFINER, authenticated yes, anon no.
SELECT p.proname, p.prosecdef,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'staff_actor_platform_rank';
-- Expect 1 row: true / true / false.

-- 2. Privileged guard: replaced (calls the rank helper, old text gone), not executable by clients.
SELECT p.prosecdef,
       p.prosrc LIKE '%staff_actor_platform_rank%' AS uses_rank,
       p.prosrc NOT LIKE '%head office%' AS old_text_gone,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'staff_guard_privileged_role';
-- Expect: true / true / true / false.

-- 3. Triggers: staff_member_roles widened, invitations unchanged, both enabled.
SELECT tgrelid::regclass AS tbl, tgname, tgenabled, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgname IN ('trg_staff_member_roles_guard_privileged','trg_staff_invitations_guard_privileged')
ORDER BY tgname;
-- Expect 2 rows, tgenabled 'O'. staff_member_roles def: UPDATE OF role_id, is_active.
-- staff_invitations def: UPDATE OF role_id.

-- 4. Invitation INSERT policy now requires pending / unaccepted.
SELECT polname, polcmd,
       pg_get_expr(polwithcheck, polrelid) LIKE '%pending%' AS requires_pending,
       pg_get_expr(polwithcheck, polrelid) LIKE '%accepted_by IS NULL%' AS requires_no_accepted_by
FROM pg_policy
WHERE polrelid = 'public.staff_invitations'::regclass AND polcmd = 'a';
-- Expect 1 row: true / true.

-- 5. Rank with no session is 0.
SELECT public.staff_actor_platform_rank((SELECT id FROM public.businesses LIMIT 1)) AS no_session_rank;
-- Expect 0.

-- 6. Other staff_invitations policies untouched (still 4 total: select, insert, update, delete).
SELECT count(*) AS policy_count FROM pg_policy WHERE polrelid = 'public.staff_invitations'::regclass;
-- Expect 4.