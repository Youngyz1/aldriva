-- Rollback for migration_47_gofundme_source_columns.sql

DROP INDEX IF EXISTS fundraisers_gofundme_source_id_key;

ALTER TABLE fundraisers
  DROP COLUMN IF EXISTS source_url,
  DROP COLUMN IF EXISTS gofundme_source_id;

NOTIFY pgrst, 'reload schema';
