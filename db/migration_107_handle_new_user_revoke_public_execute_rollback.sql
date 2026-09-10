-- migration_107_handle_new_user_revoke_public_execute_rollback.sql
--
-- Emergency rollback for migration_107: restores EXECUTE on
-- public.handle_new_user() to anon and authenticated (the pre-F-12 state).
-- Re-opens unnecessary public RPC surface on a trigger function — use only
-- to restore availability if the 107 revoke itself causes an outage
-- (unexpected; no direct caller exists); re-apply 107 as soon as possible.

BEGIN;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;

COMMIT;

NOTIFY pgrst, 'reload schema';
