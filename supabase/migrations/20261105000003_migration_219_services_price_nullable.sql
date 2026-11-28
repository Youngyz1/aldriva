-- migration_219_services_price_nullable.sql
-- Stage: Make services.price nullable (NULL = no listed price / "Price on request").
--
-- Owner applies this by hand; it is NOT applied by the agent.
-- Byte-identical mirror of db/migration_219_services_price_nullable.sql.

BEGIN;

ALTER TABLE public.services
  ALTER COLUMN price DROP NOT NULL;

COMMENT ON COLUMN public.services.price IS
  'Local display price for catalog. NULL means no listed price ("Price on request"). Stripe checkout not used for services.';

COMMIT;

NOTIFY pgrst, 'reload schema';
