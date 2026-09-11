-- migration_110_customer_identities_rollback.sql
--
-- Rollback for migration_110.

BEGIN;

DROP TRIGGER IF EXISTS trg_customer_identities_updated_at ON customer_identities;
DROP FUNCTION IF EXISTS update_customer_identities_updated_at();
DROP TABLE IF EXISTS customer_identities CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
