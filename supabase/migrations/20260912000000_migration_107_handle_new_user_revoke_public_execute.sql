-- 20260912000000_migration_107_handle_new_user_revoke_public_execute.sql
--
-- Supabase-CLI mirror of db/migration_107_handle_new_user_revoke_public_execute.sql
-- (identical body; the db/ file is canonical per CLAUDE.md). Kept in sync so
-- `supabase db push` deploys the same revoke as the manual db/ history.
--
-- P2 F-12: revoke direct EXECUTE on the signup trigger function from
-- anon/authenticated.
--
-- public.handle_new_user() is a trigger function on auth.users
-- (on_auth_user_created; defined in migration_07). It is never meant to be
-- called directly via /rest/v1/rpc/..., but it carries EXECUTE for anon and
-- authenticated through the Supabase bootstrap default privileges (plus the
-- explicit GRANT ALL lines in schema.sql) — AND, as production verification
-- showed, a direct grant to the PUBLIC pseudo-role, which every role
-- inherits regardless of the per-role revokes. Revoking from anon and
-- authenticated alone therefore left the function callable by everyone.
-- Direct calls are essentially inert (the function ignores arguments and
-- upserts a profiles row for NEW.id, which a direct call has none of), so
-- this is unnecessary public RPC surface, not a live exploit — removed on
-- principle, now including the PUBLIC grant that actually carried it.
--
-- Same safe pattern as migration_104: plain REVOKEs, not DROP+CREATE, so the
-- bootstrap ALTER DEFAULT PRIVILEGES cannot silently re-grant them (default
-- privileges apply only at CREATE time). service_role and postgres are
-- untouched — the trigger itself must keep executing on auth.users inserts
-- (trigger firing does not depend on PUBLIC EXECUTE).
--
-- Verified: no .rpc("handle_new_user") caller exists anywhere in app/, lib/
-- or components/ — the function fires only as a trigger.
--
-- Rollback: db/migration_107_handle_new_user_revoke_public_execute_rollback.sql
-- (restores public EXECUTE — emergency use only).

BEGIN;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

COMMIT;

NOTIFY pgrst, 'reload schema';
