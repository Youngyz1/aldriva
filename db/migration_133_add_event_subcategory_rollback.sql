-- migration_133_add_event_subcategory_rollback.sql
BEGIN;
DROP INDEX IF EXISTS idx_events_category_subcategory;
DROP INDEX IF EXISTS idx_events_subcategory;
DROP INDEX IF EXISTS idx_events_category;
ALTER TABLE events DROP COLUMN IF EXISTS subcategory;
COMMIT;
NOTIFY pgrst, 'reload schema';
