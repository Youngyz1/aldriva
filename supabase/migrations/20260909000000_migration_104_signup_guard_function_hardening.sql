-- 20260909000000_migration_104_signup_guard_function_hardening.sql
--
-- Supabase-CLI mirror of db/migration_104_signup_guard_function_hardening.sql
-- (identical body; the db/ file is canonical per CLAUDE.md). Kept in sync so
-- `supabase db push` deploys the same hardening as the manual db/ history.
--
-- P1 F-05: harden public.check_email_pending_deletion(text).
--
-- Issues closed (function changes only — no table, policy, or column changes):
--   1. The function is SECURITY DEFINER with no SET search_path, unlike the
--      repo's pinned convention (handle_new_user, ticket RPCs). A caller able
--      to manipulate search_path could redirect the unqualified references in
--      the body. Fixed with ALTER ... SET search_path = public (in place, so
--      existing grants are preserved and the body is untouched).
--   2. The function was directly callable via /rest/v1/rpc/... by anon and
--      authenticated through the Supabase bootstrap default privileges
--      (GRANT ALL ON ROUTINES ... TO anon, authenticated). Combined with the
--      different response shape for in-flow emails, that is an
--      account-enumeration oracle. Fixed with REVOKE EXECUTE FROM anon,
--      authenticated. The only in-repo caller, POST /api/signup-guard, uses
--      the service-role client (lib/dashboard-context.ts), which is
--      unaffected. ALTER (not DROP+CREATE) is used deliberately so the
--      bootstrap ALTER DEFAULT PRIVILEGES does not re-grant on recreate.
--
-- Verified compatible:
--   * /api/signup-guard calls via supabaseAdmin (service_role key) — unaffected.
--   * No client-side (anon-key) direct rpc() call exists in the repo.
--   * Body references auth.users schema-qualified; now() is pg_catalog — both
--     resolve identically under search_path = public.
--
-- Rollback: db/migration_104_signup_guard_function_hardening_rollback.sql
-- (re-opens the oracle + hijack gap — emergency use only).

BEGIN;

-- 1. Pin search_path on the definer function (repo convention).
ALTER FUNCTION public.check_email_pending_deletion(text) SET search_path = public;

-- 2. Remove direct public RPC access; service_role is untouched.
REVOKE EXECUTE ON FUNCTION public.check_email_pending_deletion(text) FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
