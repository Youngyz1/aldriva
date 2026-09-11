-- migration_109_channel_assets_rollback.sql
--
-- Rollback for migration_109: removes channel_assets and its helpers.

BEGIN;

DROP TRIGGER IF EXISTS trg_channel_assets_tenant_match ON channel_assets;
DROP FUNCTION IF EXISTS enforce_channel_asset_tenant_match();
DROP TRIGGER IF EXISTS trg_channel_assets_updated_at ON channel_assets;
DROP FUNCTION IF EXISTS update_channel_assets_updated_at();
DROP TABLE IF EXISTS channel_assets CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
