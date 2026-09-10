-- migration_104_signup_guard_function_hardening_rollback.sql
--
-- Emergency rollback for migration_104: restores the pre-F-05 state
-- (unpinned search_path, public EXECUTE) and therefore RE-OPENS the F-05
-- search_path-hijack gap and the account-enumeration oracle. Use only to
-- restore /api/signup-guard availability if the 104 migration itself causes
-- an outage; re-apply 104 as soon as possible.

BEGIN;

ALTER FUNCTION public.check_email_pending_deletion(text) RESET search_path;

GRANT EXECUTE ON FUNCTION public.check_email_pending_deletion(text) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
