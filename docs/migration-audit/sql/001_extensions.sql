-- ============================================================================
-- 001_extensions.sql — Extensions required to recreate the public schema
-- ============================================================================
-- Source: production audit via `list_extensions` (read-only). Only these are
-- INSTALLED in production and relevant to schema recreation; dozens more are
-- merely AVAILABLE and not installed (postgis, pgvector, pg_cron, etc. — not
-- used anywhere in this codebase's schema/functions).

create extension if not exists pgcrypto with schema extensions;
-- Provides gen_random_uuid(), used as the DEFAULT on every table's id column
-- (all 28 application tables). This is the one hard schema dependency.

create extension if not exists "uuid-ossp" with schema extensions;
-- Installed in production but NOT referenced by any column default in the
-- audited schema (every default uses gen_random_uuid(), not uuid_generate_v4()).
-- Included only for parity with production; safe to omit if strict.

-- NOT included here (Supabase-managed, provisioned automatically per project,
-- do not attempt to install manually):
--   supabase_vault   (schema vault)
--   pg_stat_statements (schema extensions) — observability only, no schema dependency
--   plpgsql (schema pg_catalog) — always present in any Postgres database
