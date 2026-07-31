-- ============================================================================
-- 008_grants.sql — Table and function grants matching production.
--
-- Every new Supabase project already runs the equivalent of the block below
-- automatically as part of project bootstrap (it's how PostgREST gets access
-- to the `public` schema at all) — this file exists to make that explicit/
-- auditable and to set up ALTER DEFAULT PRIVILEGES so future tables inherit
-- it too, matching production and a fresh Supabase project's own template.
--
-- Run AFTER 005_enable_rls.sql / 006_rls_policies.sql — RLS policies are the
-- real access gate for anon/authenticated; these grants alone are wide open
-- to any table (this is normal Supabase architecture, matching production,
-- not a misconfiguration to fix here).
-- ============================================================================

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to postgres, anon, authenticated, service_role;

-- Production grants EXECUTE on all 19 public functions to anon + authenticated
-- + service_role via this same default-privilege mechanism, not per-function
-- review. The block above reproduces that faithfully. See RECOMMENDATIONS.md
-- (item 9) for optional, separately-evaluated narrowing of this — out of
-- scope for the migration itself.
