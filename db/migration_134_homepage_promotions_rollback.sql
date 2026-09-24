-- migration_134_homepage_promotions_rollback.sql
-- Rollback for migration_134_homepage_promotions.sql

BEGIN;

DROP TRIGGER IF EXISTS trg_enforce_homepage_promotion_moderation ON homepage_promotions;
DROP FUNCTION IF EXISTS enforce_homepage_promotion_moderation_fields();

DROP TRIGGER IF EXISTS trg_enforce_homepage_promotion_status_transition ON homepage_promotions;
DROP FUNCTION IF EXISTS enforce_homepage_promotion_status_transition();

DROP TRIGGER IF EXISTS trg_homepage_promotions_updated_at ON homepage_promotions;
DROP FUNCTION IF EXISTS update_homepage_promotions_updated_at();

DROP TABLE IF EXISTS homepage_promotions;

COMMIT;

NOTIFY pgrst, 'reload schema';
