-- migration_94_platform_content_type_rollback.sql
-- Restores the pre-platform CHECK constraint on ai_content_items.content_type.
-- NOTE: fails if any 'platform' rows exist — delete or reclassify them first.

BEGIN;

ALTER TABLE ai_content_items
  DROP CONSTRAINT IF EXISTS ai_content_items_content_type_check;

ALTER TABLE ai_content_items
  ADD CONSTRAINT ai_content_items_content_type_check
  CHECK (content_type IN ('event', 'fundraiser', 'business', 'article', 'product'));

COMMIT;

NOTIFY pgrst, 'reload schema';
