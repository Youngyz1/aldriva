-- migration_219_services_price_nullable_rollback.sql
-- Fail-closed rollback for migration 219.
--
-- Restores the NOT NULL constraint on services.price.
-- Operators should backfill any NULL prices before running this rollback.

BEGIN;

ALTER TABLE public.services
  ALTER COLUMN price SET NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
