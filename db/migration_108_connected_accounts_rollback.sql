-- migration_108_connected_accounts_rollback.sql
--
-- Rollback for migration_108: removes connected_accounts and its helper.

BEGIN;

DROP TRIGGER IF EXISTS trg_connected_accounts_updated_at ON connected_accounts;
DROP FUNCTION IF EXISTS update_connected_accounts_updated_at();
DROP TABLE IF EXISTS connected_accounts CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
