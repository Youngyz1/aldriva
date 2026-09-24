-- migration_132_business_type_and_branches_rollback.sql
BEGIN;
DROP TRIGGER IF EXISTS trg_business_branches_updated_at ON business_branches;
DROP FUNCTION IF EXISTS update_business_branches_updated_at();
DROP TABLE IF EXISTS business_branches;
ALTER TABLE businesses DROP COLUMN IF EXISTS business_type;
COMMIT;
NOTIFY pgrst, 'reload schema';
