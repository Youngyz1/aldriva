-- Rollback for migration 42: remove the import provenance/display columns.
-- Destructive — drops any recorded source/likes/batch data on donations & comments.

DROP INDEX IF EXISTS idx_donations_import_batch;
DROP INDEX IF EXISTS idx_comments_import_batch;

ALTER TABLE donations DROP COLUMN IF EXISTS source;
ALTER TABLE donations DROP COLUMN IF EXISTS import_batch_id;

ALTER TABLE comments DROP COLUMN IF EXISTS source;
ALTER TABLE comments DROP COLUMN IF EXISTS likes;
ALTER TABLE comments DROP COLUMN IF EXISTS import_batch_id;

NOTIFY pgrst, 'reload schema';
