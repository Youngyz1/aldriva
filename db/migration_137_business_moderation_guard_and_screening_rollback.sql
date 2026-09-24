-- migration_137_business_moderation_guard_and_screening_rollback.sql
-- Rollback for migration_137: remove guard trigger, moderation events table, and screening columns

BEGIN;

DROP TRIGGER IF EXISTS trg_guard_business_owner_update ON businesses;
DROP FUNCTION IF EXISTS guard_business_owner_update();

DROP TABLE IF EXISTS business_moderation_events;

ALTER TABLE businesses DROP COLUMN IF EXISTS screening_risk_score;
ALTER TABLE businesses DROP COLUMN IF EXISTS screened_at;

-- Also drop the explicit check constraint if it remains (added via ADD COLUMN)
-- The constraint name is businesses_screening_risk_score_check; dropping column removes it.

COMMIT;

NOTIFY pgrst, 'reload schema';
