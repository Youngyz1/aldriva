-- migration_112_ai_provider_configs_rollback.sql
--
-- Rollback for migration_112.

BEGIN;

DROP TRIGGER IF EXISTS trg_ai_provider_configs_updated_at ON ai_provider_configs;
DROP FUNCTION IF EXISTS update_ai_provider_configs_updated_at();
DROP TABLE IF EXISTS ai_provider_configs CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
