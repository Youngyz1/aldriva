-- migration_131_website_atomic_creation_rollback.sql
-- Rollback for atomic creation RPC

BEGIN;

DROP FUNCTION IF EXISTS public.create_website_from_template(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, JSONB, JSONB, JSONB);

COMMIT;

NOTIFY pgrst, 'reload schema';
